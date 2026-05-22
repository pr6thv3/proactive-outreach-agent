// ─── OBSERVE: Signal Intelligence Engine ─────────────────
// THE MOAT: Understands WHY outreach should happen NOW
// Turns raw signals into urgency-scored intelligence with pitch angles

import { BaseAgent } from '../base';
import { AgentContext, SignalData } from '../types';
import { db } from '@/lib/db';

// ─── Signal Intelligence Types ─────────────────────────
export type HighValueSignalType =
  | 'funding_round'
  | 'hiring_spike'
  | 'engineering_hiring_spike'
  | 'traffic_drop'
  | 'product_launch'
  | 'rebranding'
  | 'seo_decline'
  | 'tech_stack_migration'
  | 'competitor_pressure'
  | 'ai_adoption_signal'
  | 'job_change'
  | 'expansion'
  | 'pain_point'
  | 'growth'
  | 'tech_stack'
  | 'personalization_hook';

export interface SignalIntelligence {
  signal_type: HighValueSignalType;
  urgency: number;           // 0-1 WHY NOW
  reasoning: string;         // Human-readable explanation
  recommended_pitch_angle: string;
  recommended_offer: string;
  confidence: number;
  decay_rate: number;        // How fast urgency decays per day
  expires_in_days: number;   // How many days until this signal is stale
  recommendedChannel: 'email' | 'linkedin' | 'twitter' | 'sms' | 'contact_form';
}

export interface SignalIntelligenceOutput {
  intelligences: SignalIntelligence[];
  topPriority: SignalIntelligence | null;
  leadUrgencyScore: number;   // 0-1 composite
  recommendedAction: 'reach_out_now' | 'reach_out_soon' | 'monitor' | 'skip';
  recommendedChannel: 'email' | 'linkedin' | 'twitter' | 'sms' | 'contact_form';
}

interface SignalIntelligenceInput {
  existingSignals?: SignalData[];
  additionalContext?: string;
  companyDomain?: string;
}

// ─── Urgency Decay Rates (per day) ─────────────────────
const URGENCY_DECAY: Record<string, { rate: number; ttl_days: number }> = {
  funding_round:            { rate: 0.03, ttl_days: 30 },   // Funding is hot for ~30 days
  hiring_spike:             { rate: 0.02, ttl_days: 45 },   // Hiring stays relevant longer
  engineering_hiring_spike: { rate: 0.025, ttl_days: 35 },
  traffic_drop:             { rate: 0.04, ttl_days: 21 },   // Traffic issues are urgent
  product_launch:           { rate: 0.05, ttl_days: 14 },   // Launches are very time-sensitive
  rebranding:               { rate: 0.03, ttl_days: 30 },
  seo_decline:              { rate: 0.02, ttl_days: 45 },
  tech_stack_migration:     { rate: 0.015, ttl_days: 60 },  // Migrations are long-running
  competitor_pressure:      { rate: 0.03, ttl_days: 30 },
  ai_adoption_signal:       { rate: 0.02, ttl_days: 45 },
  job_change:               { rate: 0.06, ttl_days: 10 },   // Job changes decay fast
  expansion:                { rate: 0.02, ttl_days: 45 },
  pain_point:               { rate: 0.01, ttl_days: 90 },   // Pain points are evergreen
  growth:                   { rate: 0.02, ttl_days: 45 },
  tech_stack:               { rate: 0.01, ttl_days: 90 },
  personalization_hook:     { rate: 0.005, ttl_days: 180 },  // Hooks are long-lived
};

// ─── Pitch Angle Templates ─────────────────────────────
const PITCH_ANGLES: Record<string, { angle: string; offer: string; channel: SignalIntelligence['recommendedChannel'] }> = {
  funding_round: {
    angle: 'Growth partnership — help them scale post-funding with the right tools',
    offer: 'Free onboarding package + priority support for scaling teams',
    channel: 'email',
  },
  hiring_spike: {
    angle: 'Scaling solution — their team is growing, they need efficient processes',
    offer: 'Team productivity assessment + free trial for new hires',
    channel: 'linkedin',
  },
  engineering_hiring_spike: {
    angle: 'Engineering enablement — new engineers need tools and onboarding',
    offer: 'Developer onboarding toolkit + engineering efficiency audit',
    channel: 'email',
  },
  traffic_drop: {
    angle: 'Recovery partner — help them get back on track with proven strategies',
    offer: 'Free traffic analysis + recovery roadmap consultation',
    channel: 'email',
  },
  product_launch: {
    angle: 'Launch acceleration — amplify their new product reach',
    offer: 'Go-to-market acceleration package + launch support',
    channel: 'linkedin',
  },
  rebranding: {
    angle: 'Brand refresh partner — ensure all touchpoints reflect the new identity',
    offer: 'Brand consistency audit + implementation support',
    channel: 'email',
  },
  seo_decline: {
    angle: 'SEO recovery expert — reverse the decline with data-driven fixes',
    offer: 'Free SEO audit + 30-day recovery plan',
    channel: 'email',
  },
  tech_stack_migration: {
    angle: 'Migration specialist — smooth transition with zero downtime',
    offer: 'Migration assessment + dedicated support engineer',
    channel: 'linkedin',
  },
  competitor_pressure: {
    angle: 'Competitive edge — differentiate and win in the market',
    offer: 'Competitive analysis + differentiation workshop',
    channel: 'email',
  },
  ai_adoption_signal: {
    angle: 'AI implementation partner — practical AI that delivers ROI',
    offer: 'AI readiness assessment + proof-of-concept workshop',
    channel: 'linkedin',
  },
  job_change: {
    angle: 'New role, new priorities — help them make an impact fast',
    offer: 'Quick wins playbook + 30-day onboarding support',
    channel: 'linkedin',
  },
  expansion: {
    angle: 'Expansion enabler — scale operations without growing pains',
    offer: 'Scaling assessment + infrastructure review',
    channel: 'email',
  },
  pain_point: {
    angle: 'Problem solver — directly address their stated challenges',
    offer: 'Free consultation + custom solution proposal',
    channel: 'email',
  },
  growth: {
    angle: 'Growth multiplier — accelerate what is already working',
    offer: 'Growth audit + optimization recommendations',
    channel: 'email',
  },
  tech_stack: {
    angle: 'Tech stack expert — complement their existing tools',
    offer: 'Integration assessment + compatibility check',
    channel: 'email',
  },
  personalization_hook: {
    angle: 'Personal connection — reference their specific achievement or interest',
    offer: 'Relevant resource or introduction based on their interests',
    channel: 'linkedin',
  },
};

export class SignalIntelligenceAgent extends BaseAgent<SignalIntelligenceInput, SignalIntelligenceOutput> {
  readonly name = 'SignalIntelligence';
  readonly phase = 'observe' as const;
  readonly description = 'THE MOAT: Converts signals into urgency-scored intelligence with pitch angles and recommended actions';

  async execute(input: SignalIntelligenceInput, context: AgentContext): Promise<SignalIntelligenceOutput> {
    const signals = input.existingSignals || context.signals;
    const scrapeData = await db.scrapeData.findMany({ where: { leadId: context.leadId, status: 'completed' } });

    // 1. Try LLM-based signal intelligence (highest quality)
    let intelligences: SignalIntelligence[] = [];

    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;
      const zai = await ZAI.create();

      const contextParts = [
        ...signals.map(s => `[${s.type}] ${s.content} (relevance: ${s.relevance}, confidence: ${s.confidence})`),
        input.additionalContext || '',
        context.lead.company ? `Company: ${context.lead.company}` : '',
        context.lead.title ? `Title: ${context.lead.title}` : '',
        ...scrapeData.map(s => [s.aboutText, s.careersText, s.blogText, s.newsText].filter(Boolean).join('\n')).filter(Boolean),
      ].filter(Boolean);

      const prompt = `You are a signal intelligence analyst for a proactive sales outreach platform. Your job is to understand WHY a company should be contacted NOW — not just what they do, but what is happening that creates an urgent outreach opportunity.

LEAD: ${context.lead.name} at ${context.lead.company || 'Unknown'} (${context.lead.title || 'Unknown'})

AVAILABLE CONTEXT:
${contextParts.join('\n')}

Analyze and identify HIGH-VALUE signals. Focus on:
1. funding_round: Company recently raised funding (Series A/B/C, seed, etc.)
2. hiring_spike: Multiple job openings, rapid team growth
3. engineering_hiring_spike: Specifically hiring engineers/developers
4. traffic_drop: Website traffic declining (indicates problems)
5. product_launch: New product or major feature release
6. rebranding: Company undergoing rebrand
7. seo_decline: Search rankings dropping
8. tech_stack_migration: Moving between tech stacks (e.g., monolith to microservices)
9. competitor_pressure: Competitor gaining ground
10. ai_adoption_signal: Company adopting or exploring AI/ML
11. job_change: Key executive joined or left
12. expansion: Expanding to new markets, offices, or segments
13. pain_point: Stated or inferred challenges
14. growth: Revenue or team growth signals
15. tech_stack: Technology they use (complementary to our offering)
16. personalization_hook: Specific personal detail for outreach

For EACH signal, provide:
- signal_type: one of the types above
- urgency: 0-1 (WHY NOW? How time-sensitive is this?)
- reasoning: 1-2 sentences explaining WHY this creates an outreach opportunity NOW
- recommended_pitch_angle: How should we position our outreach
- recommended_offer: What specific offer would resonate
- confidence: 0-1 (how sure are we this signal is real)
- expires_in_days: How many days until this signal becomes stale

Return a JSON array of at least 2 signals. Prioritize signals that answer "WHY NOW?"

[
  {
    "signal_type": "funding_round",
    "urgency": 0.91,
    "reasoning": "Raised Series B 2 weeks ago — will be allocating budget for growth tools",
    "recommended_pitch_angle": "Growth partnership — help them scale post-funding",
    "recommended_offer": "Free onboarding + priority support for scaling teams",
    "confidence": 0.85,
    "expires_in_days": 30
  }
]`;

      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a signal intelligence analyst. You answer the question: WHY should outreach happen NOW? Always respond with valid JSON arrays only.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
      });

      const responseText = completion.choices[0]?.message?.content || '[]';
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        intelligences = parsed.map((s: Record<string, unknown>) => ({
          signal_type: (s.signal_type as string) || 'pain_point',
          urgency: clamp(s.urgency as number),
          reasoning: (s.reasoning as string) || 'Signal detected',
          recommended_pitch_angle: (s.recommended_pitch_angle as string) || '',
          recommended_offer: (s.recommended_offer as string) || '',
          confidence: clamp(s.confidence as number),
          decay_rate: URGENCY_DECAY[(s.signal_type as string) || 'pain_point']?.rate || 0.02,
          expires_in_days: (s.expires_in_days as number) || URGENCY_DECAY[(s.signal_type as string) || 'pain_point']?.ttl_days || 45,
          recommendedChannel: (PITCH_ANGLES[(s.signal_type as string) || 'pain_point']?.channel || 'email') as SignalIntelligence['recommendedChannel'],
        }));
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') console.warn('[SignalIntelligence] LLM failed, using rule-based intelligence:', error);
      intelligences = generateRuleBasedIntelligence(context, signals);
    }

    // 2. Save intelligence-enriched signals to DB
    for (const intel of intelligences) {
      const config = URGENCY_DECAY[intel.signal_type] || URGENCY_DECAY.pain_point;
      const pitchTemplate = PITCH_ANGLES[intel.signal_type] || PITCH_ANGLES.pain_point;

      await db.signal.create({
        data: {
          type: intel.signal_type,
          content: intel.reasoning,
          source: 'signal_intelligence',
          relevance: intel.urgency,
          confidence: intel.confidence,
          rawSnippet: input.additionalContext?.slice(0, 500) || null,
          urgency: intel.urgency,
          reasoning: intel.reasoning,
          recommendedPitchAngle: intel.recommended_pitch_angle || pitchTemplate.angle,
          recommendedOffer: intel.recommended_offer || pitchTemplate.offer,
          decayRate: intel.decay_rate || config.rate,
          detectedAt: new Date(),
          expiresAt: new Date(Date.now() + (intel.expires_in_days || config.ttl_days) * 86400000),
          leadId: context.leadId,
        },
      });
    }

    // 3. Compute composite scores
    const topPriority = intelligences.length > 0
      ? intelligences.reduce((best, curr) => curr.urgency > best.urgency ? curr : best)
      : null;

    const leadUrgencyScore = intelligences.length > 0
      ? Math.max(...intelligences.map(i => i.urgency * i.confidence))
      : 0;

    const recommendedAction = leadUrgencyScore >= 0.7
      ? 'reach_out_now' as const
      : leadUrgencyScore >= 0.4
        ? 'reach_out_soon' as const
        : leadUrgencyScore >= 0.2
          ? 'monitor' as const
          : 'skip' as const;

    const recommendedChannel = topPriority
      ? PITCH_ANGLES[topPriority.signal_type]?.channel || 'email'
      : 'email';

    // 4. Log activity
    await db.activity.create({
      data: {
        type: 'signal_detected',
        description: `Signal intelligence: ${intelligences.length} signals detected. Top: ${topPriority?.signal_type || 'none'} (urgency: ${(topPriority?.urgency || 0).toFixed(2)}). Action: ${recommendedAction}`,
        phase: 'observe',
        leadId: context.leadId,
        metadata: JSON.stringify({
          signalCount: intelligences.length,
          topSignalType: topPriority?.signal_type,
          urgency: topPriority?.urgency,
          recommendedAction,
        }),
      },
    });

    return { intelligences, topPriority, leadUrgencyScore, recommendedAction, recommendedChannel };
  }
}

// ─── Rule-Based Fallback Intelligence ──────────────────
function generateRuleBasedIntelligence(context: AgentContext, signals: SignalData[]): SignalIntelligence[] {
  const results: SignalIntelligence[] = [];
  const company = context.lead.company || '';
  const title = (context.lead.title || '').toLowerCase();

  // Check for funding signals
  const fundingSignals = signals.filter(s => s.type === 'funding' || s.content.toLowerCase().includes('funding') || s.content.toLowerCase().includes('raised'));
  if (fundingSignals.length > 0) {
    results.push({
      signal_type: 'funding_round',
      urgency: 0.91,
      reasoning: `${company} has funding activity — they are likely allocating budget for growth tools and solutions`,
      recommended_pitch_angle: PITCH_ANGLES.funding_round.angle,
      recommended_offer: PITCH_ANGLES.funding_round.offer,
      confidence: 0.85,
      decay_rate: 0.03,
      expires_in_days: 30,
      recommendedChannel: PITCH_ANGLES.funding_round.channel,
    });
  }

  // Check for hiring signals
  const hiringSignals = signals.filter(s => s.type === 'hiring' || s.content.toLowerCase().includes('hiring'));
  if (hiringSignals.length > 0) {
    const isEngHiring = hiringSignals.some(s =>
      s.content.toLowerCase().includes('engineer') || s.content.toLowerCase().includes('developer') ||
      s.content.toLowerCase().includes('devops') || s.content.toLowerCase().includes('sre')
    );
    results.push({
      signal_type: isEngHiring ? 'engineering_hiring_spike' : 'hiring_spike',
      urgency: isEngHiring ? 0.85 : 0.8,
      reasoning: `${company} is actively hiring${isEngHiring ? ' engineers' : ''} — growth creates needs for new tools and processes`,
      recommended_pitch_angle: isEngHiring ? PITCH_ANGLES.engineering_hiring_spike.angle : PITCH_ANGLES.hiring_spike.angle,
      recommended_offer: isEngHiring ? PITCH_ANGLES.engineering_hiring_spike.offer : PITCH_ANGLES.hiring_spike.offer,
      confidence: 0.8,
      decay_rate: isEngHiring ? 0.025 : 0.02,
      expires_in_days: isEngHiring ? 35 : 45,
      recommendedChannel: isEngHiring ? PITCH_ANGLES.engineering_hiring_spike.channel : PITCH_ANGLES.hiring_spike.channel,
    });
  }

  // Check for tech stack signals
  const techSignals = signals.filter(s => s.type === 'tech_stack');
  if (techSignals.length > 0) {
    results.push({
      signal_type: 'tech_stack',
      urgency: 0.4,
      reasoning: `${company} uses specific technologies that complement our offering`,
      recommended_pitch_angle: PITCH_ANGLES.tech_stack.angle,
      recommended_offer: PITCH_ANGLES.tech_stack.offer,
      confidence: 0.7,
      decay_rate: 0.01,
      expires_in_days: 90,
      recommendedChannel: PITCH_ANGLES.tech_stack.channel,
    });
  }

  // Check for pain points
  const painSignals = signals.filter(s => s.type === 'pain_point');
  if (painSignals.length > 0) {
    results.push({
      signal_type: 'pain_point',
      urgency: 0.7,
      reasoning: `${company} faces challenges we can directly address`,
      recommended_pitch_angle: PITCH_ANGLES.pain_point.angle,
      recommended_offer: PITCH_ANGLES.pain_point.offer,
      confidence: 0.65,
      decay_rate: 0.01,
      expires_in_days: 90,
      recommendedChannel: PITCH_ANGLES.pain_point.channel,
    });
  }

  // Check for growth signals
  const growthSignals = signals.filter(s => s.type === 'growth' || s.content.toLowerCase().includes('growth') || s.content.toLowerCase().includes('expanding'));
  if (growthSignals.length > 0) {
    results.push({
      signal_type: 'expansion',
      urgency: 0.75,
      reasoning: `${company} is in growth mode — expanding teams, markets, or products`,
      recommended_pitch_angle: PITCH_ANGLES.expansion.angle,
      recommended_offer: PITCH_ANGLES.expansion.offer,
      confidence: 0.7,
      decay_rate: 0.02,
      expires_in_days: 45,
      recommendedChannel: PITCH_ANGLES.expansion.channel,
    });
  }

  // Infer signal from title
  if (title.includes('vp') || title.includes('director') || title.includes('head')) {
    if (!results.some(r => r.signal_type === 'personalization_hook')) {
      results.push({
        signal_type: 'personalization_hook',
        urgency: 0.3,
        reasoning: `${context.lead.name} is a ${context.lead.title} — decision-maker level, likely evaluating solutions`,
        recommended_pitch_angle: PITCH_ANGLES.personalization_hook.angle,
        recommended_offer: PITCH_ANGLES.personalization_hook.offer,
        confidence: 0.5,
        decay_rate: 0.005,
        expires_in_days: 180,
        recommendedChannel: PITCH_ANGLES.personalization_hook.channel,
      });
    }
  }

  // If no signals found, create a generic one
  if (results.length === 0) {
    results.push({
      signal_type: 'pain_point',
      urgency: 0.25,
      reasoning: `Limited signal data for ${company}. Research recommended before outreach.`,
      recommended_pitch_angle: PITCH_ANGLES.pain_point.angle,
      recommended_offer: PITCH_ANGLES.pain_point.offer,
      confidence: 0.3,
      decay_rate: 0.02,
      expires_in_days: 45,
      recommendedChannel: PITCH_ANGLES.pain_point.channel,
    });
  }

  return results;
}

function clamp(v: number): number { return Math.min(1, Math.max(0, v || 0.5)); }
