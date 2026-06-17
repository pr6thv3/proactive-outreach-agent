import { db } from '@/lib/db';
import { orchestrator } from '@/lib/orchestrator';
import { assertReadyToSend, evaluateSendReadiness } from '@/lib/deliverability/send-readiness';
import { SendEmailJobData } from '@/lib/queue/types';

export async function processSendEmailJob(data: SendEmailJobData) {
  if (!data.messageId) throw new Error('messageId is required');

  // Re-check readiness at worker time (defense-in-depth)
  try {
    await assertReadyToSend({
      organizationId: data.organizationId,
      messageId: data.messageId,
      traceId: data.traceId,
    });
  } catch {
    // Readiness failed at worker time — record structured reason
    const readiness = await evaluateSendReadiness({
      organizationId: data.organizationId,
      messageId: data.messageId,
      traceId: data.traceId,
    });

    const blockedChecks = readiness.checks
      .filter(c => c.status === 'block')
      .map(c => ({ id: c.id, label: c.label, reason: c.reason }));

    // Mark message as blocked so the UI reflects the state
    await db.outreachMessage.updateMany({
      where: { id: data.messageId, organizationId: data.organizationId },
      data: { status: 'blocked' },
    });

    // Return structured result (stored in JobQueue.result by worker)
    return {
      sent: false,
      blocked: true,
      reason: 'Send-readiness re-check failed at worker time',
      blockedChecks,
      traceId: data.traceId,
    };
  }

  return orchestrator.sendMessage(data.messageId, data.dryRun === true, data.organizationId, data.traceId);
}
