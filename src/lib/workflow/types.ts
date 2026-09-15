// ─── WORKFLOW & EXECUTION ENGINE: TYPES & INTERFACES ─────────────
// Milestone 2 (R2): Durable 13-State Execution State Machine,
// Centralized Failure Classifier, and Persistent Idempotency Engine.
// ─────────────────────────────────────────────────────────────────

export type WorkflowState =
  | 'CREATED'
  | 'UNDERSTANDING'
  | 'PLANNED'
  | 'VALIDATING'
  | 'WAITING_APPROVAL'
  | 'EXECUTING'
  | 'RETRYING'
  | 'PARTIAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'ROLLED_BACK'
  | 'QUARANTINED';

export type FailureCategory =
  | 'INVALID_INPUT'
  | 'AUTH_FAILURE'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'NETWORK_FAILURE'
  | 'PROVIDER_FAILURE'
  | 'MODEL_FAILURE'
  | 'VALIDATION_FAILURE'
  | 'POLICY_BLOCK'
  | 'DUPLICATE'
  | 'TIMEOUT'
  | 'PARTIAL_FAILURE'
  | 'UNKNOWN_FAILURE';

export interface RetryPolicy {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number; // e.g., 0.15 for +/- 15%
}

export interface FailureResolution {
  category: FailureCategory;
  isRetryable: boolean;
  retryBudgetRemaining: number;
  calculatedDelayMs: number;
  fallbackAction?: 'QUARANTINE' | 'FAIL_PERMANENTLY' | 'HUMAN_ESCALATION' | 'FALLBACK_HANDLER' | 'NO_OP';
  escalationRequired: boolean;
  requiresRollback: boolean;
  userFacingReason: string;
  auditMessage: string;
}

export interface WorkflowTransition {
  fromState: WorkflowState;
  toState: WorkflowState;
  timestamp: string;
  actorId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowCheckpoint {
  workflowId: string;
  organizationId: string;
  currentState: WorkflowState;
  targetEntityId: string;
  entityType: 'campaign' | 'lead' | 'message' | 'webhook' | 'dnc';
  attemptCount: number;
  maxAttempts: number;
  history: WorkflowTransition[];
  lastError?: {
    category: FailureCategory;
    message: string;
    timestamp: string;
  };
  contextData: Record<string, unknown>;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IdempotencyRecord {
  key: string;
  organizationId: string;
  actionName: string;
  state: 'IN_PROGRESS' | 'COMMITTED' | 'FAILED';
  resultHash?: string;
  resultPayload?: unknown;
  lockedAt: string;
  expiresAt: string;
}
