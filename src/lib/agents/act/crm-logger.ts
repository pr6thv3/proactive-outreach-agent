// ─── ACT: CRM Logger Agent ────────────────────────────
// Production CRM logging with full lifecycle tracking

import { BaseAgent } from '../base';
import { AgentContext, ActOutput, MessageData } from '../types';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';

interface CRMLoggerInput {
  message: MessageData;
  emailSequence?: Array<{ subject: string; body: string; sequencePos: number; type: string }>;
  notes?: string;
}

export class CRMLoggerAgent extends BaseAgent<CRMLoggerInput, ActOutput> {
  readonly name = 'CRMLogger';
  readonly phase = 'act' as const;
  readonly description = 'Logs outreach data to CRM with lifecycle tracking and activity timeline';

  async execute(input: CRMLoggerInput, context: AgentContext): Promise<ActOutput> {
    const message = input.message;
    const leadId = context.leadId;
    let mainMessageId = message.id;
    const scopedWhere = context.organizationId ? { organizationId: context.organizationId } : {};
    const evidenceSnapshot = toPrismaJson(message.evidenceSnapshot);

    // 1. Save the initial email message
    const existing = await db.outreachMessage.findFirst({ where: { id: message.id, ...scopedWhere } });
    if (!existing) {
      await db.outreachMessage.create({
        data: {
          id: message.id,
          organizationId: context.organizationId,
          subject: message.subject,
          body: message.body,
          channel: message.channel || 'email',
          status: 'generated',
          strategy: message.strategy,
          angle: message.angle,
          tone: message.tone,
          cta: message.cta,
          evidenceSnapshot,
          sequencePos: 0,
          leadId,
          campaignId: context.campaignId,
        },
      });
    } else {
      await db.outreachMessage.updateMany({
        where: { id: message.id, ...scopedWhere },
        data: { subject: message.subject, body: message.body, status: 'generated', strategy: message.strategy, angle: message.angle, tone: message.tone, cta: message.cta, evidenceSnapshot },
      });
    }

    // 2. Save follow-up messages from the email sequence
    if (input.emailSequence) {
      for (const email of input.emailSequence) {
        if (email.sequencePos === 0) continue; // Already saved above
        const followUpId = `${message.id}_seq${email.sequencePos}`;
        const existingFollow = await db.outreachMessage.findFirst({ where: { id: followUpId, ...scopedWhere } });
        if (!existingFollow) {
          await db.outreachMessage.create({
            data: {
              id: followUpId,
              organizationId: context.organizationId,
              subject: email.subject,
              body: email.body,
              channel: 'email',
              status: 'generated',
              strategy: message.strategy,
              angle: message.angle,
              tone: message.tone,
              cta: message.cta,
              evidenceSnapshot,
              sequencePos: email.sequencePos,
              leadId,
              campaignId: context.campaignId,
            },
          });
        }
      }
    }

    // 3. Update lead status to "generated"
    await db.lead.updateMany({ where: { id: leadId, ...scopedWhere }, data: { status: 'generated' } });

    // 4. Create activity records
    await db.activity.createMany({
      data: [
        { organizationId: context.organizationId, type: 'email_generated', description: `Email generated: "${message.subject}"`, phase: 'think', leadId, metadata: JSON.stringify({ messageId: message.id, sequenceLength: (input.emailSequence?.length || 1) }) },
        { organizationId: context.organizationId, type: 'campaign_assigned', description: `Assigned to campaign`, phase: 'system', leadId, metadata: JSON.stringify({ campaignId: context.campaignId }) },
      ],
    });

    return { messageId: mainMessageId, channel: 'email', crmLogged: true, followUpsScheduled: [] };
  }
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
