// ─── ACT: Email Sender Agent ──────────────────────────
// Production email sending with DeliverabilityService, Resend, tracking, and warmup

import { BaseAgent } from '../base';
import { AgentContext, ActOutput, MessageData } from '../types';
import { db } from '@/lib/db';
import { isLeadSafeToContact, checkSendingLimit, incrementDailySends } from '@/lib/safety';
import { DeliverabilityService } from '@/lib/deliverability';

interface EmailSenderInput {
  message: MessageData;
  fromEmail?: string;
  fromName?: string;
  dryRun?: boolean;
}

export class EmailSenderAgent extends BaseAgent<EmailSenderInput, ActOutput> {
  readonly name = 'EmailSender';
  readonly phase = 'act' as const;
  readonly description = 'Sends emails via Resend with deliverability, tracking, warmup, and safety checks';

  async execute(input: EmailSenderInput, context: AgentContext): Promise<ActOutput> {
    const { message, dryRun = false } = input;
    const leadId = context.leadId;

    // ═══ SAFETY CHECKS ═══
    // 1. Check if lead is safe to contact
    const safety = await isLeadSafeToContact(leadId);
    if (!safety.safe) {
      await db.activity.create({
        data: { type: 'email_blocked', description: `Send blocked: ${safety.reasons.join(', ')}`, phase: 'act', leadId, metadata: JSON.stringify({ reasons: safety.reasons }) },
      });
      return { messageId: message.id, channel: 'email', crmLogged: false, followUpsScheduled: [] };
    }

    // 2. Check sending limits if campaign is set
    if (context.campaignId) {
      const limitCheck = await checkSendingLimit(context.campaignId);
      if (!limitCheck.allowed) {
        await db.activity.create({
          data: { type: 'email_blocked', description: `Daily sending limit reached (${limitCheck.remaining} remaining)`, phase: 'act', leadId, metadata: JSON.stringify({ campaignId: context.campaignId }) },
        });
        return { messageId: message.id, channel: 'email', crmLogged: false, followUpsScheduled: [] };
      }
    }

    // 3. Verify message is in "approved" status
    const existingMsg = await db.outreachMessage.findUnique({ where: { id: message.id } });
    if (existingMsg && existingMsg.status !== 'approved') {
      return { messageId: message.id, channel: 'email', crmLogged: false, followUpsScheduled: [] };
    }

    // ═══ SEND EMAIL VIA DELIVERABILITY SERVICE ═══
    const result = await DeliverabilityService.sendEmail({
      to: context.lead.email,
      from: input.fromEmail || context.campaignConfig?.senderEmail,
      fromName: input.fromName || context.campaignConfig?.senderName,
      subject: message.subject,
      body: message.body,
      messageId: message.id,
      leadId,
      campaignId: context.campaignId,
      dryRun,
    });

    if (!result.success) {
      await db.activity.create({
        data: { type: 'email_blocked', description: `Send failed: ${result.error}`, phase: 'act', leadId },
      });
      return { messageId: message.id, channel: 'email', crmLogged: false, followUpsScheduled: [] };
    }

    // Increment campaign daily sends
    if (context.campaignId) {
      await incrementDailySends(context.campaignId);
    }

    const now = new Date();
    return {
      messageId: message.id,
      channel: 'email',
      sentAt: now,
      crmLogged: false,
      followUpsScheduled: [],
    };
  }
}
