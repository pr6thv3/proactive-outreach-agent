import { JobsOptions } from 'bullmq';
import { db } from '@/lib/db';
import { generateTraceId } from '@/lib/agents/infrastructure/observability';
import { isRedisConfigured } from '@/lib/queue/connection';
import { getQueue } from '@/lib/queue/queues';
import { BaseJobData, EnqueueResult, OutreachJobData, QueueName } from '@/lib/queue/types';

const RETRY_RULES: Record<QueueName, Pick<JobsOptions, 'attempts' | 'backoff'>> = {
  scrape: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
  'signal-intelligence': { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
  scoring: { attempts: 3, backoff: { type: 'exponential', delay: 1500 } },
  'draft-email': { attempts: 3, backoff: { type: 'exponential', delay: 3000 } },
  'send-email': { attempts: 2, backoff: { type: 'exponential', delay: 10000 } },
  followup: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
  'autonomous-cycle': { attempts: 1 },
  'webhook-processing': { attempts: 5, backoff: { type: 'exponential', delay: 1000 } },
};

export async function enqueueJob<T extends Partial<OutreachJobData>>(
  queue: QueueName,
  data: T,
  options: {
    userId?: string;
    traceId?: string;
    dedupeKey?: string;
  } = {},
): Promise<EnqueueResult> {
  if (!data.organizationId) {
    throw new Error('organizationId is required for queue jobs');
  }

  const traceId = options.traceId || data.traceId || generateTraceId();
  const payload = {
    ...data,
    userId: data.userId || options.userId,
    jobRecordId: undefined,
    traceId,
    attempt: data.attempt ?? 0,
    createdAt: data.createdAt || new Date().toISOString(),
  } as OutreachJobData;

  const attempts = RETRY_RULES[queue].attempts || 1;
  const dbJob = await db.jobQueue.create({
    data: {
      organizationId: payload.organizationId,
      userId: payload.userId,
      queueName: queue,
      type: queue,
      status: 'pending',
      priority: queue === 'send-email' ? 1 : 5,
      payload: JSON.stringify(payload),
      maxRetries: attempts,
      leadId: payload.leadId,
      campaignId: payload.campaignId,
      traceId,
      scheduledAt: new Date(),
    },
  });

  if (!isRedisConfigured()) {
    return {
      jobId: dbJob.id,
      queue,
      status: 'queued_without_redis',
      traceId,
      backend: 'database',
    };
  }

  const jobId = queue === 'autonomous-cycle'
    ? options.dedupeKey || `autonomous-cycle:${payload.organizationId}`
    : dbJob.id;

  const providerPayload = {
    ...payload,
    jobRecordId: dbJob.id,
    dedupeKey: options.dedupeKey,
  };

  let bullJob;
  try {
    bullJob = await getQueue(queue).add(queue, providerPayload, {
      jobId,
      ...(options.dedupeKey ? { deduplication: { id: options.dedupeKey } } : {}),
      ...RETRY_RULES[queue],
    });
  } catch (error) {
    await db.jobQueue.update({
      where: { id: dbJob.id },
      data: {
        result: JSON.stringify({
          queueError: error instanceof Error ? error.message : String(error),
          dedupeKey: jobId,
        }),
      },
    });

    return {
      jobId: dbJob.id,
      queue,
      status: 'queued_without_redis',
      traceId,
      backend: 'database',
    };
  }

  await db.jobQueue.update({
    where: { id: dbJob.id },
    data: {
      result: JSON.stringify({ providerJobId: bullJob.id, dedupeKey: jobId }),
    },
  });

  return {
    jobId: dbJob.id,
    providerJobId: bullJob.id,
    queue,
    status: 'queued',
    traceId,
    backend: 'bullmq',
  };
}

export function assertBaseJobData(data: Partial<BaseJobData>): asserts data is BaseJobData {
  if (!data.organizationId) throw new Error('organizationId is required');
  if (!data.traceId) throw new Error('traceId is required');
  if (!data.createdAt) throw new Error('createdAt is required');
}
