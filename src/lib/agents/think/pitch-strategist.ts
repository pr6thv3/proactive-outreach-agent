// ─── THINK: Pitch Strategist Agent ────────────────────
// Refines outreach strategy with campaign context

import { BaseAgent } from '../base';
import { AgentContext, ThinkOutput, CampaignConfig } from '../types';

interface PitchStrategistInput {
  initialStrategy: ThinkOutput;
  campaignConfig?: CampaignConfig;
}

export class PitchStrategistAgent extends BaseAgent<PitchStrategistInput, ThinkOutput> {
  readonly name = 'PitchStrategist';
  readonly phase = 'think' as const;
  readonly description = 'Refines pitch with campaign-specific angle and hook';

  async execute(input: PitchStrategistInput, context: AgentContext): Promise<ThinkOutput> {
    const strategy = input.initialStrategy;
    const config = input.campaignConfig || context.campaignConfig;

    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;
      const zai = await ZAI.create();

      const prompt = `Refine this outreach strategy with a more compelling angle.

CURRENT: ${strategy.strategy} — ${strategy.angle}
LEAD: ${context.lead.name}, ${context.lead.title || 'Unknown'} at ${context.lead.company || 'Unknown'}
PRODUCT: ${config?.productDescription || 'Business solution'}
OFFER: ${config?.offer || 'Consultation'}
CTA: ${config?.cta || 'Book a call'}
SENDER: ${config?.senderName || 'Alex'}

Improve the emailSequence. Keep the same JSON format as input. Return the full object with strategy, angle, hook, subject, body, tone, reasoning, cta, emailSequence.`;

      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You refine cold outreach strategies. Always respond with valid JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.5,
      });

      const responseText = completion.choices[0]?.message?.content || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          ...strategy,
          strategy: parsed.strategy || strategy.strategy,
          angle: parsed.angle || strategy.angle,
          hook: parsed.hook || strategy.hook,
          emailSequence: parsed.emailSequence || strategy.emailSequence,
          reasoning: parsed.reasoning || strategy.reasoning,
        };
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') console.warn('[PitchStrategist] LLM failed:', error);
    }

    return { ...strategy, angle: `${config?.targetAudience || context.lead.company || 'Industry'}: ${strategy.angle}` };
  }
}
