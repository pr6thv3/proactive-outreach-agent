// ─── OBSERVE: Signal Extractor Agent ──────────────────
// THE MOAT: Real signal intelligence with urgency scoring, pain inference, and pitch angles
// Quality of signals = quality of outreach = the entire product

import { BaseAgent } from '../base';
import { AgentContext, ObserveOutput, SignalData } from '../types';
import { db } from '@/lib/db';

interface SignalExtractorInput {
  existingSignals?: SignalData[];
  additionalContext?: string;
}

// ─── Signal Types with Urgency Templates ──────────────
// Each signal type has a base urgency, decay rate, and default pitch angle
const SIGNAL_TEMPLATES: Record<string, {
  baseUrgency: number;
  decayRate: number;
  expiryDays: number;
  defaultPitchAngle: string;
  defaultOffer: string;
  description: string;
}> = {
  funding_round: {
    baseUrgency: 0.9,
    decayRate: 0.04,
    expiryDays: 30,
    defaultPitchAngle: 'Growth partnership — help them scale post-funding',
    defaultOffer: 'Free onboarding package + priority support',
    description: 'Company raised funding — they have budget and urgency to scale',
  },
  hiring_sdrs: {
    baseUrgency: 0.85,
    decayRate: 0.03,
    expiryDays: 45,
    defaultPitchAngle: 'Sales acceleration — help new SDRs ramp faster',
    defaultOffer: 'SDR productivity toolkit + training materials',
    description: 'Hiring sales reps — they need to generate pipeline urgently',
  },
  engineering_hiring_spike: {
    baseUrgency: 0.7,
    decayRate: 0.02,
    expiryDays: 60,
    defaultPitchAngle: 'Engineering efficiency — help them ship faster with fewer bottlenecks',
    defaultOffer: 'Free technical assessment + optimization report',
    description: 'Rapid engineering hiring — they are scaling the product',
  },
  traffic_drop: {
    baseUrgency: 0.75,
    decayRate: 0.01,
    expiryDays: 90,
    defaultPitchAngle: 'Growth recovery — help them reverse the traffic decline',
    defaultOffer: 'Free traffic audit + recovery plan',
    description: 'Website traffic dropping — they have a problem they may not know about',
  },
  new_product_launch: {
    baseUrgency: 0.8,
    decayRate: 0.03,
    expiryDays: 45,
    defaultPitchAngle: 'Launch acceleration — help them get more eyes on the new product',
    defaultOffer: 'Free go-to-market consultation',
    description: 'New product launched — they need distribution and awareness',
  },
  rebranding: {
    baseUrgency: 0.6,
    decayRate: 0.02,
    expiryDays: 60,
    defaultPitchAngle: 'Brand transition support — help them relaunch with impact',
    defaultOffer: 'Brand migration checklist + support package',
    description: 'Company is rebranding — opportunity during transition period',
  },
  seo_decline: {
    baseUrgency: 0.65,
    decayRate: 0.01,
    expiryDays: 90,
    defaultPitchAngle: 'SEO recovery — help them regain lost search visibility',
    defaultOffer: 'Free SEO audit + quick-win recommendations',
    description: 'SEO rankings declining — they are losing organic traffic',
  },
  tech_stack_migration: {
    baseUrgency: 0.7,
    decayRate: 0.02,
    expiryDays: 60,
    defaultPitchAngle: 'Migration support — smooth transition to new tech stack',
    defaultOffer: 'Free migration assessment + planning guide',
    description: 'Migrating tech stack — they need help during the transition',
  },
  competitor_pressure: {
    baseUrgency: 0.75,
    decayRate: 0.015,
    expiryDays: 60,
    defaultPitchAngle: 'Competitive differentiation — help them stand out',
    defaultOffer: 'Competitive analysis report + positioning workshop',
    description: 'Facing competitive pressure — they need to differentiate fast',
  },
  ai_adoption: {
    baseUrgency: 0.8,
    decayRate: 0.02,
    expiryDays: 45,
    defaultPitchAngle: 'AI integration — help them implement AI effectively',
    defaultOffer: 'Free AI readiness assessment + implementation roadmap',
    description: 'Adopting AI — they need guidance on implementation',
  },
  job_change: {
    baseUrgency: 0.85,
    decayRate: 0.05,
    expiryDays: 14,
    defaultPitchAngle: 'New role congratulations — help them make an impact fast',
    defaultOffer: 'Executive onboarding toolkit + quick-win playbook',
    description: 'Person changed jobs — highest urgency, short window',
  },
  pain_point: {
    baseUrgency: 0.6,
    decayRate: 0.01,
    expiryDays: 90,
    defaultPitchAngle: 'Problem-solution — directly address their stated pain',
    defaultOffer: 'Free consultation + problem assessment',
    description: 'Identified pain point — direct opportunity to solve it',
  },
  hiring: {
    baseUrgency: 0.65,
    decayRate: 0.02,
    expiryDays: 45,
    defaultPitchAngle: 'Talent strategy — help them build the right team',
    defaultOffer: 'Talent strategy consultation',
    description: 'General hiring signal — they are growing',
  },
  growth: {
    baseUrgency: 0.55,
    decayRate: 0.01,
    expiryDays: 60,
    defaultPitchAngle: 'Growth partnership — scale together',
    defaultOffer: 'Growth strategy session',
    description: 'Growth signal — they are expanding',
  },
  tech_stack: {
    baseUrgency: 0.5,
    decayRate: 0.005,
    expiryDays: 90,
    defaultPitchAngle: 'Tech alignment — help them maximize their stack',
    defaultOffer: 'Tech stack optimization review',
    description: 'Tech stack insight — useful for personalization',
  },
  personalization_hook: {
    baseUrgency: 0.4,
    decayRate: 0.005,
    expiryDays: 90,
    defaultPitchAngle: 'Personal connection — reference their specific work',
    defaultOffer: 'Relevant content or introduction',
    description: 'Personal detail — use for email personalization',
  },
  trigger: {
    baseUrgency: 0.7,
    decayRate: 0.03,
    expiryDays: 30,
    defaultPitchAngle: 'Timely outreach — respond to this trigger event',
    defaultOffer: 'Relevant quick-win solution',
    description: 'Time-sensitive trigger — act now',
  },
  funding: {
    baseUrgency: 0.85,
    decayRate: 0.04,
    expiryDays: 30,
    defaultPitchAngle: 'Funding congratulations — help them invest wisely',
    defaultOffer: 'Free consultation for funded startups',
    description: 'Funding event — they have budget',
  },
  expansion: {
    baseUrgency: 0.6,
    decayRate: 0.015,
    expiryDays: 60,
    defaultPitchAngle: 'Expansion support — help them scale into new markets',
    defaultOffer: 'Market expansion playbook',
    description: 'Company expanding — they need support',
  },
};

export class SignalExtractorAgent extends BaseAgent<SignalExtractorInput, ObserveOutput> {
  readonly name = 'SignalExtractor';
  readonly phase = 'observe' as const;
  readonly description = 'THE MOAT: Extracts signals with urgency scoring, pain inference, and recommended pitch angles';

  async execute(input: SignalExtractorInput, context: AgentContext): Promise<ObserveOutput> {
    const signals: SignalData[] = [];
    const enrichedLead = context.lead;

    // Gather all context: existing signals + scraped data
    const existingSignals = input.existingSignals || context.signals;
    const evidenceSignal = existingSignals
      .filter(signal => signal.sourceUrl)
      .sort((a, b) => (b.confidence * (b.urgency || b.relevance || 0)) - (a.confidence * (a.urgency || a.relevance || 0)))[0];
    const scrapeData = await db.scrapeData.findMany({
      where: {
        leadId: context.leadId,
        ...(context.organizationId ? { organizationId: context.organizationId } : {}),
        status: 'completed',
      },
    });

    const scrapedContent = scrapeData
      .map(s => [s.aboutText, s.careersText, s.blogText, s.newsText].filter(Boolean).join('\n'))
      .filter(Boolean)
      .join('\n\n');

    const contextParts = [
      ...existingSignals.map(s => `[${s.type}] ${s.content}`),
      input.additionalContext || '',
      context.lead.company ? `Company: ${context.lead.company}` : '',
      context.lead.title ? `Title: ${context.lead.title}` : '',
      scrapedContent ? `Website content:\n${scrapedContent.slice(0, 4000)}` : '',
    ].filter(Boolean);

    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;
      const zai = await ZAI.create();

      const prompt = `You are a SIGNAL INTELLIGENCE ANALYST for proactive sales outreach. Your job is to find WHY outreach should happen NOW — not just what a company does.

LEAD: ${enrichedLead.name} at ${enrichedLead.company || 'Unknown'} (${enrichedLead.title || 'Unknown'})

CONTEXT:
${contextParts.join('\n')}

CRITICAL: You must extract HIGH-QUALITY signals. A good signal answers: "Why should we reach out to this person RIGHT NOW?"

Extract signals in these PRIORITY categories (most important first):
1. FUNDING_ROUND: Company just raised funding (Series A/B/C, seed, etc.) — they have budget and urgency
2. HIRING_SDRS: Hiring sales reps — they need to generate pipeline urgently
3. JOB_CHANGE: Person recently changed roles — highest urgency, short window
4. TRAFFIC_DROP: Website traffic is declining — they have a problem
5. NEW_PRODUCT_LAUNCH: Just launched a new product — need distribution
6. AI_ADOPTION: Adopting AI tools — they need implementation help
7. ENGINEERING_HIRING_SPIKE: Rapidly hiring engineers — scaling product
8. COMPETITOR_PRESSURE: Facing competition — need to differentiate
9. TECH_STACK_MIGRATION: Migrating to new technology — need transition help
10. SEO_DECLINE: Losing search rankings — losing organic traffic
11. REBRANDING: Company rebranding — transition opportunity
12. PAIN_POINT: Specific problems/challenges the company faces
13. PERSONALIZATION_HOOK: Specific personal details (talks, articles, achievements)
14. HIRING: General hiring signals
15. GROWTH: Growth signals (expansion, new markets)
16. TECH_STACK: Technology stack clues (for personalization)

For EACH signal, provide:
- type: one of the categories above (use the exact name)
- content: 1-2 sentences with SPECIFIC details (not generic). Include numbers, names, dates if available.
- relevance: 0.0-1.0 (how actionable for outreach RIGHT NOW)
- confidence: 0.0-1.0 (how certain you are this signal is real and current)
- urgency: 0.0-1.0 (how TIME-SENSITIVE this is — 1.0 = reach out today, 0.1 = nice to know)
- reasoning: Why this signal is timely and actionable (1 sentence)
- recommended_pitch_angle: How to position the outreach (e.g., "Growth partnership — help them scale post-funding")
- recommended_offer: What to offer (e.g., "Free onboarding package")
- inferred_pain: What PAIN this signal implies (e.g., "They need to show ROI on the new funding fast")

JSON array format:
[{"type":"funding_round","content":"Company raised $12M Series B from Accel in January 2025","relevance":0.95,"confidence":0.9,"urgency":0.85,"reasoning":"Fresh funding means budget and mandate to scale","recommended_pitch_angle":"Growth partnership — help them scale post-funding","recommended_offer":"Free onboarding + priority support","inferred_pain":"Need to show ROI on funding within 12 months"},...]

Generate 3-6 HIGH-QUALITY signals. Focus on signals that answer "WHY NOW?" not "what do they do?".
If info is sparse, infer based on the lead's role, company type, and industry patterns.
NEVER generate generic signals like "may face challenges" — be specific and actionable.`;

      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a signal intelligence analyst. You extract WHY outreach should happen NOW. Always respond with valid JSON arrays only. Focus on urgency, specificity, and pain inference.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      });

      const responseText = completion.choices[0]?.message?.content || '[]';
      // Safely extract JSON even if wrapped in markdown code blocks
      const jsonMatch = responseText.match(/\[[\s\S]*\]/)?.[0] || '[]';

      try {
        const extracted = JSON.parse(jsonMatch);
        for (const sig of extracted) {
          const normalisedType = sig.type?.toLowerCase().replace(/\s+/g, '_') || 'pain_point';
          const template = SIGNAL_TEMPLATES[normalisedType];

          const saved = await db.signal.create({
            data: {
              organizationId: context.organizationId,
              type: normalisedType,
              content: sig.content || 'Signal detected',
              source: 'signal_extractor_llm',
              relevance: clamp(sig.relevance),
              confidence: clamp(sig.confidence),
              rawSnippet: scrapedContent.slice(0, 500) || null,
              sourceUrl: evidenceSignal?.sourceUrl || null,
              sourceTitle: evidenceSignal?.sourceTitle || null,
              // ─── Signal Intelligence Fields (THE MOAT) ───
              urgency: clamp(sig.urgency ?? template?.baseUrgency ?? 0.5),
              reasoning: sig.reasoning || template?.description || null,
              recommendedPitchAngle: sig.recommended_pitch_angle || sig.recommendedPitchAngle || template?.defaultPitchAngle || null,
              recommendedOffer: sig.recommended_offer || sig.recommendedOffer || template?.defaultOffer || null,
              decayRate: template?.decayRate ?? 0.02,
              detectedAt: new Date(),
              expiresAt: new Date(Date.now() + (template?.expiryDays ?? 45) * 86400000),
              leadId: context.leadId,
            },
          });

          signals.push(mapSignalFull(saved));

          // If there's an inferred pain, also create a pain_point signal
          if (sig.inferred_pain && normalisedType !== 'pain_point') {
            const painSaved = await db.signal.create({
              data: {
                organizationId: context.organizationId,
                type: 'pain_point',
                content: `Inferred from ${normalisedType}: ${sig.inferred_pain}`,
                source: 'signal_extractor_llm_inferred',
                relevance: clamp(sig.relevance * 0.8),
                confidence: clamp(sig.confidence * 0.7),
                rawSnippet: null,
                sourceUrl: evidenceSignal?.sourceUrl || null,
                sourceTitle: evidenceSignal?.sourceTitle || null,
                urgency: clamp((sig.urgency ?? 0.5) * 0.9),
                reasoning: `Pain inferred from ${normalisedType} signal`,
                recommendedPitchAngle: sig.recommended_pitch_angle || template?.defaultPitchAngle || null,
                recommendedOffer: sig.recommended_offer || template?.defaultOffer || null,
                decayRate: 0.01,
                detectedAt: new Date(),
                expiresAt: new Date(Date.now() + 60 * 86400000),
                leadId: context.leadId,
              },
            });
            signals.push(mapSignalFull(painSaved));
          }
        }
      } catch (parseError) {
        throw new Error(`Failed to parse LLM signal output: ${parseError}`);
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') console.warn('[SignalExtractor] LLM failed, using rule-based fallback:', error);
      const fallback = generateIntelligentFallback(enrichedLead, existingSignals, scrapedContent);
      for (const sig of fallback) {
        const template = SIGNAL_TEMPLATES[sig.type];
        const saved = await db.signal.create({
          data: {
            organizationId: context.organizationId,
            type: sig.type,
            content: sig.content,
            source: 'signal_extractor_rules',
            relevance: sig.relevance,
            confidence: sig.confidence,
            leadId: context.leadId,
            sourceUrl: evidenceSignal?.sourceUrl || null,
            sourceTitle: evidenceSignal?.sourceTitle || null,
            urgency: sig.urgency,
            reasoning: sig.reasoning || template?.description || null,
            recommendedPitchAngle: sig.recommendedPitchAngle || template?.defaultPitchAngle || null,
            recommendedOffer: sig.recommendedOffer || template?.defaultOffer || null,
            decayRate: template?.decayRate ?? 0.02,
            detectedAt: new Date(),
            expiresAt: new Date(Date.now() + (template?.expiryDays ?? 45) * 86400000),
          },
        });
        signals.push(mapSignalFull(saved));
      }
    }

    return { signals, enrichedLead, scrapeResults: [] };
  }
}

function clamp(v: number): number { return Math.min(1, Math.max(0, v || 0.5)); }

/**
 * Intelligent rule-based fallback that extracts signals from scraped content
 * This is more specific than the previous generic fallback
 */
function generateIntelligentFallback(
  lead: AgentContext['lead'],
  existing: SignalData[],
  scrapedContent: string,
): Array<{
  type: string; content: string; relevance: number; confidence: number;
  urgency: number; reasoning?: string; recommendedPitchAngle?: string; recommendedOffer?: string;
}> {
  const result: Array<{
    type: string; content: string; relevance: number; confidence: number;
    urgency: number; reasoning?: string; recommendedPitchAngle?: string; recommendedOffer?: string;
  }> = [];

  const content = scrapedContent.toLowerCase();
  const existingTypes = new Set(existing.map(s => s.type));

  // ─── Hiring signals from careers page ───
  if (!existingTypes.has('hiring_sdrs') && !existingTypes.has('hiring')) {
    const sdrKeywords = ['sales development', 'sdr', 'business development rep', 'outbound', 'sales rep', 'account executive'];
    const engKeywords = ['software engineer', 'senior engineer', 'staff engineer', 'engineering manager', 'full-stack', 'frontend engineer', 'backend engineer'];

    if (sdrKeywords.some(k => content.includes(k))) {
      result.push({
        type: 'hiring_sdrs',
        content: `${lead.company || 'Company'} is hiring sales/outbound roles — they need to build pipeline urgently`,
        relevance: 0.85,
        confidence: 0.75,
        urgency: 0.8,
        reasoning: 'Hiring SDRs means they need pipeline generation now',
        recommendedPitchAngle: 'Sales acceleration — help new SDRs ramp faster',
        recommendedOffer: 'SDR productivity toolkit',
      });
    } else if (engKeywords.some(k => content.includes(k))) {
      const engCount = engKeywords.filter(k => content.includes(k)).length;
      result.push({
        type: 'engineering_hiring_spike',
        content: `${lead.company || 'Company'} is hiring ${engCount}+ engineering roles — they are scaling the product rapidly`,
        relevance: 0.75,
        confidence: 0.7,
        urgency: 0.65,
        reasoning: 'Engineering hiring spike indicates product scaling',
        recommendedPitchAngle: 'Engineering efficiency — help them ship faster',
        recommendedOffer: 'Free technical assessment',
      });
    } else if (content.includes('career') || content.includes('hiring') || content.includes('job')) {
      result.push({
        type: 'hiring',
        content: `${lead.company || 'Company'} has open positions — they are growing`,
        relevance: 0.6,
        confidence: 0.65,
        urgency: 0.5,
        reasoning: 'Active hiring signals growth phase',
        recommendedPitchAngle: 'Growth support — help them scale their team',
      });
    }
  }

  // ─── Funding signals ───
  if (!existingTypes.has('funding_round') && !existingTypes.has('funding')) {
    const fundingKeywords = ['raised', 'funding', 'series a', 'series b', 'series c', 'seed round', 'investment', 'venture capital', 'backed by'];
    if (fundingKeywords.some(k => content.includes(k))) {
      result.push({
        type: 'funding_round',
        content: `${lead.company || 'Company'} has recent funding activity — they have budget and mandate to scale`,
        relevance: 0.9,
        confidence: 0.7,
        urgency: 0.85,
        reasoning: 'Funding means budget and urgency to deploy capital',
        recommendedPitchAngle: 'Growth partnership — help them scale post-funding',
        recommendedOffer: 'Free onboarding package',
      });
    }
  }

  // ─── AI adoption signals ───
  if (!existingTypes.has('ai_adoption')) {
    const aiKeywords = ['artificial intelligence', 'machine learning', 'ai-powered', 'llm', 'gpt', 'openai', 'copilot', 'automation', 'ai integration'];
    if (aiKeywords.some(k => content.includes(k))) {
      result.push({
        type: 'ai_adoption',
        content: `${lead.company || 'Company'} is adopting AI/ML — they need implementation guidance`,
        relevance: 0.8,
        confidence: 0.7,
        urgency: 0.75,
        reasoning: 'AI adoption means they need guidance and tools',
        recommendedPitchAngle: 'AI integration — help them implement AI effectively',
        recommendedOffer: 'Free AI readiness assessment',
      });
    }
  }

  // ─── Pain point from role ───
  if (!existingTypes.has('pain_point')) {
    const title = (lead.title || '').toLowerCase();
    const company = (lead.company || '').toLowerCase();

    if (title.includes('vp sales') || title.includes('head of sales') || title.includes('cro')) {
      result.push({
        type: 'pain_point',
        content: `${lead.title} at ${lead.company} is likely under pressure to hit quota and grow pipeline efficiently`,
        relevance: 0.75,
        confidence: 0.6,
        urgency: 0.6,
        reasoning: 'Sales leaders always need more qualified pipeline',
        recommendedPitchAngle: 'Pipeline acceleration — help them generate qualified meetings',
        recommendedOffer: 'Free outbound strategy consultation',
      });
    } else if (title.includes('vp eng') || title.includes('cto') || title.includes('head of engineering')) {
      result.push({
        type: 'pain_point',
        content: `${lead.title} at ${lead.company} is likely under pressure to ship faster and reduce tech debt`,
        relevance: 0.7,
        confidence: 0.55,
        urgency: 0.55,
        reasoning: 'Engineering leaders always need to ship faster with limited resources',
        recommendedPitchAngle: 'Engineering efficiency — help them ship faster',
        recommendedOffer: 'Free technical assessment',
      });
    } else if (title.includes('ceo') || title.includes('founder') || title.includes('co-founder')) {
      result.push({
        type: 'pain_point',
        content: `${lead.name} is a founder at ${lead.company} — they need to grow revenue and optimize operations`,
        relevance: 0.7,
        confidence: 0.5,
        urgency: 0.6,
        reasoning: 'Founders need growth, efficiency, and revenue',
        recommendedPitchAngle: 'Growth partnership — help them scale efficiently',
        recommendedOffer: 'Free growth strategy session',
      });
    }
  }

  // ─── Personalization hook ───
  if (!existingTypes.has('personalization_hook')) {
    if (lead.company) {
      result.push({
        type: 'personalization_hook',
        content: `Research ${lead.name}'s recent activity at ${lead.company} for personalized outreach angle`,
        relevance: 0.5,
        confidence: 0.3,
        urgency: 0.3,
        reasoning: 'Personal hooks increase reply rates by 2-3x',
        recommendedPitchAngle: 'Reference their specific work or recent achievement',
      });
    }
  }

  // Ensure at least 2 signals
  if (result.length < 2) {
    result.push({
      type: 'pain_point',
      content: `${lead.title || 'Professional'} at ${lead.company || 'their company'} — identify specific challenges they face in their role`,
      relevance: 0.4,
      confidence: 0.3,
      urgency: 0.35,
      reasoning: 'Role-based inference — needs deeper research for specificity',
      recommendedPitchAngle: 'Problem-solution — address their likely challenges',
    });
  }

  return result;
}

function mapSignalFull(s: {
  id: string; type: string; content: string; source: string;
  relevance: number; confidence: number; rawSnippet: string | null;
  sourceUrl?: string | null; sourceTitle?: string | null;
  urgency: number | null; reasoning: string | null;
  recommendedPitchAngle: string | null; recommendedOffer: string | null;
  decayRate: number | null; detectedAt: Date | null; expiresAt: Date | null;
}): SignalData {
  return {
    id: s.id,
    type: s.type as SignalData['type'],
    content: s.content,
    source: s.source,
    relevance: s.relevance,
    confidence: s.confidence,
    rawSnippet: s.rawSnippet || undefined,
    sourceUrl: s.sourceUrl || undefined,
    sourceTitle: s.sourceTitle || undefined,
    urgency: s.urgency ?? undefined,
    reasoning: s.reasoning ?? undefined,
    recommendedPitchAngle: s.recommendedPitchAngle ?? undefined,
    recommendedOffer: s.recommendedOffer ?? undefined,
    decayRate: s.decayRate ?? undefined,
    detectedAt: s.detectedAt ?? undefined,
    expiresAt: s.expiresAt ?? undefined,
  };
}
