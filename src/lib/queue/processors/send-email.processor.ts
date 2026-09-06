import { db } from '@/lib/db';
import { orchestrator } from '@/lib/orchestrator';
import { assertReadyToSend, evaluateSendReadiness } from '@/lib/deliverability/send-readiness';
import { SendEmailJobData } from '@/lib/queue/types';

export type ProcessSendEmailInput = Partial<SendEmailJobData> & {
  messageId?: string;
  organizationId?: string;
  traceId?: string;
  dryRun?: boolean;
};

export async function processSendEmailJob(data: ProcessSendEmailInput) {
  if (!data.messageId) throw new Error('messageId is required');

  const messageId = data.messageId;
  const organizationId = data.organizationId || '';
  const traceId = data.traceId || `trace_${Date.now()}`;

  // Re-check readiness at worker time (defense-in-depth)
  try {
    await assertReadyToSend({
      organizationId,
      messageId,
      traceId,
    });
  } catch {
    // Readiness failed at worker time — record structured reason
    const readiness = await evaluateSendReadiness({
      organizationId,
      messageId,
      traceId,
    });

    const blockedChecks = readiness.checks
      .filter(c => c.status === 'block')
      .map(c => ({ id: c.id, label: c.label, reason: c.reason }));

    // Mark message as blocked so the UI reflects the state
    await db.outreachMessage.updateMany({
      where: { id: messageId, ...(organizationId ? { organizationId } : {}) },
      data: { status: 'blocked' },
    });

    // Return structured result (stored in JobQueue.result by worker)
    return {
      sent: false,
      blocked: true,
      reason: 'Send-readiness re-check failed at worker time',
      blockedChecks,
      traceId,
    };
  }

  // Concurrency Safety: Atomic Compare-And-Swap claiming (Exact-once dispatch)
  const updated = await db.outreachMessage.updateMany({
    where: {
      id: messageId,
      status: { in: ['approved', 'QUEUED', 'queued'] },
      ...(organizationId ? { organizationId } : {}),
    },
    data: { status: 'sending' },
  });
  if (updated.count === 0) {
    return { sent: false, blocked: true, reason: 'Message already claimed or not in sendable (approved/QUEUED) state' };
  }

  try {
    const result = await orchestrator.sendMessage(messageId, data.dryRun === true, organizationId || undefined, traceId);
    if (!result.success) {
      const msg = await db.outreachMessage.findFirst({ where: { id: messageId } }).catch(() => null);
      const currentRetries = (msg as any)?.retryCount ?? 0;
      const newRetries = currentRetries + 1;
      const isTerminal = newRetries >= 3;

      if (isTerminal) {
        await db.outreachMessage.updateMany({
          where: { id: messageId, status: 'sending' },
          data: {
            status: 'FAILED',
            retryCount: newRetries,
            nextRetryAt: null,
            lastError: result.error || 'Dispatch failed after 3 attempts',
          },
        });
      } else {
        const backoffMinutes = 5 * Math.pow(2, newRetries - 1);
        const nextRetryAt = new Date(Date.now() + backoffMinutes * 60 * 1000);
        await db.outreachMessage.updateMany({
          where: { id: messageId, status: 'sending' },
          data: {
            status: 'QUEUED',
            retryCount: newRetries,
            nextRetryAt,
            lastError: result.error || 'Dispatch failed, scheduled for retry',
          },
        });
      }
      return {
        ...result,
        sent: false,
        blocked: false,
      };
    }

    // Successfully sent / dryRun executed
    await db.outreachMessage.updateMany({
      where: { id: messageId, status: 'sending' },
      data: { status: 'sent', sentAt: new Date() },
    });

    return {
      ...result,
      sent: true,
      blocked: false,
    };
  } catch (error) {
    const msg = await db.outreachMessage.findFirst({ where: { id: messageId } }).catch(() => null);
    const currentRetries = (msg as any)?.retryCount ?? 0;
    const newRetries = currentRetries + 1;
    const isTerminal = newRetries >= 3;

    if (isTerminal) {
      await db.outreachMessage.updateMany({
        where: { id: messageId, status: 'sending' },
        data: {
          status: 'FAILED',
          retryCount: newRetries,
          nextRetryAt: null,
          lastError: error instanceof Error ? error.message : String(error),
        },
      }).catch(() => {});
    } else {
      const backoffMinutes = 5 * Math.pow(2, newRetries - 1);
      const nextRetryAt = new Date(Date.now() + backoffMinutes * 60 * 1000);
      await db.outreachMessage.updateMany({
        where: { id: messageId, status: 'sending' },
        data: {
          status: 'QUEUED',
          retryCount: newRetries,
          nextRetryAt,
          lastError: error instanceof Error ? error.message : String(error),
        },
      }).catch(() => {});
    }
    throw error;
  }
}
