import { Queue, QueueEvents } from 'bullmq';
import { getProducerConnection, getWorkerConnection } from '@/lib/queue/connection';
import { QUEUE_NAMES, QueueName, OutreachJobData } from '@/lib/queue/types';

type OutreachQueue = Queue<OutreachJobData, unknown, QueueName>;

const queues = new Map<QueueName, OutreachQueue>();
const events = new Map<QueueName, QueueEvents>();

export function getQueue(name: QueueName): OutreachQueue {
  const existing = queues.get(name);
  if (existing) return existing;

  const queue = new Queue<OutreachJobData, unknown, QueueName>(name, {
    connection: getProducerConnection(),
    defaultJobOptions: {
      removeOnComplete: { count: 250 },
      removeOnFail: { count: 2000 },
    },
  });

  queue.on('error', (error) => {
    console.error(`[Queue:${name}]`, error);
  });

  queues.set(name, queue);
  return queue;
}

export function getQueueEvents(name: QueueName): QueueEvents {
  const existing = events.get(name);
  if (existing) return existing;

  const queueEvents = new QueueEvents(name, {
    connection: getWorkerConnection(),
  });

  queueEvents.on('error', (error) => {
    console.error(`[QueueEvents:${name}]`, error);
  });

  events.set(name, queueEvents);
  return queueEvents;
}

export async function closeQueues(): Promise<void> {
  await Promise.all([
    ...Array.from(queues.values()).map(queue => queue.close()),
    ...Array.from(events.values()).map(queueEvents => queueEvents.close()),
  ]);
  queues.clear();
  events.clear();
}

export { QUEUE_NAMES };
