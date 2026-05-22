// ─── THINK: Scoring Engine ──────────────────────────────
// Production lead scoring: Lead Score, Signal Score, Reply Prob, Conversion Prob, Spam Risk
// Uses signal intelligence + memory + historical data for compound scoring

import { BaseAgent } from '../base';
import { AgentContext } from '../types';
import { db } from '@/lib/db';

export interface LeadScores {
  leadScore: number;        // 0-100 composite
  signalScore: number;      // 0-100 signal strength
  replyProb: number;        // 0-1 reply probability
  conversionProb: number;   // 0-1 conversion probability
  spamRisk: number;         // 0-1 spam risk
  priorityTier: 'hot' | 'warm' | 'cold';
  reasoning: string;
  breakdown: {
    signalContribution: number;    // How much signals contributed
    memoryContribution: number;    // How much historical memory contributed
    industryContribution: number;  // How much industry benchmark contributed
    personaContribution: number;   // How much persona match contributed
  };
}

interface ScoringInput {
  forceRescore?: boolean;
}

export class ScoringEngine extends BaseAgent<ScoringInput, LeadScores> {
  readonly name = 'ScoringEngine';
  readonly phase = 'think' as const;
  readonly description = 'Multi-factor lead scoring with signal, memory, industry, and persona contributions';

  async execute(input: ScoringInput, context: AgentContext): Promise<LeadScores> {
    const leadId = context.leadId;

    // 1. Check if we already have a recent score (skip if < 1 hour old)
    if (!input.forceRescore) {
      const recentScore = await db.leadScoreHistory.findFirst({
        where: { leadId },
        orderBy: { createdAt: 'desc' },
      });
      if (recentScore && Date.now() - new Date(recentScore.createdAt).getTime() < 3600000) {
        return {
          leadScore: recentScore.leadScore,
          signalScore: recentScore.signalScore,
          replyProb: recentScore.replyProb,
          conversionProb: recentScore.conversionProb,
          spamRisk: recentScore.spamRisk,
          priorityTier: recentScore.priorityTier as LeadScores['priorityTier'],
          reasoning: 'Using cached score (< 1 hour old)',
          breakdown: { signalContribution: 0.4, memoryContribution: 0.2, industryContribution: 0.2, personaContribution: 0.2 },
        };
      }
    }

    // 2. Gather all data
    const signals = await db.signal.findMany({ where: { leadId } });
    const messages = await db.outreachMessage.findMany({ where: { leadId } });
    const replies = await db.replyClassification.findMany({
      where: { message: { leadId } },
    });
    const memory = await db.agentMemory.findMany({
      where: { OR: [{ leadId }, { industry: context.lead.company || undefined }, { persona: context.lead.title || undefined }] },
      take: 20,
      orderBy: { score: 'desc' },
    });

    // 3. Compute Signal Score (0-100)
    const signalScore = computeSignalScore(signals);

    // 4. Compute Spam Risk (0-1)
    const spamRisk = computeSpamRisk(context, messages);

    // 5. Compute Reply Probability (0-1)
    const replyProb = computeReplyProbability(context, signals, messages, replies, memory);

    // 6. Compute Conversion Probability (0-1)
    const conversionProb = computeConversionProbability(context, signals, replies, memory);

    // 7. Compute composite Lead Score (0-100)
    const { leadScore, breakdown } = computeLeadScore(signalScore, replyProb, conversionProb, spamRisk, memory, context);

    // 8. Determine priority tier
    const priorityTier = leadScore >= 70 ? 'hot' as const : leadScore >= 40 ? 'warm' as const : 'cold' as const;

    // 9. Save score to history
    await db.leadScoreHistory.create({
      data: {
        leadScore, signalScore, replyProb, conversionProb, spamRisk, priorityTier,
        reason: input.forceRescore ? 'Manual rescore' : 'Automatic scoring',
        scoringVersion: 'v2',
        leadId,
      },
    });

    // 10. Update lead with scores
    await db.lead.update({
      where: { id: leadId },
      data: { leadScore, signalScore, replyProb, conversionProb, spamRisk, priorityTier },
    });

    // 11. Log activity
    await db.activity.create({
      data: {
        type: 'scored',
        description: `Lead scored: ${leadScore.toFixed(0)}/100 (${priorityTier}). Signal: ${signalScore.toFixed(0)}, Reply prob: ${(replyProb * 100).toFixed(0)}%, Spam risk: ${(spamRisk * 100).toFixed(0)}%`,
        phase: 'think',
        leadId,
        metadata: JSON.stringify({ leadScore, signalScore, replyProb, conversionProb, spamRisk, priorityTier, breakdown }),
      },
    });

    return {
      leadScore, signalScore, replyProb, conversionProb, spamRisk, priorityTier,
      reasoning: `Scored based on ${signals.length} signals, ${messages.length} messages, ${replies.length} replies, ${memory.length} memory entries`,
      breakdown,
    };
  }
}

// ─── Signal Score Computation ──────────────────────────
function computeSignalScore(signals: Array<{ urgency: number; relevance: number; confidence: number; type: string }>): number {
  if (signals.length === 0) return 10; // Baseline for new leads

  const now = Date.now();
  let weightedSum = 0;
  let totalWeight = 0;

  for (const signal of signals) {
    // Weight by urgency * confidence * relevance
    const weight = (signal.urgency || 0.5) * (signal.confidence || 0.5) * (signal.relevance || 0.5);
    weightedSum += weight * 100;
    totalWeight += weight;
  }

  const baseScore = totalWeight > 0 ? weightedSum / totalWeight : 20;

  // Bonus for signal count (diminishing returns)
  const countBonus = Math.min(20, signals.length * 5);

  // Bonus for having high-urgency signals
  const highUrgencyCount = signals.filter(s => s.urgency >= 0.7).length;
  const urgencyBonus = Math.min(15, highUrgencyCount * 7);

  return Math.min(100, Math.round(baseScore * 0.5 + countBonus + urgencyBonus));
}

// ─── Spam Risk Computation ─────────────────────────────
function computeSpamRisk(context: AgentContext, messages: Array<{ status: string; bouncedAt: Date | null }>): number {
  let risk = 0;

  // Free email domains have higher spam risk for B2B
  const domain = context.lead.email.split('@')[1];
  const freeDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com'];
  if (freeDomains.includes(domain)) risk += 0.15;

  // No company info increases risk
  if (!context.lead.company) risk += 0.1;
  if (!context.lead.title) risk += 0.05;

  // Previous bounces increase risk
  const bounceCount = messages.filter(m => m.bouncedAt || m.status === 'bounced').length;
  risk += Math.min(0.3, bounceCount * 0.15);

  // DNC or blacklist flags
  if (context.lead.doNotContact) risk += 0.5;
  if (context.lead.isBlacklisted) risk += 0.5;

  // Too many previous sends without replies
  const sentCount = messages.filter(m => m.status === 'sent').length;
  const replyCount = messages.filter(m => m.status === 'replied').length;
  if (sentCount > 3 && replyCount === 0) risk += 0.1;

  return Math.min(1, risk);
}

// ─── Reply Probability Computation ─────────────────────
function computeReplyProbability(
  context: AgentContext,
  signals: Array<{ urgency: number; type: string; confidence: number }>,
  messages: Array<{ status: string }>,
  replies: Array<{ category: string; confidence: number }>,
  memory: Array<{ category: string; key: string; score: number }>
): number {
  let prob = 0.15; // Baseline

  // High-urgency signals increase reply probability
  const maxUrgency = signals.length > 0 ? Math.max(...signals.map(s => s.urgency || 0)) : 0;
  prob += maxUrgency * 0.3;

  // Multiple signal types increase probability
  const uniqueTypes = new Set(signals.map(s => s.type));
  prob += Math.min(0.15, uniqueTypes.size * 0.03);

  // Previous positive replies for this lead
  const positiveReplies = replies.filter(r => r.category === 'interested').length;
  prob += Math.min(0.2, positiveReplies * 0.1);

  // Memory-based adjustments
  const replyRateMemory = memory.filter(m => m.category === 'reply_rate' && m.score > 0.5);
  if (replyRateMemory.length > 0) {
    const avgScore = replyRateMemory.reduce((s, m) => s + m.score, 0) / replyRateMemory.length;
    prob += avgScore * 0.1;
  }

  // Persona match from memory
  const personaMemory = memory.filter(m => m.category === 'persona_pattern' && m.score > 0.6);
  if (personaMemory.length > 0) prob += 0.05;

  // Title seniority increases reply probability
  const title = (context.lead.title || '').toLowerCase();
  if (title.includes('vp') || title.includes('director') || title.includes('head') || title.includes('chief')) {
    prob += 0.05;
  }

  // If already sent and no reply, lower probability
  const sentNoReply = messages.filter(m => m.status === 'sent').length;
  if (sentNoReply > 0) prob -= 0.1;

  return Math.min(0.95, Math.max(0.05, prob));
}

// ─── Conversion Probability Computation ────────────────
function computeConversionProbability(
  context: AgentContext,
  signals: Array<{ urgency: number; type: string }>,
  replies: Array<{ category: string }>,
  memory: Array<{ category: string; score: number }>
): number {
  let prob = 0.05; // Baseline conversion is low

  // Strong signals increase conversion probability
  const strongSignals = signals.filter(s => s.urgency >= 0.7);
  prob += Math.min(0.3, strongSignals.length * 0.1);

  // Specific signal types that correlate with conversion
  const conversionSignals = signals.filter(s =>
    ['funding_round', 'hiring_spike', 'pain_point', 'expansion', 'product_launch'].includes(s.type)
  );
  prob += Math.min(0.15, conversionSignals.length * 0.05);

  // Previous interested replies
  const interestedReplies = replies.filter(r => r.category === 'interested').length;
  prob += Math.min(0.3, interestedReplies * 0.15);

  // Memory: industry-specific winning patterns
  const industryWins = memory.filter(m => m.category === 'industry_pattern' && m.score > 0.6);
  prob += Math.min(0.1, industryWins.length * 0.03);

  // Memory: winning hooks
  const winningHooks = memory.filter(m => m.category === 'winning_hook' && m.score > 0.7);
  prob += Math.min(0.1, winningHooks.length * 0.02);

  // Company presence (has website, LinkedIn)
  if (context.lead.url) prob += 0.03;
  if (context.lead.linkedinUrl) prob += 0.02;

  return Math.min(0.8, Math.max(0.01, prob));
}

// ─── Composite Lead Score ──────────────────────────────
function computeLeadScore(
  signalScore: number,
  replyProb: number,
  conversionProb: number,
  spamRisk: number,
  memory: Array<{ category: string; score: number }>,
  context: AgentContext,
): { leadScore: number; breakdown: LeadScores['breakdown'] } {
  // Weights for each factor
  const weights = { signal: 0.4, memory: 0.2, industry: 0.2, persona: 0.2 };

  // Signal contribution (0-100, already scaled)
  const signalContribution = signalScore * weights.signal;

  // Memory contribution
  const memoryScore = memory.length > 0
    ? memory.reduce((s, m) => s + m.score, 0) / memory.length * 100
    : 30; // Default for new leads
  const memoryContribution = memoryScore * weights.memory;

  // Industry contribution (simplified: based on company existence and memory)
  const industryScore = context.lead.company ? 60 : 30;
  const industryContribution = industryScore * weights.industry;

  // Persona contribution (based on title match and memory)
  const personaScore = context.lead.title ? 55 : 25;
  const personaContribution = personaScore * weights.persona;

  // Base score from all contributions
  let leadScore = signalContribution + memoryContribution + industryContribution + personaContribution;

  // Boost for high reply/conversion probability
  leadScore += replyProb * 15;
  leadScore += conversionProb * 10;

  // Penalty for spam risk
  leadScore -= spamRisk * 25;

  return {
    leadScore: Math.min(100, Math.max(0, Math.round(leadScore))),
    breakdown: {
      signalContribution: weights.signal,
      memoryContribution: weights.memory,
      industryContribution: weights.industry,
      personaContribution: weights.persona,
    },
  };
}
