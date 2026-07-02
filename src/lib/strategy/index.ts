import { db } from '@/lib/db';
import { Lead, Signal, OutreachMessage, ReplyClassification, AgentMemory, Campaign } from '@prisma/client';
import { StrategyName, StrategyRecommendation, StrategyContext, CooldownCheckResult } from './types';

export function matchesPersonaPattern(title?: string | null): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  const targetKeywords = ['cto', 'vp', 'director', 'manager', 'founder', 'ceo', 'head of', 'lead'];
  return targetKeywords.some(keyword => t.includes(keyword));
}

export function checkOverallLeadCooldown(lead: Lead, cooldownDays: number = 3): CooldownCheckResult {
  if (lead.lastContacted) {
    const msSinceLastContact = Date.now() - new Date(lead.lastContacted).getTime();
    const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
    if (msSinceLastContact < cooldownMs) {
      const daysRemaining = ((cooldownMs - msSinceLastContact) / (24 * 60 * 60 * 1000)).toFixed(1);
      return {
        onCooldown: true,
        reason: `Lead is on overall contact cooldown. Last contacted ${new Date(lead.lastContacted).toISOString()}. Cooldown ends in ${daysRemaining} days.`,
      };
    }
  }
  return { onCooldown: false };
}

export function checkStrategyCooldown(
  strategy: StrategyName,
  previousMessages: OutreachMessage[] = [],
  cooldownDays: number = 30
): CooldownCheckResult {
  const now = Date.now();
  const strategyMsgs = previousMessages.filter(
    m => m.strategy === strategy && (m.status === 'sent' || m.status === 'approved' || m.status === 'delivered')
  );

  for (const msg of strategyMsgs) {
    const dateToCheck = msg.sentAt || msg.createdAt;
    if (dateToCheck) {
      const msSinceSent = now - new Date(dateToCheck).getTime();
      const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
      if (msSinceSent < cooldownMs) {
        const daysRemaining = ((cooldownMs - msSinceSent) / (24 * 60 * 60 * 1000)).toFixed(1);
        return {
          onCooldown: true,
          reason: `Strategy "${strategy}" was executed recently (Message ID: ${msg.id}). Cooldown ends in ${daysRemaining} days.`,
        };
      }
    }
  }
  return { onCooldown: false };
}

export function shouldFollowUp(previousMessages: OutreachMessage[], campaign: Campaign | null): boolean {
  if (!previousMessages || previousMessages.length === 0) return false;
  // Sort by sequencePos descending to find the last message
  const sorted = [...previousMessages].sort((a, b) => b.sequencePos - a.sequencePos);
  const lastMsg = sorted[0];
  if (lastMsg.status !== 'sent') return false;

  let offsets = [3, 7, 14];
  if (campaign?.followUpSchedule) {
    if (typeof campaign.followUpSchedule === 'string') {
      try {
        offsets = JSON.parse(campaign.followUpSchedule);
      } catch (e) {
        const match = campaign.followUpSchedule.match(/\d+/);
        if (match) {
          offsets = [parseInt(match[0], 10)];
        }
      }
    } else if (Array.isArray(campaign.followUpSchedule)) {
      offsets = campaign.followUpSchedule as unknown as number[];
    }
  }

  const targetOffset = offsets[lastMsg.sequencePos];
  if (targetOffset === undefined) return false;

  const daysSinceLastSend = (Date.now() - new Date(lastMsg.sentAt || lastMsg.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceLastSend >= targetOffset;
}

export function isExitConditionMet(strategy: StrategyName, context: StrategyContext): boolean {
  const { lead, signals, previousMessages, campaign } = context;

  // Global exit conditions: lead unsubscribed, blacklisted, or DNC
  if (lead.status === 'unsubscribed' || lead.isBlacklisted || lead.doNotContact) {
    return true;
  }

  switch (strategy) {
    case 'signal-led':
      if (lead.status !== 'new' && lead.status !== 'scored') return true;
      const hasActiveSignal = signals.some(
        s =>
          s.confidence >= 0.7 &&
          s.urgency >= 0.5 &&
          (!s.expiresAt || new Date(s.expiresAt) > new Date())
      );
      return !hasActiveSignal;

    case 'funding-growth':
      return lead.status === 'replied' || (campaign ? campaign.status === 'paused' : false);

    case 'hiring-spike':
      return (campaign ? campaign.status === 'completed' : false);

    case 'job-change':
      const hasBounced = previousMessages?.some(m => m.status === 'bounced') || false;
      return lead.status === 'replied' || hasBounced;

    case 'tech-migration':
      const techMsgs = previousMessages?.filter(m => m.strategy === 'tech-migration') || [];
      return lead.status === 'replied' || techMsgs.length >= 3;

    case 'traffic-seo-decline':
      return lead.status === 'replied';

    case 'competitor-pressure':
      return lead.status === 'replied' || (campaign ? campaign.status === 'paused' : false);

    case 'ai-adoption':
      return lead.status === 'replied';

    case 'persona-based':
      const personaMsgs = previousMessages?.filter(m => m.strategy === 'persona-based') || [];
      return lead.status === 'replied' || personaMsgs.length >= 3;

    case 'personalization-hook':
      return lead.status === 'replied';

    case 'follow-up':
      return lead.status === 'replied';

    case 'breakup':
      return (
        lead.status === 'replied' ||
        (previousMessages?.some(m => m.strategy === 'breakup' && m.status === 'sent') || false)
      );

    case 'reply-driven':
      return lead.status === 'interested' || lead.status === 'unsubscribed';

    default:
      return false;
  }
}

export function isEntryConditionMet(strategy: StrategyName, context: StrategyContext): boolean {
  const { lead, signals, previousMessages, replies, campaign } = context;

  // If exit conditions are met, entry cannot be met
  if (isExitConditionMet(strategy, context)) {
    return false;
  }

  const now = Date.now();

  switch (strategy) {
    case 'signal-led':
      return (
        (lead.status === 'new' || lead.status === 'scored') &&
        signals.some(
          s =>
            s.confidence >= 0.7 &&
            s.urgency >= 0.5 &&
            (!s.expiresAt || new Date(s.expiresAt) > new Date())
        )
      );

    case 'funding-growth':
      return signals.some(
        s =>
          (s.type === 'funding_round' || s.type === 'growth') &&
          now - new Date(s.detectedAt).getTime() < 45 * 24 * 60 * 60 * 1000
      );

    case 'hiring-spike':
      return signals.some(
        s =>
          (s.type === 'hiring_spike' || s.type === 'engineering_hiring_spike') &&
          now - new Date(s.detectedAt).getTime() < 30 * 24 * 60 * 60 * 1000
      );

    case 'job-change':
      return signals.some(
        s =>
          s.type === 'job_change' &&
          now - new Date(s.detectedAt).getTime() < 90 * 24 * 60 * 60 * 1000
      );

    case 'tech-migration':
      return signals.some(s => s.type === 'tech_stack_migration' && s.confidence >= 0.6);

    case 'traffic-seo-decline':
      return signals.some(
        s =>
          (s.type === 'traffic_drop' || s.type === 'seo_decline') &&
          s.relevance >= 0.7
      );

    case 'competitor-pressure':
      return signals.some(s => s.type === 'competitor_pressure');

    case 'ai-adoption':
      return signals.some(
        s =>
          (s.type === 'ai_adoption' || s.type === 'ai_adoption_signal') &&
          now - new Date(s.detectedAt).getTime() < 60 * 24 * 60 * 60 * 1000
      );

    case 'persona-based':
      const hasHighUrgencySignal = signals.some(s => (s.urgency ?? 0.5) >= 0.7);
      return !hasHighUrgencySignal && matchesPersonaPattern(lead.title);

    case 'personalization-hook':
      return signals.some(s => s.type === 'personalization_hook' && s.relevance >= 0.8);

    case 'follow-up':
      return shouldFollowUp(previousMessages || [], campaign || null);

    case 'breakup': {
      const sentMessages = previousMessages?.filter(m => m.status === 'sent') || [];
      const hasBreakupSent = previousMessages?.some(m => m.strategy === 'breakup') || false;
      const daysSinceLastContact = lead.lastContacted
        ? (now - new Date(lead.lastContacted).getTime()) / (1000 * 60 * 60 * 24)
        : 0;
      return sentMessages.length >= 3 && daysSinceLastContact >= 10 && !hasBreakupSent;
    }

    case 'reply-driven': {
      const eligibleReplies = replies || [];
      return eligibleReplies.some(r => r.category === 'interested' || r.category === 'needs_info');
    }

    default:
      return false;
  }
}

export function getSignalConfidenceForStrategy(
  strategy: StrategyName,
  context: StrategyContext
): { confidence: number; signalId?: string } {
  const { signals } = context;
  let eligibleSignals: Signal[] = [];

  switch (strategy) {
    case 'signal-led':
      eligibleSignals = signals.filter(
        s =>
          s.confidence >= 0.7 &&
          s.urgency >= 0.5 &&
          (!s.expiresAt || new Date(s.expiresAt) > new Date())
      );
      break;
    case 'funding-growth':
      eligibleSignals = signals.filter(s => s.type === 'funding_round' || s.type === 'growth');
      break;
    case 'hiring-spike':
      eligibleSignals = signals.filter(
        s => s.type === 'hiring_spike' || s.type === 'engineering_hiring_spike'
      );
      break;
    case 'job-change':
      eligibleSignals = signals.filter(s => s.type === 'job_change');
      break;
    case 'tech-migration':
      eligibleSignals = signals.filter(s => s.type === 'tech_stack_migration');
      break;
    case 'traffic-seo-decline':
      eligibleSignals = signals.filter(s => s.type === 'traffic_drop' || s.type === 'seo_decline');
      break;
    case 'competitor-pressure':
      eligibleSignals = signals.filter(s => s.type === 'competitor_pressure');
      break;
    case 'ai-adoption':
      eligibleSignals = signals.filter(
        s => s.type === 'ai_adoption' || s.type === 'ai_adoption_signal'
      );
      break;
    case 'personalization-hook':
      eligibleSignals = signals.filter(s => s.type === 'personalization_hook');
      break;
    case 'reply-driven': {
      const maxClassificationConfidence =
        context.replies && context.replies.length > 0
          ? Math.max(...context.replies.map(r => r.confidence))
          : 0.95;
      return { confidence: maxClassificationConfidence || 0.95 };
    }
    case 'follow-up':
      return { confidence: 0.8 };
    case 'breakup':
      return { confidence: 0.9 };
    case 'persona-based':
      return { confidence: 0.5 };
    default:
      return { confidence: 0.5 };
  }

  if (eligibleSignals.length > 0) {
    const sorted = [...eligibleSignals].sort((a, b) => b.confidence - a.confidence);
    return { confidence: sorted[0].confidence, signalId: sorted[0].id };
  }

  return { confidence: 0.5 };
}

export function rankStrategies(context: StrategyContext): StrategyRecommendation[] {
  const { lead, previousMessages = [], memories = [], cooldownWindowDays = 3, strategyCooldownWindowDays = 30 } = context;

  const overallCooldown = checkOverallLeadCooldown(lead, cooldownWindowDays);

  const strategies: StrategyName[] = [
    'reply-driven',
    'funding-growth',
    'hiring-spike',
    'job-change',
    'tech-migration',
    'traffic-seo-decline',
    'competitor-pressure',
    'ai-adoption',
    'personalization-hook',
    'follow-up',
    'breakup',
    'signal-led',
    'persona-based',
  ];

  const recommendations: StrategyRecommendation[] = [];

  for (const strategy of strategies) {
    const isEntryMet = isEntryConditionMet(strategy, context);
    if (!isEntryMet) {
      continue;
    }

    let eligible = true;
    let reasoning = '';

    if (strategy !== 'reply-driven' && overallCooldown.onCooldown) {
      eligible = false;
      reasoning = overallCooldown.reason || 'Lead is on overall contact cooldown.';
    } else {
      const strategyCooldown = checkStrategyCooldown(strategy, previousMessages, strategyCooldownWindowDays);
      if (strategyCooldown.onCooldown) {
        eligible = false;
        reasoning = strategyCooldown.reason || 'Strategy is on cooldown.';
      }
    }

    const { confidence: signalConfidence, signalId } = getSignalConfidenceForStrategy(strategy, context);
    const leadFit = lead.leadScore !== undefined && lead.leadScore !== null ? lead.leadScore / 100 : 0.5;

    let memoryPerformance = 0.5;
    if (memories && memories.length > 0) {
      const match = memories.find(m => m.key === strategy || m.key === `${strategy}_performance`);
      if (match && match.score !== undefined && match.score !== null) {
        memoryPerformance = match.score;
      }
    }

    // Confidence = SignalConfidence * 0.4 + LeadFit * 0.3 + MemoryPerformance * 0.3
    const confidence = signalConfidence * 0.4 + leadFit * 0.3 + memoryPerformance * 0.3;

    if (eligible) {
      reasoning = `Entry conditions met. Confidence score: ${confidence.toFixed(2)} (Signal: ${signalConfidence.toFixed(2)}, Fit: ${leadFit.toFixed(2)}, Memory: ${memoryPerformance.toFixed(2)}).`;
    }

    const budgetAllocation = strategy === 'reply-driven' ? 0 : 1;

    recommendations.push({
      strategy,
      confidence,
      reasoning,
      signalId,
      budgetAllocation,
      eligible,
    });
  }

  // Sort: eligible strategies first, then sort both groups by confidence descending
  return recommendations.sort((a, b) => {
    if (a.eligible && !b.eligible) return -1;
    if (!a.eligible && b.eligible) return 1;
    return b.confidence - a.confidence;
  });
}

export function selectBestStrategy(context: StrategyContext): StrategyRecommendation | null {
  const ranked = rankStrategies(context);
  const eligible = ranked.filter(r => r.eligible);
  return eligible.length > 0 ? eligible[0] : null;
}

export class StrategySelector {
  static selectBestStrategy(context: StrategyContext): StrategyRecommendation | null {
    return selectBestStrategy(context);
  }

  static rankStrategies(context: StrategyContext): StrategyRecommendation[] {
    return rankStrategies(context);
  }

  static async selectBestStrategyForLead(
    leadId: string,
    organizationId?: string
  ): Promise<StrategyRecommendation | null> {
    const context = await this.buildContext(leadId, organizationId);
    return selectBestStrategy(context);
  }

  static async rankStrategiesForLead(
    leadId: string,
    organizationId?: string
  ): Promise<StrategyRecommendation[]> {
    const context = await this.buildContext(leadId, organizationId);
    return rankStrategies(context);
  }

  private static async buildContext(
    leadId: string,
    organizationId?: string
  ): Promise<StrategyContext> {
    const scopedWhere = organizationId ? { organizationId } : {};

    const lead = await db.lead.findUniqueOrThrow({
      where: { id: leadId },
    });

    const signals = await db.signal.findMany({
      where: { leadId, ...scopedWhere },
    });

    const previousMessages = await db.outreachMessage.findMany({
      where: { leadId, ...scopedWhere },
      orderBy: { createdAt: 'desc' },
    });

    const replies = await db.replyClassification.findMany({
      where: {
        ...scopedWhere,
        message: {
          leadId,
        },
      },
    });

    const orConditions: { leadId?: string; industry?: string; persona?: string }[] = [];
    if (leadId) orConditions.push({ leadId });
    if (lead.company) orConditions.push({ industry: lead.company });
    if (lead.title) orConditions.push({ persona: lead.title });

    const memories = await db.agentMemory.findMany({
      where: {
        organizationId,
        ...(orConditions.length > 0 ? { OR: orConditions } : {}),
      },
      orderBy: { score: 'desc' },
    });

    const campaign = organizationId
      ? await db.campaign.findFirst({
          where: { organizationId, status: 'running' },
        })
      : null;

    return {
      lead,
      signals,
      previousMessages,
      replies,
      memories,
      campaign,
    };
  }
}
