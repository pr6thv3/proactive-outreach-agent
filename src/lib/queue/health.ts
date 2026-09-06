import Redis from 'ioredis';
import { db } from '@/lib/db';
import { QUEUE_NAMES, QueueName } from '@/lib/queue/types';

const STALE_RUNNING_MS = 15 * 60 * 1000;

const QUEUE_KEYS: Record<QueueName, string> = {
  scrape: 'scrape',
  'signal-intelligence': 'signalIntelligence',
  scoring: 'scoring',
  'draft-email': 'draftEmail',
  'send-email': 'sendEmail',
  followup: 'followup',
  'autonomous-cycle': 'autonomousCycle',
  'webhook-processing': 'webhookProcessing',
};

export interface RedisHealth {
  configured: boolean;
  connected: boolean;
  error?: string;
}

export interface QueueHealth {
  name: QueueName;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  dead: number;
  staleRunning: number;
  oldestPendingJobAgeMs?: number;
}

export interface JobHealth {
  redis: RedisHealth;
  queues: Record<string, QueueHealth>;
  totals: {
    pending: number;
    running: number;
    failed: number;
    dead: number;
    staleRunning: number;
  };
  oldestPendingJobAgeMs?: number;
  recentJobs: Array<{
    id: string;
    queue: string;
    status: string;
    traceId: string | null;
    leadId: string | null;
    campaignId: string | null;
    error: string | null;
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
  }>;
}

export async function checkRedisHealth(): Promise<RedisHealth> {
  if (!process.env.REDIS_URL) {
    return { configured: false, connected: false };
  }

  const client = new Redis(process.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 1500,
  });

  try {
    await client.connect();
    await client.ping();
    return { configured: true, connected: true };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    client.disconnect();
  }
}

export async function getJobHealth(organizationId: string): Promise<JobHealth> {
  const redis = await checkRedisHealth();
  const staleBefore = new Date(Date.now() - STALE_RUNNING_MS);

  const queueEntries: Array<readonly [string, QueueHealth]> = [];
  for (const queueName of QUEUE_NAMES) {
    const whereQueue = {
      organizationId,
      type: queueName,
    };

    const pending = await db.jobQueue.count({ where: { ...whereQueue, status: 'pending' } });
    const running = await db.jobQueue.count({ where: { ...whereQueue, status: 'running' } });
    const completed = await db.jobQueue.count({ where: { ...whereQueue, status: 'completed' } });
    const failed = await db.jobQueue.count({ where: { ...whereQueue, status: 'failed' } });
    const dead = await db.jobQueue.count({ where: { ...whereQueue, status: 'dead' } });
    const staleRunning = await db.jobQueue.count({
      where: {
        AND: [
          whereQueue,
          { status: 'running' },
          { createdAt: { lt: staleBefore } },
        ],
      },
    });
    const oldestPending = await db.jobQueue.findFirst({
      where: { ...whereQueue, status: 'pending' },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });

    const health: QueueHealth = {
      name: queueName,
      pending,
      running,
      completed,
      failed,
      dead,
      staleRunning,
      oldestPendingJobAgeMs: oldestPending ? Date.now() - oldestPending.createdAt.getTime() : undefined,
    };

    queueEntries.push([QUEUE_KEYS[queueName], health] as const);
  }

  const queues = Object.fromEntries(queueEntries);
  const totals = Object.values(queues).reduce<JobHealth['totals']>((acc, q) => ({
    pending: acc.pending + q.pending,
    running: acc.running + q.running,
    failed: acc.failed + q.failed,
    dead: acc.dead + q.dead,
    staleRunning: acc.staleRunning + q.staleRunning,
  }), { pending: 0, running: 0, failed: 0, dead: 0, staleRunning: 0 });

  const oldestPendingJobAgeMs = Object.values(queues)
    .map(q => q.oldestPendingJobAgeMs)
    .filter((age): age is number => typeof age === 'number')
    .sort((a, b) => b - a)[0];

  const recentJobs = await db.jobQueue.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    take: 25,
    select: {
      id: true,
      type: true,
      status: true,
      error: true,
      createdAt: true,
    },
  });

  return {
    redis,
    queues,
    totals,
    oldestPendingJobAgeMs,
    recentJobs: recentJobs.map(job => ({
      id: job.id,
      queue: job.queueName || job.type,
      status: job.status,
      traceId: job.traceId,
      leadId: job.leadId,
      campaignId: job.campaignId,
      error: job.error,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    })),
  };
}
