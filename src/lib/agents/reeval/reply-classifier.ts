// ─── RE-EVAL: Reply Classifier Agent ─────────────────
// Classifies replies, stops sequences on negative/unsub, blacklists unsubs

import { BaseAgent } from '../base';
import { AgentContext, ReEvalOutput, ReplyCategory } from '../types';
import { db } from '@/lib/db';
import { addToDncList } from '@/lib/safety';

interface ReplyClassifierInput {
  messageId: string;
  replyText: string;
}

export class ReplyClassifierAgent extends BaseAgent<ReplyClassifierInput, ReEvalOutput> {
  readonly name = 'ReplyClassifier';
  readonly phase = 'reeval' as const;
  readonly description = 'Classifies replies, stops sequences, blacklists unsubs, notifies on interest';

  async execute(input: ReplyClassifierInput, context: AgentContext): Promise<ReEvalOutput> {
    const { messageId, replyText } = input;

    let result: ReEvalOutput;

    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;
      const zai = await ZAI.create();

      const prompt = `Classify this sales outreach reply.

PROSPECT: ${context.lead.name} at ${context.lead.company || 'Unknown'}
REPLY: """${replyText}"""

Categories: interested, neutral, negative, unsubscribe, needs_info, out_of_office
Also provide: confidence (0-1), reasoning, nextAction (escalate|auto_reply|schedule_followup|mark_unsub|stop_sequence|no_action)

JSON: {"category":"...","confidence":0.9,"reasoning":"...","nextAction":"..."}`;

      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You classify sales replies. Always respond with valid JSON. Be conservative.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      });

      const jsonMatch = (completion.choices[0]?.message?.content || '').match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const p = JSON.parse(jsonMatch[0]);
        result = {
          category: p.category || 'neutral',
          confidence: Math.min(1, Math.max(0, p.confidence || 0.5)),
          reasoning: p.reasoning || 'LLM classification',
          nextAction: p.nextAction || 'no_action',
        };
      } else {
        result = classifyByRules(replyText);
      }
    } catch {
      result = classifyByRules(replyText);
    }

    // ═══ POST-CLASSIFICATION ACTIONS ═══
    await saveClassification(messageId, result, replyText);
    await applyClassificationActions(context.leadId, messageId, result);

    return result;
  }
}

async function saveClassification(messageId: string, result: ReEvalOutput, replyText: string) {
  await db.replyClassification.create({ data: { messageId, category: result.category, confidence: result.confidence, reasoning: result.reasoning, replyText, nextAction: result.nextAction } });
  await db.outreachMessage.update({ where: { id: messageId }, data: { status: 'replied' } });
}

async function applyClassificationActions(leadId: string, messageId: string, result: ReEvalOutput) {
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) return;

  switch (result.category) {
    case 'unsubscribe':
      // Add to DNC, blacklist, cancel all follow-ups
      await addToDncList(lead.email, 'unsubscribed', 'reply_classifier', leadId);
      await db.lead.update({ where: { id: leadId }, data: { status: 'unsubscribed', doNotContact: true, isBlacklisted: true } });
      await cancelAllFollowUps(leadId);
      await db.activity.create({ data: { type: 'lead_unsubscribed', description: `${lead.name} unsubscribed. Added to DNC list.`, phase: 'reeval', leadId } });
      break;

    case 'negative':
      // Stop the sequence, but don't blacklist
      await db.lead.update({ where: { id: leadId }, data: { status: 'negative' } });
      await cancelAllFollowUps(leadId);
      await db.activity.create({ data: { type: 'reply_classified', description: `${lead.name} replied negatively. Sequence stopped.`, phase: 'reeval', leadId, metadata: JSON.stringify({ category: 'negative', confidence: result.confidence }) } });
      break;

    case 'interested':
      // Notify, escalate
      await db.lead.update({ where: { id: leadId }, data: { status: 'interested' } });
      await db.activity.create({ data: { type: 'reply_classified', description: `${lead.name} is INTERESTED! Escalate immediately.`, phase: 'reeval', leadId, metadata: JSON.stringify({ category: 'interested', confidence: result.confidence, replySnippet: result.reasoning }) } });
      break;

    case 'neutral':
      await db.lead.update({ where: { id: leadId }, data: { status: 'replied' } });
      await db.activity.create({ data: { type: 'reply_classified', description: `${lead.name} replied neutrally.`, phase: 'reeval', leadId } });
      break;

    case 'needs_info':
      await db.lead.update({ where: { id: leadId }, data: { status: 'replied' } });
      await db.activity.create({ data: { type: 'reply_classified', description: `${lead.name} needs more info.`, phase: 'reeval', leadId } });
      break;

    case 'out_of_office':
      // Keep sequence running, schedule a re-check
      await db.activity.create({ data: { type: 'reply_classified', description: `${lead.name} is out of office. Sequence continues.`, phase: 'reeval', leadId } });
      break;
  }
}

async function cancelAllFollowUps(leadId: string) {
  // Find all messages for this lead, then cancel their scheduled follow-ups
  const messages = await db.outreachMessage.findMany({ where: { leadId }, select: { id: true } });
  const messageIds = messages.map(m => m.id);

  await db.followUp.updateMany({
    where: { messageId: { in: messageIds }, status: 'scheduled' },
    data: { status: 'cancelled' },
  });
}

function classifyByRules(replyText: string): ReEvalOutput {
  const lower = replyText.toLowerCase();

  if (lower.includes('unsubscribe') || lower.includes('remove me') || lower.includes('stop sending') || lower.includes('opt out') || lower.includes('no longer wish')) {
    return { category: 'unsubscribe', confidence: 0.95, reasoning: 'Explicit unsubscribe request', nextAction: 'mark_unsub' };
  }
  if (lower.includes('out of office') || lower.includes('auto-reply') || lower.includes('automatic reply')) {
    return { category: 'out_of_office', confidence: 0.9, reasoning: 'Out-of-office detected', nextAction: 'no_action' };
  }

  const posWords = ['yes', 'interested', 'sure', 'absolutely', "let's", 'schedule', 'meeting', 'call', 'tell me more', 'sounds good', 'great', 'demo'];
  const posCount = posWords.filter(w => lower.includes(w)).length;
  if (posCount >= 2) return { category: 'interested', confidence: 0.8 + posCount * 0.03, reasoning: `Positive signals (${posCount})`, nextAction: 'escalate' };

  const negWords = ['not interested', 'no thank', "don't need", 'pass', 'not for me', 'no longer', 'not looking', 'decline', 'not right now'];
  if (negWords.some(w => lower.includes(w))) return { category: 'negative', confidence: 0.8, reasoning: 'Negative language', nextAction: 'stop_sequence' };

  const infoWords = ['more info', 'details', 'how does', 'pricing', 'cost'];
  if (infoWords.some(w => lower.includes(w))) return { category: 'needs_info', confidence: 0.7, reasoning: 'Info request', nextAction: 'auto_reply' };

  return { category: 'neutral', confidence: 0.4, reasoning: 'Unclear intent', nextAction: 'no_action' };
}
