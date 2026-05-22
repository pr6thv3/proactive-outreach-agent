// ─── INFRASTRUCTURE: Job Queue System ──────────────────
// SQLite-based job queue with retry, dead-letter, priority scheduling
// Replaces BullMQ for zero external dependencies (no Redis needed)

import { db } from '@/lib/db';

export type JobType =
  | 'scrape'
  | 'signal_extract'
  | 'signal_intelligence'
  | 'score'
  | 'generate_email'
  | 'send_email'
  | 'follow_up'
  | 'classify_reply'
  | 'autonomous_discover'
  | 'autonomous_engage'
  | 'signal_decay'
  | 'memory_decay'
  | 'campaign_analytics';

export interface JobPayload {
  leadId?: string;
  campaignId?: string;
  [key: string]: unknown;
}

export interface JobResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  durationMs?: number;
}

export class JobQueue {
  /**
   * Enqueue a new job
   */
  static async enqueue(
    type: JobType,
    payload: JobPayload,
    options?: {
      priority?: number;      // 1=highest, 10=lowest (default: 5)
      scheduledAt?: Date;     // When to run (default: now)
      maxRetries?: number;    // Max retry count (default: 3)
      traceId?: string;       // Distributed tracing
    },
  ): Promise<string> {
    const job = await db.jobQueue.create({
      data: {
        type,
        priority: options?.priority || 5,
        payload: JSON.stringify(payload),
        maxRetries: options?.maxRetries ?? 3,
        scheduledAt: options?.scheduledAt || new Date(),
        leadId: payload.leadId,
        campaignId: payload.campaignId,
        traceId: options?.traceId,
      },
    });

    return job.id;
  }

  /**
   * Dequeue the next job to process
   */
  static async dequeue(limit = 1): Promise<Array<{ id: string; type: JobType; payload: JobPayload; retryCount: number; traceId?: string }>> {
    const now = new Date();

    // Find pending jobs that are due, ordered by priority then scheduled time
    const jobs = await db.jobQueue.findMany({
      where: {
        status: 'pending',
        scheduledAt: { lte: now },
      },
      orderBy: [
        { priority: 'asc' },
        { scheduledAt: 'asc' },
      ],
      take: limit,
    });

    const results: Array<{ id: string; type: JobType; payload: JobPayload; retryCount: number; traceId?: string }> = [];
    for (const job of jobs) {
      // Mark as running
      const updated = await db.jobQueue.updateMany({
        where: { id: job.id, status: 'pending' },
        data: { status: 'running', startedAt: new Date() },
      });

      if (updated.count > 0) {
        results.push({
          id: job.id,
          type: job.type as JobType,
          payload: JSON.parse(job.payload) as JobPayload,
          retryCount: job.retryCount,
          traceId: job.traceId || undefined,
        });
      }
    }

    return results;
  }

  /**
   * Mark a job as completed
   */
  static async complete(jobId: string, result: JobResult): Promise<void> {
    await db.jobQueue.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        result: JSON.stringify(result),
        completedAt: new Date(),
      },
    });
  }

  /**
   * Mark a job as failed, with retry logic
   */
  static async fail(jobId: string, error: string): Promise<void> {
    const job = await db.jobQueue.findUnique({ where: { id: jobId } });
    if (!job) return;

    const newRetryCount = job.retryCount + 1;

    if (newRetryCount >= job.maxRetries) {
      // Move to dead letter queue
      await db.jobQueue.update({
        where: { id: jobId },
        data: {
          status: 'dead',
          error,
          retryCount: newRetryCount,
          deadLetteredAt: new Date(),
          completedAt: new Date(),
        },
      });
    } else {
      // Retry with exponential backoff
      const backoffMs = Math.min(30000, 1000 * Math.pow(2, newRetryCount));
      const nextRun = new Date(Date.now() + backoffMs);

      await db.jobQueue.update({
        where: { id: jobId },
        data: {
          status: 'pending',
          error,
          retryCount: newRetryCount,
          scheduledAt: nextRun,
          startedAt: null,
        },
      });
    }
  }

  /**
   * Get queue statistics
   */
  static async getStats(): Promise<{
    pending: number;
    running: number;
    completed: number;
    failed: number;
    dead: number;
    byType: Record<string, number>;
  }> {
    const [pending, running, completed, failed, dead, byType] = await Promise.all([
      db.jobQueue.count({ where: { status: 'pending' } }),
      db.jobQueue.count({ where: { status: 'running' } }),
      db.jobQueue.count({ where: { status: 'completed' } }),
      db.jobQueue.count({ where: { status: 'failed' } }),
      db.jobQueue.count({ where: { status: 'dead' } }),
      db.jobQueue.groupBy({ by: ['type'], _count: { type: true }, where: { status: { in: ['pending', 'running'] } } }),
    ]);

    return {
      pending, running, completed, failed, dead,
      byType: Object.fromEntries(byType.map(b => [b.type, b._count.type])),
    };
  }

  /**
   * Re-queue dead letter jobs for retry
   */
  static async retryDeadLetters(type?: JobType): Promise<number> {
    const where: Record<string, unknown> = { status: 'dead' };
    if (type) where.type = type;

    const result = await db.jobQueue.updateMany({
      where,
      data: {
        status: 'pending',
        retryCount: 0,
        scheduledAt: new Date(),
        startedAt: null,
        completedAt: null,
        deadLetteredAt: null,
        error: null,
      },
    });

    return result.count;
  }

  /**
   * Clean up old completed jobs
   */
  static async cleanup(olderThanDays = 7): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 86400000);
    const result = await db.jobQueue.deleteMany({
      where: {
        status: 'completed',
        completedAt: { lt: cutoff },
      },
    });
    return result.count;
  }
}
