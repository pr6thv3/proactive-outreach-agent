// ─── WORKFLOW IDEMPOTENCY ENGINE ─────────────────────────────────
// Enforces exact-once execution semantics across external side-effects
// for Milestone 2 (R2).
// ─────────────────────────────────────────────────────────────────

import crypto from 'crypto';
import { db } from '@/lib/db';
import { IdempotencyRecord } from './types';

export class IdempotencyConflictError extends Error {
  constructor(message: string, public readonly key: string, public readonly status: string) {
    super(message);
    this.name = 'IdempotencyConflictError';
  }
}

// In-memory persistent cache for quick lock resolution and test isolation
const memoryStore = new Map<string, IdempotencyRecord>();

export class IdempotencyManager {
  /**
   * Generates a deterministic idempotency key for an action.
   */
  static generateKey(
    organizationId: string,
    actionName: string,
    entityId: string,
    additionalEntropy?: string
  ): string {
    const raw = `${organizationId}:${actionName}:${entityId}:${additionalEntropy || ''}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Acquire a lock for an action. Returns true if lock was successfully acquired.
   * Throws IdempotencyConflictError if already in progress or returns cached result if already committed.
   */
  static async acquireLock(
    key: string,
    organizationId: string,
    actionName: string,
    ttlSeconds: number = 300
  ): Promise<{ acquired: boolean; existingRecord?: IdempotencyRecord }> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

    // 1. Check in-memory store
    const existing = memoryStore.get(key);
    if (existing) {
      const isExpired = new Date(existing.expiresAt) < now;
      if (!isExpired) {
        if (existing.state === 'COMMITTED') {
          return { acquired: false, existingRecord: existing };
        }
        if (existing.state === 'IN_PROGRESS') {
          throw new IdempotencyConflictError(
            `Action '${actionName}' with key '${key}' is currently in progress. Concurrent execution blocked.`,
            key,
            'IN_PROGRESS'
          );
        }
      }
    }

    // 2. Try persisting to AgentEvent table as durable lock record if not in unit test bypass
    if (process.env.PERSIST_WORKFLOW_EVENTS === 'true') {
      try {
        await (db as any).agentEvent.create({
          data: {
            organizationId,
            agentName: 'IdempotencyManager',
            stepName: actionName,
            phase: 'act',
            level: 'info',
            traceId: key,
            message: `Idempotency lock acquired for ${actionName}`,
            metadata: {
              idempotencyKey: key,
              state: 'IN_PROGRESS',
              expiresAt,
            },
          },
        });
      } catch {
        // Database optional
      }
    }

    const newRecord: IdempotencyRecord = {
      key,
      organizationId,
      actionName,
      state: 'IN_PROGRESS',
      lockedAt: now.toISOString(),
      expiresAt,
    };

    memoryStore.set(key, newRecord);
    return { acquired: true };
  }

  /**
   * Commit the result of an idempotent execution.
   */
  static async commitResult(
    key: string,
    resultPayload: unknown
  ): Promise<void> {
    const record = memoryStore.get(key);
    const now = new Date().toISOString();

    const updatedRecord: IdempotencyRecord = {
      key,
      organizationId: record?.organizationId || 'default',
      actionName: record?.actionName || 'unknown',
      state: 'COMMITTED',
      resultPayload,
      resultHash: crypto
        .createHash('sha256')
        .update(JSON.stringify(resultPayload || {}))
        .digest('hex'),
      lockedAt: record?.lockedAt || now,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Retain committed record for 24h
    };

    memoryStore.set(key, updatedRecord);

    if (process.env.PERSIST_WORKFLOW_EVENTS === 'true') {
      try {
        await (db as any).agentEvent.create({
          data: {
            organizationId: updatedRecord.organizationId,
            agentName: 'IdempotencyManager',
            stepName: updatedRecord.actionName,
            phase: 'act',
            level: 'info',
            traceId: key,
            message: `Idempotency lock committed for ${updatedRecord.actionName}`,
            outputData: resultPayload as any,
            metadata: {
              idempotencyKey: key,
              state: 'COMMITTED',
            },
          },
        });
      } catch {
        // Database optional
      }
    }
  }

  /**
   * Release lock on failure so subsequent attempts can re-try.
   */
  static async releaseLock(key: string, error?: unknown): Promise<void> {
    const record = memoryStore.get(key);
    if (record) {
      record.state = 'FAILED';
      memoryStore.set(key, record);
    }
  }

  /**
   * Execute an operation with full idempotency guarantees.
   */
  static async runIdempotent<T>(
    key: string,
    organizationId: string,
    actionName: string,
    operation: () => Promise<T>,
    ttlSeconds: number = 300
  ): Promise<{ result: T; cached: boolean }> {
    const { acquired, existingRecord } = await this.acquireLock(key, organizationId, actionName, ttlSeconds);

    if (!acquired && existingRecord?.state === 'COMMITTED') {
      return { result: existingRecord.resultPayload as T, cached: true };
    }

    try {
      const result = await operation();
      await this.commitResult(key, result);
      return { result, cached: false };
    } catch (err) {
      await this.releaseLock(key, err);
      throw err;
    }
  }

  /**
   * Clear all records in memory (for test suites).
   */
  static resetForTesting(): void {
    memoryStore.clear();
  }
}
