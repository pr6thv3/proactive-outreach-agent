import { getQueueEvents } from '@/lib/queue/queues';
import { QUEUE_NAMES } from '@/lib/queue/types';

export function registerQueueEventLogging(): void {
  for (const name of QUEUE_NAMES) {
    const events = getQueueEvents(name);
    events.on('completed', ({ jobId }) => {
      console.info(`[QueueEvents:${name}] completed`, { jobId });
    });
    events.on('failed', ({ jobId, failedReason }) => {
      console.error(`[QueueEvents:${name}] failed`, { jobId, failedReason });
    });
    events.on('stalled', ({ jobId }) => {
      console.warn(`[QueueEvents:${name}] stalled`, { jobId });
    });
  }
}
