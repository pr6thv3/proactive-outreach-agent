import { Job, Worker } from 'bullmq';
import { db } from '@/lib/db';
import { getWorkerConnection, isRedisConfigured } from '@/lib/queue/connection';
import {
  QUEUE_NAMES,
  AutonomousCycleJobData,
  DraftEmailJobData,
  FollowupJobData,
  OutreachJobData,
  QueueName,
  ScoringJobData,
  ScrapeJobData,
  SendEmailJobData,
  SignalIntelligenceJobData,
  WebhookProcessingJobData,
} from '@/lib/queue/types';
import { processScrapeJob } from '@/lib/queue/processors/scrape.processor';
import { processSignalIntelligenceJob } from '@/lib/queue/processors/signal-intelligence.processor';
import { processScoringJob } from '@/lib/queue/processors/scoring.processor';
import { processDraftEmailJob } from '@/lib/queue/processors/draft-email.processor';
import { processSendEmailJob } from '@/lib/queue/processors/send-email.processor';
import { processFollowupJob } from '@/lib/queue/processors/followup.processor';
import { processAutonomousCycleJob } from '@/lib/queue/processors/autonomous-cycle.processor';
import { processWebhookProcessingJob } from '@/lib/queue/processors/webhook-processing.processor';

type Processor = (data: OutreachJobData) => Promise<unknown>;

const PROCESSORS: Record<QueueName, Processor> = {
  scrape: data => processScrapeJob(data as ScrapeJobData),
  'signal-intelligence': data => processSignalIntelligenceJob(data as SignalIntelligenceJobData),
  scoring: data => processScoringJob(data as ScoringJobData),
  'draft-email': data => processDraftEmailJob(data as DraftEmailJobData),
  'send-email': data => processSendEmailJob(data as SendEmailJobData),
  followup: data => processFollowupJob(data as FollowupJobData),
  'autonomous-cycle': data => processAutonomousCycleJob(data as AutonomousCycleJobData),
  'webhook-processing': data => processWebhookProcessingJob(data as WebhookProcessingJobData),
};

export function createWorkers(): Worker<OutreachJobData>[] {
  if (!isRedisConfigured()) {
    throw new Error('REDIS_URL is required to start BullMQ workers');
  }

  return QUEUE_NAMES.map(queueName => {
    const worker = new Worker<OutreachJobData>(
      queueName,
      async (job) => runTrackedProcessor(queueName, job),
      {
        connection: getWorkerConnection(),
        concurrency: queueName === 'send-email' ? 2 : 5,
      },
    );

    worker.on('completed', async (job, result) => {
      await markJobCompleted(String(job.id), result).catch(error => {
        console.error(`[Worker:${queueName}] failed to mark completed`, error);
      });
    });

    worker.on('failed', async (job, error) => {
      if (!job) return;
      const attempts = job.opts.attempts || 1;
      const isDead = job.attemptsMade >= attempts;
      await markJobFailed(String(job.id), error, isDead).catch(markError => {
        console.error(`[Worker:${queueName}] failed to mark failed`, markError);
      });
    });

    worker.on('error', (error) => {
      console.error(`[Worker:${queueName}]`, error);
    });

    return worker;
  });
}

async function runTrackedProcessor(queueName: QueueName, job: Job<OutreachJobData>) {
  const jobId = job.data.jobRecordId || String(job.id);
  await db.jobQueue.updateMany({
    where: { id: jobId },
    data: {
      status: 'running',
      attempt: job.attemptsMade + 1,
      retryCount: job.attemptsMade,
      startedAt: new Date(),
    },
  });

  const result = await PROCESSORS[queueName](job.data);
  return JSON.parse(JSON.stringify(result ?? null));
}

async function markJobCompleted(jobId: string, result: unknown) {
  const dbJobId = await resolveDbJobId(jobId);
  await db.jobQueue.updateMany({
    where: { id: dbJobId },
    data: {
      status: 'completed',
      result: JSON.stringify(result ?? null),
      completedAt: new Date(),
    },
  });
}

async function markJobFailed(jobId: string, error: Error, dead: boolean) {
  const dbJobId = await resolveDbJobId(jobId);
  await db.jobQueue.updateMany({
    where: { id: dbJobId },
    data: {
      status: dead ? 'dead' : 'failed',
      error: error.message,
      completedAt: dead ? new Date() : undefined,
      deadLetteredAt: dead ? new Date() : undefined,
    },
  });
}

async function resolveDbJobId(providerJobId: string) {
  const direct = await db.jobQueue.findUnique({ where: { id: providerJobId }, select: { id: true } });
  if (direct) return direct.id;

  const matching = await db.jobQueue.findFirst({
    where: { result: { contains: `"providerJobId":"${providerJobId}"` } },
    select: { id: true },
  });

  return matching?.id || providerJobId;
}
