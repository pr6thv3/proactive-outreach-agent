// ─── RE-EVAL: Reply Classifier Agent ─────────────────
// Classifies inbound prospect replies into 6 categories:
// 1. interested, 2. meeting_request, 3. question, 4. not_interested, 5. out_of_office, 6. unsubscribe
// Handles real-time routing: SDR escalation, calendar booking, contextual answering, OOO snoozing, and permanent DNC suppression.

import { BaseAgent } from '../base';
import { AgentContext, ReEvalOutput, ReplyCategory } from '../types';
import { db } from '@/lib/db';
import { addToDncList } from '@/lib/safety';
import { interruptSequence, snoozeSequence } from '../act/followup-scheduler';
import { addDays } from 'date-fns';

export interface ReplyClassifierInput {
  messageId: string;
  replyText: string;
}

export interface ClassifyReplyResult extends ReEvalOutput {
  calendarLink?: string;
  suggestedReply?: string;
  returnDate?: string;
  suppressed: boolean;
}

export class ReplyClassifierAgent extends BaseAgent<ReplyClassifierInput, ReEvalOutput> {
  readonly name = 'ReplyClassifier';
  readonly phase = 'reeval' as const;
  readonly description = 'Classifies replies into 6 categories, stops sequences, escalates meetings, snoozes OOO, and permanently suppresses unsubs';

  async execute(input: ReplyClassifierInput, context: AgentContext): Promise<ReEvalOutput> {
    const { messageId, replyText } = input;
    const leadName = context.lead?.name || 'Prospect';
    const companyName = context.lead?.company || 'Company';

    let result: ReEvalOutput;

    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;
      const zai = await ZAI.create();

      const prompt = `Classify this sales outreach reply into exactly one of the 6 canonical categories.

PROSPECT: ${leadName} at ${companyName}
REPLY: """${replyText}"""

Canonical Categories:
1. "meeting_request" (Explicit request or agreement to book a meeting, call, demo, or date/time offer)
2. "interested" (Positive interest, requesting more info/materials/case studies, open to learning more)
3. "question" (Specific questions regarding pricing, features, security, compliance, SOC2, integrations, etc.)
4. "not_interested" (Polite or firm refusal, not interested, passing, timing not right)
5. "out_of_office" (Automatic out of office notice, vacation, on leave, returning on date)
6. "unsubscribe" (Explicit opt-out, remove from list, stop contacting)

JSON Format:
{
  "category": "meeting_request" | "interested" | "question" | "not_interested" | "out_of_office" | "unsubscribe",
  "confidence": 0.95,
  "reasoning": "...",
  "nextAction": "book_meeting" | "escalate" | "auto_reply" | "stop_sequence" | "snooze_sequence" | "mark_unsub" | "no_action",
  "calendarLink": "https://cal.com/alex/15min",
  "suggestedReply": "..."
}`;

      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are an expert sales reply classifier. Always return valid JSON conforming to the 6 categories.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
      });

      const jsonMatch = (completion.choices[0]?.message?.content || '').match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const p = JSON.parse(jsonMatch[0]);
        const normalizedCategory = normalizeCategory(p.category);
        result = {
          category: normalizedCategory,
          confidence: Math.min(1, Math.max(0.1, p.confidence || 0.9)),
          reasoning: p.reasoning || `LLM classified as ${normalizedCategory}`,
          nextAction: p.nextAction || mapCategoryToNextAction(normalizedCategory),
          calendarLink: p.calendarLink || (normalizedCategory === 'meeting_request' || normalizedCategory === 'interested' ? 'https://cal.com/alex/15min' : undefined),
          suggestedReply: p.suggestedReply || generateSuggestedReply(normalizedCategory, replyText, leadName, companyName),
          returnDate: normalizedCategory === 'out_of_office' ? extractReturnDate(replyText)?.toISOString() : undefined,
          suppressed: normalizedCategory === 'unsubscribe',
        };
      } else {
        result = classifyByRules(replyText, leadName, companyName);
      }
    } catch {
      result = classifyByRules(replyText, leadName, companyName);
    }

    // ═══ POST-CLASSIFICATION PERSISTENCE & ROUTING ACTIONS ═══
    await saveClassification(messageId, result, replyText, context.organizationId);
    await applyClassificationActions(context.leadId, messageId, result, context.organizationId, replyText);

    return result;
  }
}

/**
 * Normalizes category string to ensure full compatibility with 6-category standard
 */
function normalizeCategory(category?: string): ReplyCategory {
  if (!category) return 'interested';
  const c = category.toLowerCase().trim();

  if (c === 'meeting_request' || c === 'meeting' || c === 'booking' || c === 'call_scheduled') return 'meeting_request';
  if (c === 'interested' || c === 'positive' || c === 'warm') return 'interested';
  if (c === 'question' || c === 'needs_info' || c === 'inquiry' || c === 'pricing') return 'question';
  if (c === 'out_of_office' || c === 'ooo' || c === 'away' || c === 'vacation') return 'out_of_office';
  if (c === 'unsubscribe' || c === 'opt_out' || c === 'dnc' || c === 'blacklist') return 'unsubscribe';
  if (c === 'not_interested' || c === 'negative' || c === 'declined' || c === 'rejected') return 'not_interested';

  return 'not_interested';
}

function mapCategoryToNextAction(category: ReplyCategory): ReEvalOutput['nextAction'] {
  switch (category) {
    case 'meeting_request':
      return 'escalate';
    case 'interested':
      return 'escalate';
    case 'question':
      return 'auto_reply';
    case 'out_of_office':
    case 'ooo':
      return 'snooze_sequence';
    case 'unsubscribe':
      return 'mark_unsub';
    case 'not_interested':
    case 'negative':
      return 'stop_sequence';
    default:
      return 'no_action';
  }
}

/**
 * Parse potential return dates from Out of Office messages
 */
export function extractReturnDate(text: string): Date | null {
  const lower = text.toLowerCase();
  const now = new Date();

  // 1. Regex for "until Month Day" or "back on Month Day"
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
                      'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec'];
  const monthRegex = new RegExp(`(?:until|back|returning|return)(?:\\s+on)?(?:\\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))?,?\\s+(${monthNames.join('|')})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?`, 'i');
  const monthMatch = lower.match(monthRegex);

  if (monthMatch) {
    const monthStr = monthMatch[1].toLowerCase();
    const day = parseInt(monthMatch[2], 10);
    const monthIdx = monthNames.findIndex(m => monthStr.startsWith(m)) % 12;

    const year = now.getFullYear();
    const targetDate = new Date(year, monthIdx, day);
    if (targetDate < now) {
      targetDate.setFullYear(year + 1);
    }
    return targetDate;
  }

  // 2. Regex for "until MM/DD" or "back on MM/DD/YYYY"
  const dateNumMatch = lower.match(/(?:until|back|return)\s+(?:on\s+)?(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?/i);
  if (dateNumMatch) {
    const month = parseInt(dateNumMatch[1], 10) - 1;
    const day = parseInt(dateNumMatch[2], 10);
    const year = dateNumMatch[3] ? (dateNumMatch[3].length === 2 ? 2000 + parseInt(dateNumMatch[3], 10) : parseInt(dateNumMatch[3], 10)) : now.getFullYear();
    const targetDate = new Date(year, month, day);
    if (targetDate < now && !dateNumMatch[3]) {
      targetDate.setFullYear(now.getFullYear() + 1);
    }
    return targetDate;
  }

  // 3. Days of the week like "until next Monday"
  if (lower.includes('next week') || lower.includes('next monday')) {
    return addDays(now, 7);
  }

  // Fallback: snooze for 7 days
  return addDays(now, 7);
}

/**
 * Generate contextual suggested response based on category, reply content, and lead information
 */
export function generateSuggestedReply(
  category: ReplyCategory,
  replyText: string,
  leadName: string,
  companyName: string,
  calendarLink = 'https://cal.com/alex/15min'
): string {
  const firstName = leadName.split(' ')[0] || leadName;
  const lower = replyText.toLowerCase();

  switch (category) {
    case 'meeting_request':
      return `Hi ${firstName},\n\nThanks for following up! I would love to connect. Here is my direct calendar link where you can pick a 15-minute slot that works best for your schedule:\n\n📅 ${calendarLink}\n\nLooking forward to speaking!`;

    case 'interested':
      return `Hi ${firstName},\n\nGlad to hear this aligns with what you're working on at ${companyName}! I've attached a brief 2-page overview of our platform along with recent deliverability benchmarks.\n\nIf you'd like to see a live 5-minute walkthrough, feel free to pick a time here: ${calendarLink}`;

    case 'question':
      if (lower.includes('soc2') || lower.includes('security') || lower.includes('compliance') || lower.includes('iso')) {
        return `Hi ${firstName},\n\nGreat question regarding compliance. We maintain strict SOC2 Type II certification, tenant-isolated data partitions, and end-to-end encryption for all API keys.\n\nYou can review our full security architecture whitepaper here: https://proactivereach.com/security. Would you like to review this together over a quick call?`;
      }
      if (lower.includes('price') || lower.includes('pricing') || lower.includes('cost') || lower.includes('plan')) {
        return `Hi ${firstName},\n\nOur plans start with transparent tiered pricing based on active outbound volume and include unlimited AI research cards and 7-gate deliverability protection.\n\nI can send over a custom quote tailored to ${companyName}'s team size if you can share roughly how many prospects you reach each month?`;
      }
      if (lower.includes('integration') || lower.includes('hubspot') || lower.includes('salesforce') || lower.includes('crm')) {
        return `Hi ${firstName},\n\nYes, we integrate bi-directionally with HubSpot, Salesforce, and custom webhooks, ensuring all replies and meeting bookings sync to your CRM in real time.\n\nHappy to show you the CRM sync workflow whenever convenient: ${calendarLink}`;
      }
      return `Hi ${firstName},\n\nThanks for reaching out with your question. We designed our system to solve exactly that for scaling teams like ${companyName}.\n\nI'd be happy to share more details or jump on a brief 10-minute call: ${calendarLink}`;

    case 'out_of_office':
      return `AI SDR Action: Out of Office detected. Follow-up sequence automatically snoozed until the prospect returns.`;

    case 'unsubscribe':
      return `AI SDR Action: Prospect requested unsubscribe. Permanently added to workspace Do-Not-Contact blacklist. All future dispatches permanently blocked.`;

    case 'not_interested':
    case 'negative':
      return `Hi ${firstName},\n\nUnderstood! Thanks for letting me know. I'll make sure not to bother you further. Wishing you and ${companyName} continued success!`;

    default:
      return `Hi ${firstName},\n\nThanks for your note. Let me know if you'd like to explore this further: ${calendarLink}`;
  }
}

/**
 * Robust rule-based classifier covering all 6 categories with confidence and nextAction
 */
export function classifyByRules(replyText: string, leadName = 'Prospect', companyName = 'Company'): ReEvalOutput {
  const lower = replyText.toLowerCase();

  // 1. Explicit Unsubscribe / Opt-Out (highest priority safety rule)
  if (
    lower.includes('unsubscribe') ||
    lower.includes('remove me') ||
    lower.includes('stop sending') ||
    lower.includes('stop emailing') ||
    lower.includes('opt out') ||
    lower.includes('opt-out') ||
    lower.includes('no longer wish') ||
    lower.includes('do not contact') ||
    lower.includes('take me off') ||
    lower.includes('delete my data') ||
    lower.includes('lose my email') ||
    lower.includes('spam')
  ) {
    return {
      category: 'unsubscribe',
      confidence: 0.98,
      reasoning: 'Explicit unsubscribe or opt-out phrase detected',
      nextAction: 'mark_unsub',
      suppressed: true,
      suggestedReply: generateSuggestedReply('unsubscribe', replyText, leadName, companyName),
    };
  }

  // 2. Out of Office / Auto-Reply
  if (
    lower.includes('out of office') ||
    lower.includes('out of the office') ||
    lower.includes('auto-reply') ||
    lower.includes('autoreply') ||
    lower.includes('automatic reply') ||
    lower.includes('away from my desk') ||
    lower.includes('on annual leave') ||
    lower.includes('on maternity leave') ||
    lower.includes('on paternity leave') ||
    lower.includes('returning on') ||
    lower.includes('back in the office') ||
    lower.includes('limited email access')
  ) {
    const returnDate = extractReturnDate(replyText);
    return {
      category: 'out_of_office',
      confidence: 0.95,
      reasoning: `Out of office detected (estimated return: ${returnDate ? returnDate.toLocaleDateString() : '7 days'})`,
      nextAction: 'snooze_sequence',
      returnDate: returnDate ? returnDate.toISOString() : undefined,
      suggestedReply: generateSuggestedReply('out_of_office', replyText, leadName, companyName),
    };
  }

  // 3. Not Interested / Negative (polite or firm rejection)
  const negWords = [
    'not interested',
    'no thank',
    'no thanks',
    "don't need",
    'not looking',
    'pass on this',
    'pass for now',
    'not for us',
    'not for me',
    'not right now',
    'not at this time',
    'no budget',
    'bad timing',
    'we already have',
    'decline',
    'not a fit',
  ];
  if (negWords.some(w => lower.includes(w))) {
    return {
      category: 'not_interested',
      confidence: 0.88,
      reasoning: 'Polite or direct disinterest indicated',
      nextAction: 'stop_sequence',
      suggestedReply: generateSuggestedReply('not_interested', replyText, leadName, companyName),
    };
  }

  // 4. Specific Meeting Time Proposal / Calendar Link Request
  const specificMeetingKeywords = [
    '15 mins',
    '15 minutes',
    '30 mins',
    '30 minutes',
    'send calendar',
    'send your calendar',
    'calendar link',
    'cal.com',
    'calendly',
    'thursday at',
    'tuesday at',
    'wednesday at',
    'monday at',
    'friday at',
    '2pm',
    '3pm',
    '10am',
    '11am',
  ];
  if (specificMeetingKeywords.some(w => lower.includes(w)) && !lower.includes('not interested')) {
    return {
      category: 'meeting_request',
      confidence: 0.94,
      reasoning: 'Specific meeting time proposal or calendar link request detected',
      nextAction: 'escalate',
      calendarLink: 'https://cal.com/alex/15min',
      suggestedReply: generateSuggestedReply('meeting_request', replyText, leadName, companyName),
    };
  }

  // 5. General Positive Interest
  const posWords = [
    'absolutely interested',
    'very interested',
    'interested',
    'sounds interesting',
    'sounds good',
    'tell me more',
    'send over details',
    'send info',
    'share more',
    'would love to learn',
    'yes please',
    'great timing',
    'relevant for us',
    'let us know',
    "let's connect",
  ];
  const posCount = posWords.filter(w => lower.includes(w)).length;
  if (posCount >= 1 || (lower.includes('yes') && !lower.includes('no') && lower.length < 50)) {
    return {
      category: 'interested',
      confidence: Math.min(0.95, 0.8 + posCount * 0.05),
      reasoning: `Positive buying signals detected (${posCount})`,
      nextAction: 'escalate',
      calendarLink: 'https://cal.com/alex/15min',
      suggestedReply: generateSuggestedReply('interested', replyText, leadName, companyName),
    };
  }

  // 6. General Meeting / Demo Request
  const generalMeetingKeywords = [
    'let us schedule a call',
    "let's schedule a call",
    'schedule a call',
    'schedule a demo',
    'book a time',
    'set up a call',
    'have time',
    'hop on a zoom',
    'jump on a call',
  ];
  if (generalMeetingKeywords.some(w => lower.includes(w))) {
    return {
      category: 'meeting_request',
      confidence: 0.9,
      reasoning: 'Meeting or demo request detected',
      nextAction: 'escalate',
      calendarLink: 'https://cal.com/alex/15min',
      suggestedReply: generateSuggestedReply('meeting_request', replyText, leadName, companyName),
    };
  }

  // 7. Questions / Clarifications (Pricing, Security, Features)
  const questionWords = ['how does', 'what is', 'how much', 'cost', 'pricing', 'pricing model', 'soc2', 'security', 'integration', 'hubspot', 'salesforce', 'case study', 'compare'];
  if (questionWords.some(w => lower.includes(w)) || lower.includes('?')) {
    return {
      category: 'question',
      confidence: 0.85,
      reasoning: 'Inquiry or question regarding product, pricing, or compliance',
      nextAction: 'auto_reply',
      suggestedReply: generateSuggestedReply('question', replyText, leadName, companyName),
    };
  }

  // Fallback: Neutral intent
  return {
    category: 'neutral',
    confidence: 0.4,
    reasoning: 'Unclear or neutral intent; no automated sequence change',
    nextAction: 'no_action',
    suggestedReply: generateSuggestedReply('neutral', replyText, leadName, companyName),
  };
}

async function saveClassification(messageId: string, result: ReEvalOutput, replyText: string, organizationId?: string) {
  await db.replyClassification.create({
    data: {
      organizationId,
      messageId,
      category: result.category,
      confidence: result.confidence,
      reasoning: result.reasoning,
      replyText,
      nextAction: result.nextAction,
    },
  });
  await db.outreachMessage.updateMany({
    where: {
      id: messageId,
      ...(organizationId ? { organizationId } : {}),
    },
    data: { status: 'replied' },
  });
}

async function applyClassificationActions(
  leadId: string,
  messageId: string,
  result: ReEvalOutput,
  organizationId?: string,
  replyText?: string
) {
  const scopedWhere = organizationId ? { organizationId } : {};
  const lead = await db.lead.findFirst({ where: { id: leadId, ...scopedWhere } });
  if (!lead) return;

  switch (result.category) {
    case 'unsubscribe':
      // 1. Permanent Blacklist, DNC addition, and cancel all scheduled follow-ups
      await addToDncList(lead.email, 'unsubscribed', 'reply_classifier', leadId, organizationId || lead.organizationId || undefined);
      await db.lead.updateMany({
        where: { id: leadId, ...scopedWhere },
        data: {
          status: 'unsubscribed',
          doNotContact: true,
          isBlacklisted: true,
        },
      });
      await interruptSequence({
        leadId,
        organizationId,
        reason: 'unsubscribe',
        note: 'Opt-out request processed. Permanent DNC suppression active.',
      });
      await db.activity.create({
        data: {
          organizationId,
          type: 'lead_unsubscribed',
          description: `${lead.name} (${lead.email}) unsubscribed. Added to permanent DNC list with 0 future sends.`,
          phase: 'reeval',
          leadId,
        },
      });
      break;

    case 'not_interested':
    case 'negative':
      // Stop the multi-step sequence immediately
      await db.lead.updateMany({
        where: { id: leadId, ...scopedWhere },
        data: { status: 'negative' },
      });
      await interruptSequence({
        leadId,
        organizationId,
        reason: 'reply',
        note: 'Lead replied not interested. Sequence halted.',
      });
      await db.activity.create({
        data: {
          organizationId,
          type: 'reply_classified',
          description: `${lead.name} indicated not interested. Multi-step follow-up sequence halted.`,
          phase: 'reeval',
          leadId,
          metadata: JSON.stringify({ category: 'not_interested', confidence: result.confidence }),
        },
      });
      break;

    case 'meeting_request':
      // Meeting booking escalation: halt sequence, update lead, create high-priority notification
      await db.lead.updateMany({
        where: { id: leadId, ...scopedWhere },
        data: { status: 'interested' },
      });
      await interruptSequence({
        leadId,
        organizationId,
        reason: 'meeting_booking',
        note: 'Meeting request received. Sequence halted for SDR calendar booking.',
      });
      await db.activity.create({
        data: {
          organizationId,
          type: 'reply_classified',
          description: `HIGH PRIORITY: ${lead.name} requested a MEETING! Calendar link: ${result.calendarLink || 'https://cal.com/alex/15min'}`,
          phase: 'reeval',
          leadId,
          metadata: JSON.stringify({
            category: 'meeting_request',
            confidence: result.confidence,
            calendarLink: result.calendarLink,
            replySnippet: replyText?.slice(0, 150),
          }),
        },
      });
      break;

    case 'interested':
      // Escalate warm lead
      await db.lead.updateMany({
        where: { id: leadId, ...scopedWhere },
        data: { status: 'interested' },
      });
      await interruptSequence({
        leadId,
        organizationId,
        reason: 'reply',
        note: 'Lead is interested. Cold follow-up sequence halted.',
      });
      await db.activity.create({
        data: {
          organizationId,
          type: 'reply_classified',
          description: `WARM LEAD: ${lead.name} expressed INTEREST! Escalate to SDR.`,
          phase: 'reeval',
          leadId,
          metadata: JSON.stringify({
            category: 'interested',
            confidence: result.confidence,
            calendarLink: result.calendarLink,
            replySnippet: replyText?.slice(0, 150),
          }),
        },
      });
      break;

    case 'question':
    case 'needs_info':
      await db.lead.updateMany({
        where: { id: leadId, ...scopedWhere },
        data: { status: 'replied' },
      });
      await interruptSequence({
        leadId,
        organizationId,
        reason: 'reply',
        note: 'Question received from prospect. Sequence halted for contextual reply.',
      });
      await db.activity.create({
        data: {
          organizationId,
          type: 'reply_classified',
          description: `${lead.name} asked a question. AI SDR pre-drafted contextual answer.`,
          phase: 'reeval',
          leadId,
          metadata: JSON.stringify({
            category: 'question',
            confidence: result.confidence,
            suggestedReply: result.suggestedReply,
          }),
        },
      });
      break;

    case 'out_of_office':
    case 'ooo': {
      const returnDate = extractReturnDate(replyText || '') || addDays(new Date(), 7);
      await snoozeSequence({
        leadId,
        resumeDate: returnDate,
        organizationId,
        reason: 'Prospect out of office',
      });
      await db.activity.create({
        data: {
          organizationId,
          type: 'reply_classified',
          description: `${lead.name} is Out of Office. Sequence snoozed until ${returnDate.toLocaleDateString()}.`,
          phase: 'reeval',
          leadId,
          metadata: JSON.stringify({
            category: 'out_of_office',
            returnDate: returnDate.toISOString(),
          }),
        },
      });
      break;
    }
  }
}

/**
 * Top-level function conforming directly to Interface Contract #4:
 * Input: { replyText: string, messageId: string, leadId: string, organizationId: string }
 * Output: { category: "interested" | "meeting_request" | "question" | "not_interested" | "out_of_office" | "unsubscribe", confidence: number, nextAction: string, calendarLink?: string, suppressed: boolean }
 */
export async function classifyReply(params: {
  replyText: string;
  messageId?: string;
  leadId?: string;
  organizationId?: string;
}): Promise<ClassifyReplyResult> {
  const { replyText, messageId, leadId, organizationId } = params;

  let leadName = 'Prospect';
  let companyName = 'Company';
  let resolvedLeadId = leadId || '';
  let resolvedMessageId = messageId || '';

  if (resolvedLeadId) {
    const lead = await db.lead.findFirst({
      where: { id: resolvedLeadId, ...(organizationId ? { organizationId } : {}) },
    });
    if (lead) {
      leadName = lead.name;
      companyName = lead.company || 'Company';
    }
  }

  if (!resolvedMessageId && resolvedLeadId) {
    const lastMsg = await db.outreachMessage.findFirst({
      where: { leadId: resolvedLeadId, ...(organizationId ? { organizationId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    if (lastMsg) resolvedMessageId = lastMsg.id;
  }

  const rawResult = classifyByRules(replyText, leadName, companyName);

  if (resolvedMessageId) {
    await saveClassification(resolvedMessageId, rawResult, replyText, organizationId);
  }

  if (resolvedLeadId) {
    await applyClassificationActions(resolvedLeadId, resolvedMessageId, rawResult, organizationId, replyText);
  }

  return {
    ...rawResult,
    suppressed: rawResult.category === 'unsubscribe',
    calendarLink: rawResult.calendarLink || (rawResult.category === 'meeting_request' || rawResult.category === 'interested' ? 'https://cal.com/alex/15min' : undefined),
    suggestedReply: rawResult.suggestedReply || generateSuggestedReply(rawResult.category, replyText, leadName, companyName),
    returnDate: rawResult.returnDate ? (rawResult.returnDate instanceof Date ? rawResult.returnDate.toISOString() : String(rawResult.returnDate)) : undefined,
  };
}
