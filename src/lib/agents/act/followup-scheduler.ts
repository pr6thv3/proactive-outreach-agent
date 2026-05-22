// ─── ACT: Follow-up Scheduler Agent ──────────────────
// Schedules follow-ups from campaign config with generated bodies

import { BaseAgent } from '../base';
import { AgentContext, ActOutput, FollowUpType } from '../types';
import { db } from '@/lib/db';
import { addDays } from 'date-fns';

interface FollowUpSchedulerInput {
  messageId: string;
  schedule?: number[]; // day offsets, e.g. [3, 7, 14]
}

const FU_TYPES: FollowUpType[] = ['reminder', 'value_add', 'check_in', 'last_attempt'];

export class FollowUpSchedulerAgent extends BaseAgent<FollowUpSchedulerInput, ActOutput> {
  readonly name = 'FollowUpScheduler';
  readonly phase = 'act' as const;
  readonly description = 'Schedules follow-ups from campaign config with sequence bodies';

  async execute(input: FollowUpSchedulerInput, context: AgentContext): Promise<ActOutput> {
    const messageId = input.messageId;
    const message = await db.outreachMessage.findUnique({ where: { id: messageId } });
    if (!message) throw new Error(`Message ${messageId} not found`);

    // Get schedule from campaign config or input
    const schedule = input.schedule || context.campaignConfig?.followUpSchedule || [3, 7, 14];

    // Find the generated follow-up messages for this lead
    const allMessages = await db.outreachMessage.findMany({
      where: { leadId: context.leadId, campaignId: context.campaignId, sequencePos: { gt: 0 } },
      orderBy: { sequencePos: 'asc' },
    });

    const scheduledFollowUps: Array<{ type: FollowUpType; scheduledAt: Date }> = [];

    for (let i = 0; i < schedule.length; i++) {
      const daysOffset = schedule[i];
      const scheduledAt = addDays(new Date(), daysOffset);
      const fuType = FU_TYPES[i] || 'check_in';
      const sequencePos = i + 1;

      // Use the body from the generated email sequence if available
      const generatedFollow = allMessages.find(m => m.sequencePos === sequencePos);
      const body = generatedFollow?.body || null;

      // If we have a generated follow-up, use its ID; otherwise create a new follow-up
      const followUp = await db.followUp.create({
        data: { messageId, scheduledAt, status: 'scheduled', type: fuType, body, sequencePos },
      });

      scheduledFollowUps.push({ type: followUp.type as FollowUpType, scheduledAt: followUp.scheduledAt });
    }

    await db.activity.create({
      data: { type: 'followup_scheduled', description: `${schedule.length} follow-ups scheduled`, phase: 'act', leadId: context.leadId, metadata: JSON.stringify({ schedule }) },
    });

    return { messageId, channel: message.channel as ActOutput['channel'], crmLogged: false, followUpsScheduled: scheduledFollowUps };
  }
}
