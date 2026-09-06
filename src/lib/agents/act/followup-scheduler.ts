// ─── ACT: Follow-up Scheduler Agent ──────────────────
// Schedules dynamic 4-step sequences (Day 1 Initial, Day 3 Bump, Day 7 Value Case Study, Day 12 Breakup with calendar link)
// and handles real-time sequence interruption upon reply, meeting booking, bounce, or unsubscribe.

import { BaseAgent } from '../base';
import { AgentContext, ActOutput, FollowUpType } from '../types';
import { db } from '@/lib/db';
import { addDays, setHours, setMinutes, setSeconds } from 'date-fns';

export interface FollowUpSchedulerInput {
  messageId: string;
  schedule?: number[]; // Day offsets e.g. [3, 7, 12] (relative to initial send) or [1, 3, 7, 12]
  customTemplates?: Array<{
    sequencePos: number;
    type: FollowUpType;
    subject?: string;
    body: string;
  }>;
}

export const DEFAULT_4_STEP_SCHEDULE = [3, 7, 12]; // Offsets in days for Followup 1, Followup 2, Followup 3

export const DEFAULT_4_STEP_TYPES: FollowUpType[] = ['reminder', 'value_add', 'check_in'];

/**
 * Generate a dynamic 4-step sequence tailored to prospect context and trigger signal
 */
export function generateDefaultSequence(
  lead: { name: string; company?: string; title?: string },
  signal?: { type?: string; content?: string },
  calendarLink = 'https://cal.com/alex/15min'
): Array<{
  sequencePos: number;
  dayOffset: number;
  type: FollowUpType | 'initial';
  typeLabel: string;
  subject: string;
  body: string;
}> {
  const firstName = lead.name.split(' ')[0] || lead.name;
  const company = lead.company || 'your team';
  const signalMention = signal?.content
    ? `given ${signal.content.toLowerCase()}`
    : `given your focus on scaling outbound at ${company}`;

  return [
    {
      sequencePos: 0,
      dayOffset: 1,
      type: 'initial',
      typeLabel: 'Day 1: Initial Signal-Grounded Outreach',
      subject: `Scaling outbound at ${company}`,
      body: `Hi ${firstName},\n\nI noticed ${signalMention} at ${company}. We built an autonomous AI SDR platform with a 7-step deliverability circuit breaker that eliminates bounce risks and lands 99.4% in primary inboxes.\n\nWould you be open to a quick 5-minute walkthrough this week?`,
    },
    {
      sequencePos: 1,
      dayOffset: 3,
      type: 'reminder',
      typeLabel: 'Day 3: Contextual Bump',
      subject: `Re: Scaling outbound at ${company}`,
      body: `Hi ${firstName},\n\nQuick bump on my note from earlier this week. Wanted to see if deliverability and pipeline automation are priorities for ${company} this quarter?\n\nHappy to share a quick 2-minute Loom if preferred.`,
    },
    {
      sequencePos: 2,
      dayOffset: 7,
      type: 'value_add',
      typeLabel: 'Day 7: Value & ROI Case Study',
      subject: `Case Study: 3.4x pipeline for ${company}'s peers`,
      body: `Hi ${firstName},\n\nThought you might find this relevant—a high-growth peer in your space recently automated their prospect discovery and inbox triage with our AI SDR, increasing qualified meetings by 3.4x while keeping spam rates under 0.02%.\n\nHere is the benchmark breakdown if you'd like to inspect the data: https://proactivereach.com/case-studies/b2b-growth`,
    },
    {
      sequencePos: 3,
      dayOffset: 12,
      type: 'last_attempt',
      typeLabel: 'Day 12: Breakup Email with Direct Calendar Link',
      subject: `Closing the loop regarding ${company}`,
      body: `Hi ${firstName},\n\nI assume outbound automation isn't a top priority for ${company} right now—I'll stop following up so I don't clutter your inbox.\n\nIf timing ever aligns in the future, feel free to grab 15 minutes directly on my calendar here: ${calendarLink}\n\nWishing you and the team all the best!`,
    },
  ];
}

export class FollowUpSchedulerAgent extends BaseAgent<FollowUpSchedulerInput, ActOutput> {
  readonly name = 'FollowUpScheduler';
  readonly phase = 'act' as const;
  readonly description = 'Schedules dynamic 4-step sequences with signal-grounded copy and breakup calendar links';

  async execute(input: FollowUpSchedulerInput, context: AgentContext): Promise<ActOutput> {
    const messageId = input.messageId;
    const message = await db.outreachMessage.findUnique({ where: { id: messageId } });
    if (!message) throw new Error(`Message ${messageId} not found`);

    // Determine schedule offsets (default: [3, 7, 12] for 3 follow-ups following the initial email)
    const schedule = input.schedule || context.campaignConfig?.followUpSchedule || DEFAULT_4_STEP_SCHEDULE;

    // Find any pre-generated sequence messages in DB for this lead & campaign
    const allMessages = await db.outreachMessage.findMany({
      where: {
        leadId: context.leadId,
        ...(context.campaignId ? { campaignId: context.campaignId } : {}),
        sequencePos: { gt: 0 },
        ...(context.organizationId ? { organizationId: context.organizationId } : {}),
      },
      orderBy: { sequencePos: 'asc' },
    });

    // Generate fallback template copy if DB messages don't exist yet
    const defaultTemplates = generateDefaultSequence(
      {
        name: context.lead.name,
        company: context.lead.company,
        title: context.lead.title,
      },
      context.signals?.[0]
    );

    const scheduledFollowUps: Array<{ type: FollowUpType; scheduledAt: Date }> = [];

    for (let i = 0; i < schedule.length; i++) {
      const daysOffset = schedule[i];
      const baseDate = addDays(new Date(), daysOffset);
      // Set to standard 10:00 AM send time with slight jitter
      const scheduledAt = setSeconds(setMinutes(setHours(baseDate, 10), Math.floor(Math.random() * 30)), 0);
      const fuType = (DEFAULT_4_STEP_TYPES[i] || 'check_in') as FollowUpType;
      const sequencePos = i + 1;

      // Extract body from custom templates, generated messages, or default 4-step templates
      const customTemplate = input.customTemplates?.find(t => t.sequencePos === sequencePos);
      const generatedFollow = allMessages.find(m => m.sequencePos === sequencePos);
      const defaultStep = defaultTemplates.find(t => t.sequencePos === sequencePos);

      const body = customTemplate?.body || generatedFollow?.body || defaultStep?.body || null;
      const subject = customTemplate?.subject || generatedFollow?.subject || defaultStep?.subject || `Re: ${message.subject || 'Outreach'}`;

      const followUp = await db.followUp.create({
        data: {
          messageId,
          scheduledAt,
          status: 'scheduled',
          type: fuType,
          body,
          sequencePos,
          subject,
          organizationId: context.organizationId,
        },
      });

      scheduledFollowUps.push({
        type: followUp.type as FollowUpType,
        scheduledAt: followUp.scheduledAt,
      });
    }

    await db.activity.create({
      data: {
        organizationId: context.organizationId,
        type: 'followup_scheduled',
        description: `${schedule.length}-step follow-up sequence scheduled for ${context.lead.name}`,
        phase: 'act',
        leadId: context.leadId,
        metadata: JSON.stringify({
          schedule,
          stepsCount: scheduledFollowUps.length,
          stepTypes: scheduledFollowUps.map(s => s.type),
        }),
      },
    });

    return {
      messageId,
      channel: (message.channel || 'email') as ActOutput['channel'],
      crmLogged: false,
      followUpsScheduled: scheduledFollowUps,
    };
  }
}

/**
 * Dynamic Sequence Interruption:
 * Automatically halts all pending/scheduled follow-ups upon reply, meeting booking, bounce, or unsubscribe.
 */
export async function interruptSequence(
  paramsOrLeadId: string | { leadId: string; organizationId?: string; reason?: 'reply' | 'meeting_booking' | 'bounce' | 'unsubscribe' | 'manual'; note?: string },
  orgIdParam?: string,
  reasonParam?: string,
  noteParam?: string
): Promise<{ success: boolean; cancelledCount: number; leadId: string }> {
  let leadId: string;
  let organizationId: string | undefined;
  let reason: string = 'reply';
  let note: string | undefined;

  if (typeof paramsOrLeadId === 'object') {
    leadId = paramsOrLeadId.leadId;
    organizationId = paramsOrLeadId.organizationId;
    reason = paramsOrLeadId.reason || 'reply';
    note = paramsOrLeadId.note;
  } else {
    leadId = paramsOrLeadId;
    organizationId = orgIdParam;
    reason = reasonParam || 'reply';
    note = noteParam;
  }

  const scopedWhere = organizationId ? { organizationId } : {};

  // 1. Find all outreach messages associated with this lead
  const messages = await db.outreachMessage.findMany({
    where: { leadId, ...scopedWhere },
    select: { id: true },
  });
  const messageIds = messages.map((m: any) => m.id);

  let cancelledCount = 0;

  if (messageIds.length > 0) {
    // 2. Cancel all scheduled follow-ups
    const result = await db.followUp.updateMany({
      where: {
        messageId: { in: messageIds },
        status: 'scheduled',
      },
      data: {
        status: 'cancelled',
      },
    });
    cancelledCount = result.count || 0;
  }

  // 3. Update campaign lead status if enrolled
  const leadStatusMap: Record<string, string> = {
    reply: 'REPLIED',
    meeting_booking: 'COMPLETED',
    bounce: 'BOUNCED',
    unsubscribe: 'UNSUBSCRIBED',
    manual: 'COMPLETED',
  };
  const targetCampaignStatus = leadStatusMap[reason] || 'COMPLETED';

  await db.campaignLead.updateMany({
    where: { leadId, ...scopedWhere },
    data: { status: targetCampaignStatus },
  }).catch(() => {});

  // 4. Log audit activity
  if (organizationId && leadId) {
    await db.activity.create({
      data: {
        organizationId,
        type: 'sequence_interrupted',
        description: `Sequence dynamically halted (${cancelledCount} follow-ups cancelled) due to: ${reason}${note ? ` (${note})` : ''}`,
        phase: 'reeval',
        leadId,
        metadata: JSON.stringify({ reason, cancelledCount, note }),
      },
    }).catch(() => {});
  }

  return { success: true, cancelledCount, leadId };
}

/**
 * Standalone helper to cancel all scheduled follow-ups for a lead
 */
export async function cancelAllFollowUps(leadId: string, organizationId?: string, reason = 'Sequence cancelled'): Promise<number> {
  const res = await interruptSequence({
    leadId,
    organizationId,
    reason: 'manual',
    note: reason,
  });
  return res.cancelledCount;
}

/**
 * Snooze Sequence for Out of Office:
 * Reschedules all pending follow-ups to resume after the return date.
 */
export async function snoozeSequence(params: {
  leadId: string;
  resumeDate: Date;
  organizationId?: string;
  reason?: string;
}): Promise<{ success: boolean; snoozedCount: number; resumeDate: Date }> {
  const { leadId, resumeDate, organizationId, reason } = params;
  const scopedWhere = organizationId ? { organizationId } : {};

  // Set resume time to 10:00 AM on resumeDate
  const targetResume = setSeconds(setMinutes(setHours(resumeDate, 10), 0), 0);

  const messages = await db.outreachMessage.findMany({
    where: { leadId, ...scopedWhere },
    select: { id: true },
  });
  const messageIds = messages.map((m: any) => m.id);

  let snoozedCount = 0;

  if (messageIds.length > 0) {
    const scheduledFollowups = await db.followUp.findMany({
      where: {
        messageId: { in: messageIds },
        status: 'scheduled',
      },
      orderBy: { sequencePos: 'asc' },
    });

    for (let i = 0; i < scheduledFollowups.length; i++) {
      const fu = scheduledFollowups[i];
      // Step spacing preserved: first follow-up at targetResume, subsequent follow-ups spaced out
      const stepOffsetDays = i === 0 ? 0 : (i === 1 ? 4 : 9);
      const newScheduledDate = addDays(targetResume, stepOffsetDays);

      await db.followUp.update({
        where: { id: fu.id },
        data: {
          scheduledAt: newScheduledDate,
          status: 'scheduled',
        },
      });
      snoozedCount++;
    }
  }

  // Update nextStepAt on CampaignLead
  await db.campaignLead.updateMany({
    where: { leadId, ...scopedWhere },
    data: { nextStepAt: targetResume },
  });

  await db.activity.create({
    data: {
      organizationId,
      type: 'sequence_snoozed',
      description: `Sequence snoozed until ${targetResume.toLocaleDateString()} (${snoozedCount} follow-ups rescheduled)${reason ? `: ${reason}` : ''}`,
      phase: 'reeval',
      leadId,
      metadata: JSON.stringify({ resumeDate: targetResume.toISOString(), snoozedCount, reason }),
    },
  });

  return { success: true, snoozedCount, resumeDate: targetResume };
}
