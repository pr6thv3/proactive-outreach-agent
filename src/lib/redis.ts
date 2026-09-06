import { Redis } from '@upstash/redis';

let redisInstance: Redis | null = null;

export function getRedis(): Redis | null {
  if (redisInstance) {
    return redisInstance;
  }

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  try {
    redisInstance = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.warn('[Redis] Failed to initialize Upstash Redis:', err);
    return null;
  }

  return redisInstance;
}

export function setRedisInstance(instance: Redis | null): void {
  redisInstance = instance;
}

/**
 * Atomic daily send counter tracking with 25-hour TTL
 */
export async function trackDailySendCount(orgId: string): Promise<number> {
  const redis = getRedis();
  const dateStr = new Date().toISOString().split('T')[0];
  const key = `org:${orgId}:sends:${dateStr}`;

  if (!redis) {
    return 1;
  }

  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 25 * 60 * 60); // 25 hours
    }
    return count;
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.warn('[Redis] Counter error:', err);
    return 1;
  }
}

/**
 * Get current daily send count for an organization
 */
export async function getDailySendCount(orgId: string): Promise<number> {
  const redis = getRedis();
  const dateStr = new Date().toISOString().split('T')[0];
  const key = `org:${orgId}:sends:${dateStr}`;

  if (!redis) return 0;

  try {
    const val = await redis.get<number>(key);
    return val ? Number(val) : 0;
  } catch {
    return 0;
  }
}

// In-memory rate limiting fallback when Redis is absent
const inMemoryRateLimits = new Map<string, { count: number; resetAt: number }>();

/**
 * Rate limit request (100 req/min per IP, 1000 req/min per org)
 */
export async function checkRateLimit(
  identifier: string,
  limit: number = 100,
  windowSeconds: number = 60
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const redis = getRedis();
  const key = `ratelimit:${identifier}`;

  if (redis) {
    try {
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.expire(key, windowSeconds);
      }
      const ttl = await redis.ttl(key).catch(() => windowSeconds);
      const allowed = current <= limit;
      return {
        allowed,
        remaining: Math.max(0, limit - current),
        resetIn: Math.max(0, typeof ttl === 'number' && ttl > 0 ? ttl : windowSeconds),
      };
    } catch {
      // Fallback to in-memory
    }
  }

  const now = Date.now();
  const entry = inMemoryRateLimits.get(key);

  if (!entry || now > entry.resetAt) {
    inMemoryRateLimits.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    const allowed = 1 <= limit;
    return { allowed, remaining: Math.max(0, limit - 1), resetIn: windowSeconds };
  }

  entry.count += 1;
  const allowed = entry.count <= limit;
  const resetIn = Math.max(0, Math.ceil((entry.resetAt - now) / 1000));
  return { allowed, remaining: Math.max(0, limit - entry.count), resetIn };
}
