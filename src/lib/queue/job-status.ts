import { db } from '@/lib/db';
import { getQueue } from '@/lib/queue/queues';
import { isRedisConfigured } from '@/lib/queue/connection';
import { QUEUE_NAMES } from '@/lib/queue/types';

export async function getTrackedJob(jobId: string, organizationId: string) {
  const record = await db.jobQueue.findFirst({
    where: { id: jobId, organizationId },
  });

  if (!record) return null;

  let bullState: string | null = null;
  if (isRedisConfigured() && record.queueName) {
    for (const queueName of QUEUE_NAMES) {
      if (queueName !== record.queueName) continue;
      const bullJob = await getQueue(queueName).getJob(jobId).catch(() => null);
      if (bullJob) {
        bullState = await bullJob.getState();
      }
    }
  }

  return {
    id: record.id,
    queue: record.queueName || record.type,
    status: record.status,
    bullState,
    traceId: record.traceId,
    retryCount: record.retryCount,
    attempt: record.attempt,
    error: record.error,
    leadId: record.leadId,
    campaignId: record.campaignId,
    scheduledAt: record.scheduledAt,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    createdAt: record.createdAt,
  };
}

export async function listTrackedJobs(params: {
  organizationId: string;
  campaignId?: string;
  leadId?: string;
  status?: string;
  limit?: number;
}) {
  return db.jobQueue.findMany({
    where: {
      organizationId: params.organizationId,
      ...(params.campaignId ? { campaignId: params.campaignId } : {}),
      ...(params.leadId ? { leadId: params.leadId } : {}),
      ...(params.status ? { status: params.status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: params.limit || 100,
  });
}
