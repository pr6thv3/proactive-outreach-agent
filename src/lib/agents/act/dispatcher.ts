// ─── ACT: Email Dispatcher ─────────────────────────────────────
// Orchestrates outbound email dispatching with 6-gate pre-send guards,
// atomic CAS claiming, upstream Idempotency-Key, and 3-attempt exponential retry state machine.

import { db } from '@/lib/db';
import { DeliverabilityService } from '@/lib/deliverability';
import { checkPreSendGuards, evaluateSendReadiness } from '@/lib/deliverability/send-readiness';
import { recordAgentEvent } from '@/lib/agents/infrastructure/observability';
import { OutreachEmailStatus } from '@prisma/client';

export interface DispatchEmailParams {
  organizationId: string;
  messageId: string;
  leadId?: string;
  campaignId?: string;
  dryRun?: boolean;
  traceId?: string;
  enforceSendWindow?: boolean;
  minLeadScore?: number;
}

export interface DispatchEmailResult {
  success: boolean;
  messageId: string;
  providerId?: string;
  status: 'sent' | 'queued_for_retry' | 'failed' | 'blocked';
  blockedReason?: string;
  blockedGate?: string;
  retryCount?: number;
  nextRetryAt?: Date | null;
  error?: string;
}

export class ActDispatcher {
  /**
   * Dispatch a single email with 6-gate safety, CAS claiming, idempotency, and retry management
   */
  static async dispatch(params: DispatchEmailParams): Promise<DispatchEmailResult> {
    const {
      organizationId,
      messageId,
      dryRun = false,
      traceId = `dispatch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      enforceSendWindow,
      minLeadScore,
    } = params;

    const startTime = Date.now();

    // 1. Fetch message and recipient details
    const message = await db.outreachMessage.findFirst({
      where: { id: messageId, organizationId },
      include: { lead: true, campaign: true },
    });

    if (!message) {
      return {
        success: false,
        messageId,
        status: 'blocked',
        blockedReason: 'Message not found in workspace',
      };
    }

    const leadId = message.leadId || params.leadId;
    const campaignId = message.campaignId || params.campaignId;

    // 2. Pre-send guards 6-gate ordering:
    // (1) autonomy_paused, (2) daily_limit_reached, (3) email_not_verified,
    // (4) lead_opted_out, (5) outside_send_window, (6) score_below_threshold
    const guards = await checkPreSendGuards({
      organizationId,
      messageId,
      traceId,
      enforceSendWindow,
      minLeadScore,
    });

    if (!guards.passed) {
      await recordAgentEvent({
        organizationId,
        leadId,
        agentName: 'ActDispatcher',
        stepName: 'pre_send_guards',
        phase: 'act',
        level: 'warn',
        message: `Send blocked by guard [${guards.blockedGate}]: ${guards.reason}`,
        outputData: { blockedGate: guards.blockedGate, reason: guards.reason },
      }).catch(() => {});

      return {
        success: false,
        messageId,
        status: 'blocked',
        blockedGate: guards.blockedGate,
        blockedReason: guards.reason,
      };
    }

    // 3. Concurrency Safety: Atomic Compare-And-Swap (CAS) claiming
    // Only messages in 'approved', 'QUEUED', or 'queued' may be claimed to 'sending'
    if (!dryRun) {
      const claim = await db.outreachMessage.updateMany({
        where: {
          id: messageId,
          organizationId,
          status: { in: ['approved', 'QUEUED', 'queued'] },
        },
        data: { status: 'sending' },
      });

      if (claim.count === 0) {
        const currentMsg = await db.outreachMessage.findFirst({
          where: { id: messageId, organizationId },
        });
        if (currentMsg?.status !== 'sending') {
          return {
            success: false,
            messageId,
            status: 'blocked',
            blockedReason: `Message already claimed or not in sendable state (status: ${currentMsg?.status})`,
          };
        }
      }
    }

    // 4. Send via DeliverabilityService with OutreachEmail.id as upstream Idempotency-Key
    try {
      const sendResult = await DeliverabilityService.sendEmail({
        organizationId,
        to: message.lead.email,
        subject: message.subject,
        body: message.body,
        messageId: message.id, // Passed as Idempotency-Key to Resend
        leadId,
        campaignId,
        dryRun,
      });

      if (sendResult.success) {
        if (!dryRun) {
          await db.outreachMessage.updateMany({
            where: { id: messageId, status: 'sending' },
            data: {
              status: OutreachEmailStatus.SENT,
              sentAt: new Date(),
              resendMessageId: sendResult.providerId || `msg_${Date.now()}`,
            },
          });
        }

        await recordAgentEvent({
          organizationId,
          leadId,
          agentName: 'ActDispatcher',
          stepName: 'email_dispatched',
          phase: 'act',
          level: 'info',
          message: `Email successfully dispatched to ${message.lead.email}`,
          outputData: { providerId: sendResult.providerId, messageId },
          durationMs: Date.now() - startTime,
        }).catch(() => {});

        return {
          success: true,
          messageId,
          providerId: sendResult.providerId,
          status: 'sent',
        };
      }

      // 5. Failure Handling: 3-Attempt Exponential Retry State Machine
      const currentRetries = (message as any)?.retryCount ?? 0;
      const newRetries = currentRetries + 1;
      const isTerminal = newRetries >= 3;

      if (isTerminal) {
        await db.outreachMessage.updateMany({
          where: { id: messageId, status: 'sending' },
          data: {
            status: OutreachEmailStatus.FAILED,
            retryCount: newRetries,
            nextRetryAt: null,
            lastError: sendResult.error || 'Provider dispatch failed after 3 attempts',
          },
        });

        await recordAgentEvent({
          organizationId,
          leadId,
          agentName: 'ActDispatcher',
          stepName: 'email_failed_terminal',
          phase: 'act',
          level: 'error',
          message: `Email dispatch failed permanently after 3 attempts: ${sendResult.error}`,
          outputData: { error: sendResult.error, retryCount: newRetries },
          durationMs: Date.now() - startTime,
        }).catch(() => {});

        return {
          success: false,
          messageId,
          status: 'failed',
          retryCount: newRetries,
          error: sendResult.error,
        };
      } else {
        // Exponential backoff: 5m, 10m, 20m
        const backoffMinutes = 5 * Math.pow(2, newRetries - 1);
        const nextRetryAt = new Date(Date.now() + backoffMinutes * 60 * 1000);

        await db.outreachMessage.updateMany({
          where: { id: messageId, status: 'sending' },
          data: {
            status: OutreachEmailStatus.QUEUED,
            retryCount: newRetries,
            nextRetryAt,
            lastError: sendResult.error || 'Provider dispatch failed, queued for retry',
          },
        });

        await recordAgentEvent({
          organizationId,
          leadId,
          agentName: 'ActDispatcher',
          stepName: 'email_queued_retry',
          phase: 'act',
          level: 'warn',
          message: `Email dispatch failed (attempt ${newRetries}/3), scheduled retry for ${nextRetryAt.toISOString()}: ${sendResult.error}`,
          outputData: { error: sendResult.error, retryCount: newRetries, nextRetryAt },
          durationMs: Date.now() - startTime,
        }).catch(() => {});

        return {
          success: false,
          messageId,
          status: 'queued_for_retry',
          retryCount: newRetries,
          nextRetryAt,
          error: sendResult.error,
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const currentRetries = (message as any)?.retryCount ?? 0;
      const newRetries = currentRetries + 1;
      const isTerminal = newRetries >= 3;

      if (isTerminal) {
        await db.outreachMessage.updateMany({
          where: { id: messageId, status: 'sending' },
          data: {
            status: OutreachEmailStatus.FAILED,
            retryCount: newRetries,
            nextRetryAt: null,
            lastError: errorMsg,
          },
        }).catch(() => {});
      } else {
        const backoffMinutes = 5 * Math.pow(2, newRetries - 1);
        const nextRetryAt = new Date(Date.now() + backoffMinutes * 60 * 1000);
        await db.outreachMessage.updateMany({
          where: { id: messageId, status: 'sending' },
          data: {
            status: OutreachEmailStatus.QUEUED,
            retryCount: newRetries,
            nextRetryAt,
            lastError: errorMsg,
          },
        }).catch(() => {});
      }

      return {
        success: false,
        messageId,
        status: isTerminal ? 'failed' : 'queued_for_retry',
        retryCount: newRetries,
        error: errorMsg,
      };
    }
  }
}

export const dispatchEmail = ActDispatcher.dispatch;
