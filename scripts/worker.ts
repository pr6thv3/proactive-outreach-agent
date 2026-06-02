import { validateEnv } from '../src/lib/env';
import { closeQueueConnections } from '../src/lib/queue/connection';
import { closeQueues } from '../src/lib/queue/queues';
import { registerQueueEventLogging } from '../src/lib/queue/events';
import { createWorkers } from '../src/lib/queue/worker';

validateEnv();
registerQueueEventLogging();

const workers = createWorkers();
console.log(`Started ${workers.length} BullMQ workers.`);

async function shutdown(signal: string) {
  console.log(`Received ${signal}; closing workers.`);
  await Promise.all(workers.map(worker => worker.close()));
  await closeQueues();
  await closeQueueConnections();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection in worker', reason);
});
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception in worker', error);
});
