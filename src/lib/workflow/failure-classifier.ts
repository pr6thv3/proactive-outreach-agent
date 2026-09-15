// ─── WORKFLOW FAILURE CLASSIFIER & RETRY STRATEGY ────────────────
// Implements centralized failure classification and bounded jittered retries
// for Milestone 2 (R2).
// ─────────────────────────────────────────────────────────────────

import { FailureCategory, FailureResolution, RetryPolicy } from './types';

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2.0,
  jitterFactor: 0.15,
};

export class FailureClassifier {
  /**
   * Classify any error into one of the 12 canonical failure categories.
   */
  static classifyError(error: unknown): FailureCategory {
    if (!error) return 'UNKNOWN_FAILURE';

    const msg = (
      error instanceof Error
        ? error.message
        : (error as any)?.message
        ? String((error as any).message)
        : String(error)
    ).toLowerCase();

    const code = (error as any)?.code ? String((error as any).code).toLowerCase() : '';
    const status = (error as any)?.status || (error as any)?.statusCode;

    // 1. Invalid input
    if (
      msg.includes('invalid email') ||
      msg.includes('missing required') ||
      msg.includes('validation error') ||
      msg.includes('zod') ||
      msg.includes('syntax error') ||
      msg.includes('rfc 4180') ||
      status === 422 ||
      code === 'invalid_input'
    ) {
      return 'INVALID_INPUT';
    }

    // 2. Auth failure
    if (
      msg.includes('unauthorized') ||
      msg.includes('invalid api key') ||
      msg.includes('expired token') ||
      msg.includes('authentication') ||
      msg.includes('unauthenticated') ||
      status === 401 ||
      code === 'unauthenticated' ||
      code === 'auth_failure'
    ) {
      return 'AUTH_FAILURE';
    }

    // 3. Permission denied / RBAC
    if (
      msg.includes('forbidden') ||
      msg.includes('permission denied') ||
      msg.includes('insufficient role') ||
      status === 403 ||
      code === 'forbidden'
    ) {
      return 'PERMISSION_DENIED';
    }

    // 4. Rate limited
    if (
      msg.includes('rate limit') ||
      msg.includes('too many requests') ||
      msg.includes('429') ||
      msg.includes('quota reached') ||
      msg.includes('resource_exhausted') ||
      status === 429 ||
      code === 'rate_limited' ||
      code === 'resource_exhausted'
    ) {
      return 'RATE_LIMITED';
    }

    // 5. Policy block (DNC, Circuit breaker, Autonomy restriction)
    if (
      msg.includes('circuit breaker') ||
      msg.includes('do not contact') ||
      msg.includes('dnc') ||
      msg.includes('policy violation') ||
      msg.includes('level_0_prohibits') ||
      msg.includes('level_1_prohibits') ||
      msg.includes('prohibited') ||
      code.includes('policy_')
    ) {
      return 'POLICY_BLOCK';
    }

    // 6. Duplicate / Idempotency clash
    if (
      msg.includes('duplicate') ||
      msg.includes('already processed') ||
      msg.includes('idempotency') ||
      msg.includes('unique constraint') ||
      code === 'duplicate_action' ||
      code === 'p2002' // Prisma unique constraint error
    ) {
      return 'DUPLICATE';
    }

    // 7. Timeout
    if (
      msg.includes('timeout') ||
      msg.includes('timed out') ||
      msg.includes('etimedout') ||
      msg.includes('abort') ||
      code === 'timeout'
    ) {
      return 'TIMEOUT';
    }

    // 8. Network failure
    if (
      msg.includes('econnrefused') ||
      msg.includes('econnreset') ||
      msg.includes('enotfound') ||
      msg.includes('network error') ||
      msg.includes('fetch failed') ||
      code === 'network_failure'
    ) {
      return 'NETWORK_FAILURE';
    }

    // 9. Provider failure (Resend, DNS, Cal.com)
    if (
      msg.includes('resend') ||
      msg.includes('smtp') ||
      msg.includes('nameserver') ||
      msg.includes('service unavailable') ||
      status === 502 ||
      status === 503 ||
      status === 504
    ) {
      return 'PROVIDER_FAILURE';
    }

    // 10. Model / AI inference failure
    if (
      msg.includes('llm') ||
      msg.includes('model error') ||
      msg.includes('completion failed') ||
      msg.includes('hallucination')
    ) {
      return 'MODEL_FAILURE';
    }

    // 11. Validation failure
    if (msg.includes('schema mismatch') || msg.includes('invariant failed')) {
      return 'VALIDATION_FAILURE';
    }

    return 'UNKNOWN_FAILURE';
  }

  /**
   * Determine whether a category of failure should be retried.
   */
  static isRetryable(category: FailureCategory): boolean {
    switch (category) {
      case 'RATE_LIMITED':
      case 'NETWORK_FAILURE':
      case 'PROVIDER_FAILURE':
      case 'MODEL_FAILURE':
      case 'TIMEOUT':
        return true;

      case 'INVALID_INPUT':
      case 'AUTH_FAILURE':
      case 'PERMISSION_DENIED':
      case 'POLICY_BLOCK':
      case 'DUPLICATE':
      case 'VALIDATION_FAILURE':
      case 'PARTIAL_FAILURE':
      case 'UNKNOWN_FAILURE':
      default:
        return false;
    }
  }

  /**
   * Calculate bounded, jittered exponential backoff delay in milliseconds.
   */
  static calculateBackoffDelay(
    attempt: number,
    policy: RetryPolicy = DEFAULT_RETRY_POLICY
  ): number {
    const rawDelay = policy.initialDelayMs * Math.pow(policy.backoffMultiplier, attempt);
    const boundedDelay = Math.min(rawDelay, policy.maxDelayMs);

    // Apply +/- jitterFactor (default +/- 15%)
    const jitter = 1 + (Math.random() * 2 - 1) * policy.jitterFactor;
    return Math.round(boundedDelay * jitter);
  }

  /**
   * Resolve complete failure plan with recovery actions, human escalations, and audit entries.
   */
  static resolveFailure(
    error: unknown,
    currentAttempt: number = 0,
    policy: RetryPolicy = DEFAULT_RETRY_POLICY
  ): FailureResolution {
    const category = this.classifyError(error);
    const canRetry = this.isRetryable(category);
    const retryBudgetRemaining = Math.max(0, policy.maxRetries - currentAttempt);
    const willRetry = canRetry && retryBudgetRemaining > 0;

    const delay = willRetry ? this.calculateBackoffDelay(currentAttempt, policy) : 0;
    const rawMsg = error instanceof Error ? error.message : (error as any)?.message ? String((error as any).message) : String(error);

    let fallbackAction: FailureResolution['fallbackAction'] = 'NO_OP';
    let escalationRequired = false;
    let requiresRollback = false;
    let userFacingReason = 'An unexpected error occurred while processing this step.';

    switch (category) {
      case 'INVALID_INPUT':
        fallbackAction = 'FAIL_PERMANENTLY';
        userFacingReason = `The input data provided is invalid: ${rawMsg}`;
        break;

      case 'AUTH_FAILURE':
      case 'PERMISSION_DENIED':
        fallbackAction = 'HUMAN_ESCALATION';
        escalationRequired = true;
        userFacingReason = 'Authentication failed or insufficient permissions for this operation.';
        break;

      case 'POLICY_BLOCK':
        fallbackAction = 'QUARANTINE';
        userFacingReason = `Operation halted by safety policy: ${rawMsg}`;
        break;

      case 'RATE_LIMITED':
        fallbackAction = willRetry ? 'NO_OP' : 'HUMAN_ESCALATION';
        escalationRequired = !willRetry;
        userFacingReason = willRetry
          ? `Temporarily rate limited. Retrying automatically in ${Math.round(delay / 1000)}s.`
          : 'Service rate limit exceeded retry threshold. Campaign has been paused to protect reputation.';
        break;

      case 'PROVIDER_FAILURE':
      case 'NETWORK_FAILURE':
      case 'TIMEOUT':
        fallbackAction = willRetry ? 'NO_OP' : 'HUMAN_ESCALATION';
        escalationRequired = !willRetry;
        requiresRollback = !willRetry;
        userFacingReason = willRetry
          ? `External service temporarily unavailable. Auto-retrying (attempt ${currentAttempt + 1}/${policy.maxRetries}).`
          : 'Downstream provider failure exhausted retry attempts. Task held for manual review.';
        break;

      case 'DUPLICATE':
        fallbackAction = 'NO_OP';
        userFacingReason = 'This action was already executed previously. Duplicate request safely skipped.';
        break;

      default:
        fallbackAction = 'HUMAN_ESCALATION';
        escalationRequired = true;
        userFacingReason = `Processing failed: ${rawMsg}`;
        break;
    }

    return {
      category,
      isRetryable: willRetry,
      retryBudgetRemaining,
      calculatedDelayMs: delay,
      fallbackAction,
      escalationRequired,
      requiresRollback,
      userFacingReason,
      auditMessage: `[FailureClassifier] ${category}: ${rawMsg} (Attempt ${currentAttempt}/${policy.maxRetries}, Retry: ${willRetry}, Fallback: ${fallbackAction})`,
    };
  }
}
