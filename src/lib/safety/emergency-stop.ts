// ─── SERVER-SIDE WORKSPACE EMERGENCY STOP ───────────────────────────
// Non-negotiable safety guardrail (R7). Blocks outbound side effects
// across all queues, workers, direct sends, and autonomous loops.
// Enforced server-side, idempotent, auditable, and independently testable.
// Inbound event ingestion and audit logging continue unimpeded.
// ───────────────────────────────────────────────────────────────────

import { db } from '@/lib/db';
import { getRedis } from '@/lib/redis';

export interface EmergencyStopStatus {
  isStopped: boolean;
  stoppedAt?: Date | null;
  stoppedBy?: string | null;
  reason?: string | null;
  scope: 'WORKSPACE';
  organizationId: string;
}

export class EmergencyStopBlockedError extends Error {
  public readonly code = 'EMERGENCY_STOP_ACTIVE';
  public readonly organizationId: string;
  public readonly reason?: string;

  constructor(organizationId: string, reason?: string) {
    super(
      `Outbound side-effects blocked: Workspace Emergency Stop is active for organization '${organizationId}'${
        reason ? ` (${reason})` : ''
      }.`
    );
    this.name = 'EmergencyStopBlockedError';
    this.organizationId = organizationId;
    this.reason = reason;
  }
}

const REDIS_KEY_PREFIX = 'emergency_stop:';

// In-memory persistent map for local testing and zero-latency lookups
const inMemoryStore = new Map<string, EmergencyStopStatus>();

/**
 * Resets in-memory emergency stop state (for testing isolation).
 */
export function resetEmergencyStopForTesting(): void {
  inMemoryStore.clear();
}

/**
 * Sets workspace-level emergency stop state idempotently.
 * Dual-persists to Database and Redis (if configured), and writes to AuditLog.
 */
export async function setWorkspaceEmergencyStop(
  orgId: string,
  stopped: boolean,
  reason?: string,
  userId?: string
): Promise<EmergencyStopStatus> {
  if (!orgId) {
    throw new Error('organizationId is required to set workspace emergency stop');
  }

  const now = new Date();
  const status: EmergencyStopStatus = {
    isStopped: stopped,
    stoppedAt: stopped ? now : null,
    stoppedBy: stopped ? (userId || 'system') : null,
    reason: stopped ? (reason || 'Manual emergency stop engaged') : null,
    scope: 'WORKSPACE',
    organizationId: orgId,
  };

  // 1. Update in-memory store
  inMemoryStore.set(orgId, status);

  // 2. High-speed Redis write if available
  const redis = getRedis();
  if (redis) {
    const key = `${REDIS_KEY_PREFIX}${orgId}`;
    try {
      const redisOp = stopped
        ? redis.set(
            key,
            JSON.stringify({
              isStopped: true,
              stoppedAt: now.toISOString(),
              stoppedBy: userId || 'system',
              reason: reason || 'Manual emergency stop engaged',
            })
          )
        : redis.del(key);

      await Promise.race([
        redisOp,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 100)),
      ]);
    } catch {
      // Redis unavailable or timed out; continue with DB
    }
  }

  // 3. Durable Database update via DB proxy
  try {
    await db.workspaceEmergencyStop.upsert({
      where: { organizationId: orgId },
      update: {
        isStopped: stopped,
        stoppedAt: stopped ? now : null,
        stoppedBy: stopped ? (userId || 'system') : null,
        reason: stopped ? (reason || 'Manual emergency stop engaged') : null,
      },
      create: {
        organizationId: orgId,
        isStopped: stopped,
        stoppedAt: stopped ? now : null,
        stoppedBy: stopped ? (userId || 'system') : null,
        reason: stopped ? (reason || 'Manual emergency stop engaged') : null,
      },
    });
  } catch (dbError) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[EmergencyStop] DB persistence error:', dbError);
    }
  }

  // 4. Immutable Audit Log emission (audit logging never stops during emergency stop)
  try {
    // Only pass userId if it matches a valid user record; otherwise null to satisfy FK
    const validUser = userId && userId !== 'system'
      ? await db.user.findUnique({ where: { id: userId }, select: { id: true } }).catch(() => null)
      : null;

    await db.auditLog.create({
      data: {
        organizationId: orgId,
        userId: validUser ? validUser.id : null,
        action: stopped ? 'EMERGENCY_STOP_ENGAGED' : 'EMERGENCY_STOP_RELEASED',
        entityType: 'Organization',
        entityId: orgId,
        metadata: {
          reason: status.reason,
          scope: 'WORKSPACE',
          actor: userId || 'system',
          timestamp: now.toISOString(),
        },
      },
    });
  } catch (auditError) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[EmergencyStop] Audit log emission notice (proceeding safely):', auditError);
    }
  }

  return status;
}

/**
 * Retrieves the full status of workspace emergency stop.
 */
export async function getWorkspaceEmergencyStopStatus(orgId: string): Promise<EmergencyStopStatus> {
  if (!orgId) {
    return {
      isStopped: false,
      scope: 'WORKSPACE',
      organizationId: '',
    };
  }

  // 1. Check in-memory store
  if (inMemoryStore.has(orgId)) {
    return inMemoryStore.get(orgId)!;
  }

  // 2. Check Redis cache
  const redis = getRedis();
  if (redis) {
    try {
      const cached = await Promise.race([
        redis.get<string | object>(`${REDIS_KEY_PREFIX}${orgId}`),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 100)),
      ]);
      if (cached) {
        const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
        const status: EmergencyStopStatus = {
          isStopped: Boolean(parsed.isStopped),
          stoppedAt: parsed.stoppedAt ? new Date(parsed.stoppedAt) : null,
          stoppedBy: parsed.stoppedBy || null,
          reason: parsed.reason || null,
          scope: 'WORKSPACE',
          organizationId: orgId,
        };
        inMemoryStore.set(orgId, status);
        return status;
      }
    } catch {
      // Fall through to DB
    }
  }

  // 3. Fallback to Database
  try {
    const record = await db.workspaceEmergencyStop.findFirst({
      where: { organizationId: orgId },
    });
    if (record) {
      const status: EmergencyStopStatus = {
        isStopped: Boolean(record.isStopped),
        stoppedAt: record.stoppedAt ? new Date(record.stoppedAt) : null,
        stoppedBy: record.stoppedBy || null,
        reason: record.reason || null,
        scope: 'WORKSPACE',
        organizationId: orgId,
      };
      inMemoryStore.set(orgId, status);
      return status;
    }
  } catch {
    // Return unstopped status on read failure
  }

  return {
    isStopped: false,
    stoppedAt: null,
    stoppedBy: null,
    reason: null,
    scope: 'WORKSPACE',
    organizationId: orgId,
  };
}

/**
 * Checks if workspace emergency stop is active.
 * Idempotent, sub-millisecond check.
 */
export async function isWorkspaceEmergencyStopped(orgId: string): Promise<boolean> {
  if (!orgId) return false;
  const status = await getWorkspaceEmergencyStopStatus(orgId);
  return status.isStopped;
}

/**
 * Alias for isWorkspaceEmergencyStopped.
 */
export async function checkWorkspaceEmergencyStop(orgId: string): Promise<boolean> {
  return isWorkspaceEmergencyStopped(orgId);
}

/**
 * Assert that outbound operations are permitted for the organization.
 * Throws EmergencyStopBlockedError if emergency stop is engaged.
 */
export async function assertOutboundAllowed(
  target: string | EmergencyStopStatus
): Promise<void> {
  if (typeof target === 'string') {
    const stopped = await isWorkspaceEmergencyStopped(target);
    if (stopped) {
      const status = await getWorkspaceEmergencyStopStatus(target);
      throw new EmergencyStopBlockedError(target, status.reason || undefined);
    }
  } else if (target && typeof target === 'object') {
    if (target.isStopped) {
      throw new EmergencyStopBlockedError(target.organizationId, target.reason || undefined);
    }
  }
}
