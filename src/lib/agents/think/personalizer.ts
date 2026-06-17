// ─── THINK: Personalizer Agent ────────────────────────
// Hyper-personalizes the email sequence with lead-specific details

import { BaseAgent } from '../base';
import { AgentContext, ThinkOutput, CampaignConfig } from '../types';

interface PersonalizerInput {
  strategy: ThinkOutput;
  campaignConfig?: CampaignConfig;
}

export class PersonalizerAgent extends BaseAgent<PersonalizerInput, ThinkOutput> {
  readonly name = 'Personalizer';
  readonly phase = 'think' as const;
  readonly description = 'Personalizes email sequence with lead-specific signals';

  async execute(input: PersonalizerInput, context: AgentContext): Promise<ThinkOutput> {
    const strategy = input.strategy;
    const config = input.campaignConfig || context.campaignConfig;
    const firstName = context.lead.name.split(' ')[0] || 'there';
    const senderName = config?.senderName || 'Alex';

    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;
      const zai = await ZAI.create();

      const signalFacts = context.signals
        .slice(0, 5)
        .map((s, i) => `${i + 1}. [${s.type}] ${s.content} (citation: ${s.sourceUrl ? `${s.sourceTitle || s.sourceUrl} - ${s.sourceUrl}` : 'uncited'})`)
        .join('\n');

      const prompt = `Personalize this email sequence for a specific lead.

STRATEGY: ${strategy.strategy} — ${strategy.angle}
HOOK: ${strategy.hook}
SENDER: ${senderName}
CTA: ${strategy.cta || config?.cta || 'Book a call'}

LEAD:
- Name: ${context.lead.name}
- Title: ${context.lead.title || 'Unknown'}
- Company: ${context.lead.company || 'Unknown'}

SIGNALS:
${signalFacts}

Rewrite the emailSequence with hyper-personalization:
- Reference specific signals in the initial email
- Make each email feel like it was written just for this person
- Keep under 150 words per email
- Natural, not salesy
- Sender signs as ${senderName}
- Do not mention funding, hiring, traffic drops, tech stack, product launches, competitors, or other factual company events unless the claim is supported by a signal with a citation URL. Uncited signals can only shape general tone.

Return full JSON: { strategy, angle, hook, subject, body, tone, reasoning, cta, emailSequence: [{subject, body, sequencePos, type}] }`;

      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You write hyper-personalized outreach. Always respond with valid JSON. Never invent company facts; factual claims must be supported by cited signals.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.75,
      });

      const responseText = completion.choices[0]?.message?.content || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return { ...strategy, ...parsed, emailSequence: parsed.emailSequence || strategy.emailSequence };
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') console.warn('[Personalizer] LLM failed:', error);
    }

    // Fallback: inject personalization into template sequence
    const company = context.lead.company || 'your organization';
    const topSignal = context.signals.find(signal => signal.sourceUrl);
    const sequence = strategy.emailSequence || [];

    if (sequence.length > 0) {
      sequence[0] = {
        ...sequence[0],
        body: `Hi ${firstName},\n\n${strategy.hook}\n\nBased on what I've seen at ${company}${topSignal ? ` — particularly around ${topSignal.content.slice(0, 60).toLowerCase()}` : ''} — I believe there's a meaningful opportunity.\n\n${strategy.cta || 'Would you be open to a quick chat?'}\n\nBest,\n${senderName}`,
      };
    }

    return { ...strategy, emailSequence: sequence, reasoning: `${strategy.reasoning} (Personalized)` };
  }
}
