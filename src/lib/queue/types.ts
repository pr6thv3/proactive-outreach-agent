export const QUEUE_NAMES = [
  'scrape',
  'signal-intelligence',
  'scoring',
  'draft-email',
  'send-email',
  'followup',
  'autonomous-cycle',
  'webhook-processing',
] as const;

export type QueueName = typeof QUEUE_NAMES[number];

export interface BaseJobData {
  organizationId: string;
  userId?: string;
  campaignId?: string;
  leadId?: string;
  messageId?: string;
  jobRecordId?: string;
  providerJobId?: string;
  dedupeKey?: string;
  traceId: string;
  attempt: number;
  createdAt: string;
}

export type ScrapeJobData = BaseJobData & {
  urls?: string[];
};

export type SignalIntelligenceJobData = BaseJobData;

export type ScoringJobData = BaseJobData & {
  forceRescore?: boolean;
};

export type DraftEmailJobData = BaseJobData & {
  objective?: string;
};

export type SendEmailJobData = BaseJobData & {
  dryRun?: boolean;
};

export type FollowupJobData = BaseJobData & {
  followUpId?: string;
};

export type AutonomousCycleJobData = BaseJobData;

export type WebhookProcessingJobData = BaseJobData & {
  webhookId?: string;
  payload: unknown;
  rawBody: string;
};

export type OutreachJobData =
  | ScrapeJobData
  | SignalIntelligenceJobData
  | ScoringJobData
  | DraftEmailJobData
  | SendEmailJobData
  | FollowupJobData
  | AutonomousCycleJobData
  | WebhookProcessingJobData;

export interface EnqueueResult {
  jobId: string;
  providerJobId?: string;
  queue: QueueName;
  status: 'queued' | 'queued_without_redis';
  traceId: string;
  backend: 'bullmq' | 'database';
}
