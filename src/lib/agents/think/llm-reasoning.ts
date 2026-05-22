// ─── THINK: LLM Reasoning Core ────────────────────────
// Generates full email sequence (initial + 3 follow-ups) using LLM + campaign config

import { BaseAgent } from '../base';
import { AgentContext, ThinkOutput, EmailSequence, CampaignConfig } from '../types';

interface LLMReasoningInput {
  signals?: Array<{ type: string; content: string; relevance: number }>;
  objective?: string;
  campaignConfig?: CampaignConfig;
}

export class LLMReasoningAgent extends BaseAgent<LLMReasoningInput, ThinkOutput> {
  readonly name = 'LLMReasoningCore';
  readonly phase = 'think' as const;
  readonly description = 'Generates full email sequence using LLM with campaign context';

  async execute(input: LLMReasoningInput, context: AgentContext): Promise<ThinkOutput> {
    const signals = input.signals || context.signals;
    const config = input.campaignConfig || context.campaignConfig;
    const rankedSignals = [...signals].sort((a, b) => b.relevance - a.relevance).slice(0, 5);

    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;
      const zai = await ZAI.create();

      const firstName = context.lead.name.split(' ')[0] || 'there';
      const company = context.lead.company || 'your company';
      const senderName = config?.senderName || 'Alex';
      const senderEmail = config?.senderEmail || 'alex@company.com';
      const productDesc = config?.productDescription || 'a solution that helps businesses improve efficiency';
      const offer = config?.offer || 'a free consultation';
      const cta = config?.cta || 'Book a 15-minute chat';
      const tone = config?.tone || 'professional';

      const prompt = `You are a world-class sales email writer. Create a 4-email outreach sequence for this lead.

LEAD:
- Name: ${context.lead.name}
- Title: ${context.lead.title || 'Unknown'}
- Company: ${company}

TOP SIGNALS:
${rankedSignals.map((s, i) => `${i + 1}. [${s.type}] ${s.content} (relevance: ${s.relevance})`).join('\n')}

CAMPAIGN CONTEXT:
- Goal: ${config?.goal || 'Book discovery calls'}
- Target: ${config?.targetAudience || 'Decision makers'}
- Product: ${productDesc}
- Offer: ${offer}
- CTA: ${cta}
- Sender: ${senderName} (${senderEmail})
- Tone: ${tone}

Generate 4 emails:
1. Initial email: Personalized, references a signal, includes CTA
2. Follow-up 1 (T+3): Gentle reminder, add a small value point
3. Follow-up 2 (T+7): Share a relevant insight or case study snippet
4. Follow-up 3 (T+14): Final attempt, brief and direct

Each email must have:
- subject: Under 50 chars, compelling
- body: Under 150 words, natural tone, includes the CTA
- The sender name is ${senderName}
- End each email with: Best, ${senderName}

IMPORTANT: Do NOT include any unsubscribe text — that's added separately.

Also provide:
- strategy: The overall approach used
- angle: The industry/persona angle
- hook: The opening hook line used

JSON format:
{
  "strategy": "...",
  "angle": "...",
  "hook": "...",
  "tone": "${tone}",
  "reasoning": "...",
  "cta": "${cta}",
  "emailSequence": [
    {"subject":"...","body":"...","sequencePos":0,"type":"initial"},
    {"subject":"...","body":"...","sequencePos":1,"type":"followup_1"},
    {"subject":"...","body":"...","sequencePos":2,"type":"followup_2"},
    {"subject":"...","body":"...","sequencePos":3,"type":"followup_3"}
  ]
}`;

      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You write high-converting cold emails. Always respond with valid JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      });

      const responseText = completion.choices[0]?.message?.content || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          strategy: parsed.strategy || 'value-first',
          angle: parsed.angle || `${company} approach`,
          hook: parsed.hook || `Hi ${firstName}, I noticed something interesting at ${company}.`,
          subject: parsed.emailSequence?.[0]?.subject || `Quick question about ${company}`,
          body: parsed.emailSequence?.[0]?.body || '',
          tone: parsed.tone || tone,
          reasoning: parsed.reasoning || 'Generated via LLM with campaign context',
          emailSequence: parsed.emailSequence || [],
          cta: parsed.cta || cta,
        };
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') console.warn('[LLMReasoning] LLM failed, using template:', error);
    }

    // Template fallback with full sequence
    return generateTemplateSequence(context, rankedSignals, config);
  }
}

function generateTemplateSequence(context: AgentContext, signals: Array<{ type: string; content: string; relevance: number }>, config?: CampaignConfig): ThinkOutput {
  const firstName = context.lead.name.split(' ')[0] || 'there';
  const company = context.lead.company || 'your company';
  const senderName = config?.senderName || 'Alex';
  const cta = config?.cta || 'Would you be open to a quick 15-minute chat this week?';
  const strongest = signals[0];

  let strategy = 'value-first';
  let hook = `Hi ${firstName}, I noticed some exciting developments at ${company}.`;
  let angle = `Relevant solutions for ${company}`;

  if (strongest?.type === 'funding') { strategy = 'congratulatory'; hook = `Hi ${firstName}, congratulations on the recent funding round at ${company}!`; angle = 'Growth partnership'; }
  else if (strongest?.type === 'pain_point') { strategy = 'pain-point-driven'; hook = `Hi ${firstName}, I understand ${company} might be facing challenges with scaling.`; angle = 'Addressing key challenges'; }
  else if (strongest?.type === 'hiring') { strategy = 'value-first'; hook = `Hi ${firstName}, I saw ${company} is hiring — exciting growth!`; angle = 'Scaling solutions'; }

  const emailSequence: EmailSequence = [
    { subject: `${firstName}, quick question about ${company}`, body: `${hook}\n\nI came across your work at ${company} and thought there might be a natural fit between what you're working on and what we do.\n\n${cta}\n\nBest,\n${senderName}`, sequencePos: 0, type: 'initial' },
    { subject: `Re: ${firstName}, quick question about ${company}`, body: `Hi ${firstName},\n\nJust floating this to the top of your inbox. I know you're busy at ${company}.\n\nIf timing isn't right, no worries at all — just let me know.\n\nBest,\n${senderName}`, sequencePos: 1, type: 'followup_1' },
    { subject: `${firstName}, a quick insight for ${company}`, body: `Hi ${firstName},\n\nI thought you might find this interesting — companies similar to ${company} have seen significant improvements by addressing the challenges you're likely facing.\n\nHappy to share more if you're curious.\n\nBest,\n${senderName}`, sequencePos: 2, type: 'followup_2' },
    { subject: `Last note — ${firstName} at ${company}`, body: `Hi ${firstName},\n\nThis will be my last note. If you're ever interested in exploring how we can help ${company}, I'm just a reply away.\n\nWishing you all the best!\n\n${senderName}`, sequencePos: 3, type: 'followup_3' },
  ];

  return {
    strategy, angle, hook,
    subject: emailSequence[0].subject,
    body: emailSequence[0].body,
    tone: config?.tone || 'professional',
    reasoning: `Template sequence based on ${strongest?.type || 'general'} signal`,
    emailSequence, cta,
  };
}
