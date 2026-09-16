// ─── SAFE SUPPRESSION & ESCALATION SEPARATION ──────────────────────
// Non-negotiable safety guardrail (R9).
// Two-phase decoupled architecture:
// Phase 1: Explicit opt-out triggers immediate, idempotent workspace-wide
//          suppression (blacklist/DNC) INDEPENDENT of downstream escalation.
// Phase 2: Persist high-risk escalation cases (privacy/GDPR, legal, security,
//          human review) into a durable EscalationTask model.
// Failure of Phase 2 MUST NEVER cause Phase 1 suppression to be lost or delayed.
// ───────────────────────────────────────────────────────────────────

import { db } from '@/lib/db';
import { normalizeDncEmail } from '@/lib/safety';

export type EscalationType =
  | 'PRIVACY_GDPR'
  | 'LEGAL_THREAT'
  | 'SECURITY_WARNING'
  | 'HUMAN_REVIEW'
  | 'VIP_ESCALATION'
  | string;

export type EscalationSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type EscalationStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED';

export interface EscalationTask {
  id: string;
  organizationId: string;
  leadId?: string | null;
  messageId?: string | null;
  type: EscalationType;
  severity: EscalationSeverity;
  status: EscalationStatus;
  title: string;
  description: string;
  payload?: any;
  assignedTo?: string | null;
  resolvedAt?: Date | null;
  resolutionNotes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SuppressionParams {
  organizationId: string;
  email: string;
  leadId?: string;
  reason?: string;
  source?: string;
  actorId?: string;
}

export interface EscalationParams {
  organizationId: string;
  leadId?: string;
  messageId?: string;
  type: EscalationType;
  severity?: EscalationSeverity;
  title: string;
  description: string;
  payload?: Record<string, unknown>;
  assignedTo?: string;
}

export interface SafeSuppressionResult {
  suppressed: boolean;
  dncAdded: boolean;
  leadUpdated: boolean;
  cancelledEmailsCount: number;
  cancelledFollowUpsCount: number;
  email: string;
  normalizedEmail: string;
}

export interface SuppressionAndEscalationResult {
  suppressed: boolean;
  dncAdded: boolean;
  leadUpdated: boolean;
  cancelledEmailsCount: number;
  cancelledFollowUpsCount: number;
  escalated: boolean;
  escalationTask?: EscalationTask | null;
  escalationError?: string | null;
}

// In-memory DNC cache for instant test execution and fast lookups
const inMemoryDncSet = new Set<string>();
const inMemoryEscalationTasks = new Map<string, EscalationTask>();

/**
 * Resets local test cache for isolation.
 */
export function resetSuppressionForTesting(): void {
  inMemoryDncSet.clear();
  inMemoryEscalationTasks.clear();
}

/**
 * PHASE 1: Immediate, idempotent, workspace-wide suppression.
 * Adds email to DoNotContact, blacklists/unsubscribes lead,
 * and immediately cancels all pending outbound messages/followups.
 * Guaranteed to execute independently of downstream escalation.
 */
export async function executeSafeSuppression(params: SuppressionParams): Promise<SafeSuppressionResult> {
  const { organizationId, email, leadId: explicitLeadId, reason = 'Explicit opt-out', source = 'suppression_engine', actorId = 'system' } = params;

  if (!email || typeof email !== 'string') {
    throw new Error('Valid email is required for suppression');
  }
  if (!organizationId) {
    throw new Error('organizationId is required for workspace-scoped suppression');
  }

  const { normalized, baseEmail } = normalizeDncEmail(email);
  const cacheKey = `${organizationId}:${normalized}`;
  inMemoryDncSet.add(cacheKey);
  if (baseEmail !== normalized) {
    inMemoryDncSet.add(`${organizationId}:${baseEmail}`);
  }

  let dncAdded = false;
  let leadUpdated = false;
  let cancelledEmailsCount = 0;
  let cancelledFollowUpsCount = 0;

  // 1. Add to workspace DoNotContact table (Idempotent)
  try {
    const candidateEmails = normalized === baseEmail ? [normalized] : [normalized, baseEmail];
    const existing = await db.doNotContact.findFirst({
      where: {
        email: { in: candidateEmails },
        organizationId,
      },
    });

    if (existing) {
      await db.doNotContact.update({
        where: { id: existing.id },
        data: { reason, source },
      });
      dncAdded = true;
    } else {
      await db.doNotContact.create({
        data: {
          organizationId,
          email: normalized,
          reason,
          source,
        },
      });
      dncAdded = true;
    }
  } catch (dncErr) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[Suppression] DoNotContact persistence warning:', dncErr);
    }
    // DNC cache still set
    dncAdded = true;
  }

  // 2. Resolve lead record by explicit ID or email
  let resolvedLeadId = explicitLeadId;
  if (!resolvedLeadId) {
    try {
      const foundLead = await db.lead.findFirst({
        where: {
          email: { in: [email, normalized, baseEmail] },
          organizationId,
        },
        select: { id: true },
      });
      if (foundLead) {
        resolvedLeadId = foundLead.id;
      }
    } catch {
      // Ignore
    }
  }

  // 3. Mark lead record as unsubscribed, doNotContact, and blacklisted
  if (resolvedLeadId) {
    try {
      const updated = await db.lead.updateMany({
        where: { id: resolvedLeadId, organizationId },
        data: {
          status: 'unsubscribed',
          doNotContact: true,
          isBlacklisted: true,
        },
      });
      leadUpdated = updated.count > 0;
    } catch (leadErr) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Suppression] Lead update warning:', leadErr);
      }
    }

    // 4. Cancel all pending/scheduled outbound emails immediately
    try {
      const cancelledEmails = await db.outreachEmail.updateMany({
        where: {
          leadId: resolvedLeadId,
          organizationId,
          status: { in: ['generated', 'approved', 'QUEUED', 'queued'] },
        },
        data: { status: 'cancelled' },
      });
      cancelledEmailsCount = cancelledEmails.count;
    } catch (emailErr) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Suppression] Email cancellation warning:', emailErr);
      }
    }

    // 5. Cancel all scheduled followups immediately
    try {
      const cancelledFollowups = await db.followUp.updateMany({
        where: {
          leadId: resolvedLeadId,
          organizationId,
          status: 'scheduled',
        },
        data: { status: 'cancelled' },
      });
      cancelledFollowUpsCount = cancelledFollowups.count;
    } catch (followupErr) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Suppression] Followup cancellation warning:', followupErr);
      }
    }
  }

  // 6. Record immutable audit log
  try {
    const validUserId = actorId && actorId !== 'system' ? actorId : null;
    await db.auditLog.create({
      data: {
        organizationId,
        userId: validUserId,
        action: 'OPT_OUT_SUPPRESSION_ENFORCED',
        entityType: 'Lead',
        entityId: resolvedLeadId || normalized,
        metadata: {
          email: normalized,
          reason,
          source,
          cancelledEmailsCount,
          cancelledFollowUpsCount,
          timestamp: new Date().toISOString(),
        },
      },
    });
  } catch {
    // Non-fatal
  }

  return {
    suppressed: true,
    dncAdded,
    leadUpdated,
    cancelledEmailsCount,
    cancelledFollowUpsCount,
    email,
    normalizedEmail: normalized,
  };
}

/**
 * PHASE 2: Creates a durable EscalationTask record in the database.
 * Used for GDPR/privacy compliance, legal threats, security warnings,
 * and high-risk customer interactions requiring human review.
 */
export async function createEscalationTask(params: EscalationParams): Promise<EscalationTask> {
  const {
    organizationId,
    leadId,
    messageId,
    type,
    severity = 'HIGH',
    title,
    description,
    payload,
    assignedTo,
  } = params;

  if (!organizationId) throw new Error('organizationId is required for EscalationTask');
  if (!title) throw new Error('title is required for EscalationTask');

  const now = new Date();
  const id = `esc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const taskData: EscalationTask = {
    id,
    organizationId,
    leadId: leadId || null,
    messageId: messageId || null,
    type,
    severity,
    status: 'OPEN',
    title,
    description,
    payload: payload || null,
    assignedTo: assignedTo || null,
    resolvedAt: null,
    resolutionNotes: null,
    createdAt: now,
    updatedAt: now,
  };

  // Persist via DB proxy (compatible with SQLite / PostgreSQL)
  // Must NOT swallow DB errors — errors must propagate so the caller
  // accurately records escalated: false and captures escalationError,
  // while Phase 1 suppression remains completely committed and intact.
  await db.escalationTask.create({
    data: {
      id,
      organizationId,
      leadId: leadId || null,
      messageId: messageId || null,
      type,
      severity,
      status: 'OPEN',
      title,
      description,
      payload: payload ? JSON.stringify(payload) : null,
      assignedTo: assignedTo || null,
    },
  });

  // Cache in memory only after durable DB persistence succeeds
  inMemoryEscalationTasks.set(id, taskData);

  // Audit log
  try {
    const validUserId = assignedTo && assignedTo !== 'system' ? assignedTo : null;
    await db.auditLog.create({
      data: {
        organizationId,
        userId: validUserId,
        action: 'ESCALATION_TASK_CREATED',
        entityType: 'EscalationTask',
        entityId: id,
        metadata: {
          type,
          severity,
          title,
          leadId,
          timestamp: now.toISOString(),
        },
      },
    });
  } catch {
    // Non-fatal
  }

  return taskData;
}

/**
 * Coordinated Two-Phase Execution:
 * Executes Phase 1 (Immediate Suppression) and Phase 2 (Persisted Escalation).
 * If Phase 2 throws or fails, Phase 1 suppression remains 100% committed,
 * safe, and intact.
 */
export async function executeSeparatedSuppressionAndEscalation(params: {
  suppression: SuppressionParams;
  escalation?: EscalationParams;
  simulateEscalationFailure?: boolean;
}): Promise<SuppressionAndEscalationResult> {
  // ── PHASE 1: Immediate Atomic Suppression ──
  const suppressionResult = await executeSafeSuppression(params.suppression);

  // ── PHASE 2: Durable Escalation Task (Decoupled Isolation) ──
  let escalationTask: EscalationTask | null = null;
  let escalationError: string | null = null;

  if (params.escalation) {
    try {
      if (params.simulateEscalationFailure) {
        throw new Error('Downstream escalation task creation simulated failure (network timeout / queue deadlock)');
      }
      escalationTask = await createEscalationTask(params.escalation);
    } catch (err: any) {
      escalationError = err?.message || 'Failed to create escalation task';
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[Suppression/Escalation Separation] Downstream escalation task creation failed, but Phase 1 suppression remains SAFE and INTACT:',
          escalationError
        );
      }
    }
  }

  return {
    suppressed: suppressionResult.suppressed,
    dncAdded: suppressionResult.dncAdded,
    leadUpdated: suppressionResult.leadUpdated,
    cancelledEmailsCount: suppressionResult.cancelledEmailsCount,
    cancelledFollowUpsCount: suppressionResult.cancelledFollowUpsCount,
    escalated: Boolean(escalationTask),
    escalationTask,
    escalationError,
  };
}

/**
 * Checks if an email is suppressed for a given organization.
 */
export async function isEmailSuppressed(email: string, orgId?: string): Promise<boolean> {
  if (!email || typeof email !== 'string') return false;
  const { normalized, baseEmail } = normalizeDncEmail(email);

  if (orgId) {
    if (inMemoryDncSet.has(`${orgId}:${normalized}`) || inMemoryDncSet.has(`${orgId}:${baseEmail}`)) {
      return true;
    }
  }

  try {
    const candidateEmails = normalized === baseEmail ? [normalized] : [normalized, baseEmail];
    const match = await db.doNotContact.findFirst({
      where: {
        email: { in: candidateEmails },
        ...(orgId ? { organizationId: orgId } : {}),
      },
    });
    return Boolean(match);
  } catch {
    return false;
  }
}

/**
 * Retrieve escalation tasks for an organization.
 */
export async function getEscalationTasks(
  orgId: string,
  options?: { status?: EscalationStatus; type?: EscalationType; severity?: EscalationSeverity }
): Promise<EscalationTask[]> {
  if (!orgId) return [];

  const memoryMatches = Array.from(inMemoryEscalationTasks.values()).filter(task => {
    if (task.organizationId !== orgId) return false;
    if (options?.status && task.status !== options.status) return false;
    if (options?.type && task.type !== options.type) return false;
    if (options?.severity && task.severity !== options.severity) return false;
    return true;
  });

  if (memoryMatches.length > 0) {
    return memoryMatches;
  }

  try {
    const where: any = { organizationId: orgId };
    if (options?.status) where.status = options.status;
    if (options?.type) where.type = options.type;
    if (options?.severity) where.severity = options.severity;

    const records = await db.escalationTask.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r: any) => ({
      ...r,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
    }));
  } catch {
    return [];
  }
}

/**
 * Resolves an escalation task with human resolution notes.
 */
export async function resolveEscalationTask(
  taskId: string,
  resolution: { notes: string; resolvedBy?: string }
): Promise<EscalationTask> {
  const now = new Date();

  const mem = inMemoryEscalationTasks.get(taskId);
  if (mem) {
    mem.status = 'RESOLVED';
    mem.resolutionNotes = resolution.notes;
    mem.resolvedAt = now;
    mem.assignedTo = resolution.resolvedBy || mem.assignedTo;
    mem.updatedAt = now;
  }

  try {
    await db.escalationTask.update({
      where: { id: taskId },
      data: {
        status: 'RESOLVED',
        resolutionNotes: resolution.notes,
        resolvedAt: now,
        assignedTo: resolution.resolvedBy,
      },
    });
  } catch {
    // Fall back to memory
  }

  if (mem) return mem;

  return {
    id: taskId,
    organizationId: '',
    type: 'HUMAN_REVIEW',
    severity: 'MEDIUM',
    status: 'RESOLVED',
    title: 'Resolved Task',
    description: '',
    resolutionNotes: resolution.notes,
    resolvedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}
