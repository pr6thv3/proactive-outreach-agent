import type { ConnectionOptions } from 'bullmq';

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

export function getProducerConnection(): ConnectionOptions {
  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL is not configured');
  }

  return {
    ...parseRedisUrl(process.env.REDIS_URL),
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy(times: number) {
      return Math.max(Math.min(Math.exp(times), 20000), 1000);
    },
  } as ConnectionOptions;
}

export function getWorkerConnection(): ConnectionOptions {
  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL is not configured');
  }

  return {
    ...parseRedisUrl(process.env.REDIS_URL),
    maxRetriesPerRequest: null,
    retryStrategy(times: number) {
      return Math.max(Math.min(Math.exp(times), 20000), 1000);
    },
  } as ConnectionOptions;
}

export async function closeQueueConnections(): Promise<void> {
  await Promise.resolve();
}

function parseRedisUrl(redisUrl: string): Record<string, unknown> {
  const parsed = new URL(redisUrl);
  const db = parsed.pathname && parsed.pathname !== '/'
    ? Number(parsed.pathname.slice(1))
    : undefined;

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: Number.isFinite(db) ? db : undefined,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
  };
}
