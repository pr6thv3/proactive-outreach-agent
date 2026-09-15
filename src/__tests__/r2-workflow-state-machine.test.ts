// ─── TEST SUITE: R2 WORKFLOW STATE MACHINE & IDEMPOTENCY ─────────
// Validates Milestone 2 requirements:
// 1. 13-state workflow state machine with invalid transition guards
// 2. 12-class failure classifier & bounded jittered backoffs
// 3. Idempotency manager guaranteeing exact-once external dispatches
// 4. Checkpoint persistence and crash resumption
// ─────────────────────────────────────────────────────────────────

import assert from 'assert';
import { WorkflowStateMachine, InvalidStateTransitionError } from '../lib/workflow/state-machine';
import { FailureClassifier } from '../lib/workflow/failure-classifier';
import { IdempotencyManager, IdempotencyConflictError } from '../lib/workflow/idempotency';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res
        .then(() => {
          passed++;
          console.log(`  ✅ ${name}`);
        })
        .catch((err) => {
          failed++;
          console.error(`  ❌ ${name}:`, err.message);
        });
    } else {
      passed++;
      console.log(`  ✅ ${name}`);
    }
  } catch (err: any) {
    failed++;
    console.error(`  ❌ ${name}:`, err.message);
  }
}

async function runTests() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('🧪 MILESTONE 2: WORKFLOW STATE MACHINE & IDEMPOTENCY SUITE');
  console.log('════════════════════════════════════════════════════════════════\n');

  console.log('── 1. 13-State Transition Engine ───────────────────────────────');

  await test('Valid sequential lifecycle: CREATED -> UNDERSTANDING -> PLANNED -> VALIDATING', async () => {
    const sm = WorkflowStateMachine.create({
      workflowId: 'wf_test_1',
      organizationId: 'org_test_1',
      targetEntityId: 'msg_1',
      entityType: 'message',
    });

    assert.strictEqual(sm.state, 'CREATED');
    await sm.transitionTo('UNDERSTANDING', 'Decomposing task');
    assert.strictEqual(sm.state, 'UNDERSTANDING');
    await sm.transitionTo('PLANNED', 'Constructed send plan');
    assert.strictEqual(sm.state, 'PLANNED');
    await sm.transitionTo('VALIDATING', 'Validating pre-send policies');
    assert.strictEqual(sm.state, 'VALIDATING');
  });

  await test('Illegal transition throws InvalidStateTransitionError', async () => {
    const sm = WorkflowStateMachine.create({
      workflowId: 'wf_test_2',
      organizationId: 'org_test_1',
      targetEntityId: 'msg_2',
      entityType: 'message',
    });

    let caught = false;
    try {
      // Cannot jump from CREATED directly to EXECUTING
      await sm.transitionTo('EXECUTING', 'Skip straight to send');
    } catch (err) {
      caught = true;
      assert.ok(err instanceof InvalidStateTransitionError);
      assert.strictEqual((err as InvalidStateTransitionError).fromState, 'CREATED');
      assert.strictEqual((err as InvalidStateTransitionError).toState, 'EXECUTING');
    }
    assert.ok(caught, 'Must throw on illegal transition');
  });

  await test('Checkpoint history tracks all state changes with timestamps', async () => {
    const sm = WorkflowStateMachine.create({
      workflowId: 'wf_test_3',
      organizationId: 'org_test_1',
      targetEntityId: 'camp_1',
      entityType: 'campaign',
    });

    await sm.transitionTo('UNDERSTANDING');
    await sm.transitionTo('PLANNED');
    await sm.transitionTo('VALIDATING');
    await sm.transitionTo('WAITING_APPROVAL', 'Held for user approval');

    const history = sm.currentCheckpoint.history;
    assert.strictEqual(history.length, 5); // 1 initial + 4 transitions
    assert.strictEqual(history[4].toState, 'WAITING_APPROVAL');
    assert.strictEqual(history[4].reason, 'Held for user approval');
  });

  await test('Resumption check: Incomplete workflows can resume, terminal states cannot', async () => {
    const sm = WorkflowStateMachine.create({
      workflowId: 'wf_test_4',
      organizationId: 'org_test_1',
      targetEntityId: 'lead_1',
      entityType: 'lead',
    });

    assert.ok(sm.canResume());
    await sm.transitionTo('UNDERSTANDING');
    assert.ok(sm.canResume());
    await sm.transitionTo('PLANNED');
    await sm.transitionTo('VALIDATING');
    await sm.transitionTo('EXECUTING');
    await sm.transitionTo('COMPLETED', 'Send successful');

    assert.strictEqual(sm.canResume(), false, 'Terminal COMPLETED cannot resume');
  });

  console.log('\n── 2. Centralized Failure Classification ───────────────────────');

  test('Classifies invalid input errors correctly', () => {
    const cat1 = FailureClassifier.classifyError(new Error('Invalid email format'));
    const cat2 = FailureClassifier.classifyError({ message: 'Missing required field: companyName' });
    assert.strictEqual(cat1, 'INVALID_INPUT');
    assert.strictEqual(cat2, 'INVALID_INPUT');
    assert.strictEqual(FailureClassifier.isRetryable(cat1), false);
  });

  test('Classifies auth & permission errors correctly', () => {
    const cat1 = FailureClassifier.classifyError(new Error('Unauthorized session token'));
    const cat2 = FailureClassifier.classifyError({ statusCode: 403, message: 'Forbidden: Insufficient role' });
    assert.strictEqual(cat1, 'AUTH_FAILURE');
    assert.strictEqual(cat2, 'PERMISSION_DENIED');
    assert.strictEqual(FailureClassifier.isRetryable(cat1), false);
    assert.strictEqual(FailureClassifier.isRetryable(cat2), false);
  });

  test('Classifies rate limit (429) errors and enables retry', () => {
    const cat = FailureClassifier.classifyError(new Error('Resend rate limit exceeded (code 429)'));
    assert.strictEqual(cat, 'RATE_LIMITED');
    assert.strictEqual(FailureClassifier.isRetryable(cat), true);
  });

  test('Classifies policy block (DNC / Circuit Breaker) and disallows retry', () => {
    const cat1 = FailureClassifier.classifyError(new Error('Circuit breaker tripped: bounce rate 4.2%'));
    const cat2 = FailureClassifier.classifyError(new Error('Lead is on Do Not Contact list'));
    assert.strictEqual(cat1, 'POLICY_BLOCK');
    assert.strictEqual(cat2, 'POLICY_BLOCK');
    assert.strictEqual(FailureClassifier.isRetryable(cat1), false);
  });

  test('Classifies provider and network failures as retryable', () => {
    const cat1 = FailureClassifier.classifyError(new Error('fetch failed: ECONNRESET'));
    const cat2 = FailureClassifier.classifyError({ statusCode: 503, message: 'Resend API service unavailable' });
    const cat3 = FailureClassifier.classifyError(new Error('ETIMEDOUT: Connection to SMTP host timed out'));
    assert.strictEqual(cat1, 'NETWORK_FAILURE');
    assert.strictEqual(cat2, 'PROVIDER_FAILURE');
    assert.strictEqual(cat3, 'TIMEOUT');
    assert.strictEqual(FailureClassifier.isRetryable(cat1), true);
    assert.strictEqual(FailureClassifier.isRetryable(cat2), true);
    assert.strictEqual(FailureClassifier.isRetryable(cat3), true);
  });

  test('Bounded jittered backoff calculation adheres to min/max thresholds', () => {
    const policy = {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2.0,
      jitterFactor: 0.15,
    };

    const delay0 = FailureClassifier.calculateBackoffDelay(0, policy);
    const delay1 = FailureClassifier.calculateBackoffDelay(1, policy);
    const delay5 = FailureClassifier.calculateBackoffDelay(5, policy);

    // Attempt 0: ~1000ms (+/- 15%) => [850, 1150]
    assert.ok(delay0 >= 800 && delay0 <= 1200, `Delay0 (${delay0}) out of range`);
    // Attempt 1: ~2000ms (+/- 15%) => [1700, 2300]
    assert.ok(delay1 >= 1600 && delay1 <= 2400, `Delay1 (${delay1}) out of range`);
    // Attempt 5: bounded at max 10000ms (+/- 15%) => <= 11500
    assert.ok(delay5 <= 11500, `Delay5 (${delay5}) exceeded bounded max`);
  });

  console.log('\n── 3. Persistent Idempotency Engine ────────────────────────────');

  await test('Exact-once execution: Second invocation returns cached output', async () => {
    IdempotencyManager.resetForTesting();
    const key = IdempotencyManager.generateKey('org_1', 'send_email', 'msg_100');

    let counter = 0;
    const sendOperation = async () => {
      counter++;
      return { status: 'sent', providerId: 'resend_abc_123' };
    };

    const run1 = await IdempotencyManager.runIdempotent(key, 'org_1', 'send_email', sendOperation);
    assert.strictEqual(run1.cached, false);
    assert.strictEqual(run1.result.providerId, 'resend_abc_123');
    assert.strictEqual(counter, 1);

    // Second call with same key
    const run2 = await IdempotencyManager.runIdempotent(key, 'org_1', 'send_email', sendOperation);
    assert.strictEqual(run2.cached, true);
    assert.strictEqual(run2.result.providerId, 'resend_abc_123');
    assert.strictEqual(counter, 1, 'Operation must not execute second time');
  });

  await test('Lock contention prevents concurrent double-dispatches', async () => {
    IdempotencyManager.resetForTesting();
    const key = IdempotencyManager.generateKey('org_1', 'send_email', 'msg_200');

    // Acquire lock
    const { acquired } = await IdempotencyManager.acquireLock(key, 'org_1', 'send_email', 60);
    assert.strictEqual(acquired, true);

    // Concurrent request attempts to acquire while IN_PROGRESS
    let threw = false;
    try {
      await IdempotencyManager.acquireLock(key, 'org_1', 'send_email', 60);
    } catch (err) {
      threw = true;
      assert.ok(err instanceof IdempotencyConflictError);
    }
    assert.ok(threw, 'Must throw IdempotencyConflictError on concurrent lock acquisition');
  });

  await test('Failed operation releases lock to allow subsequent retry', async () => {
    IdempotencyManager.resetForTesting();
    const key = IdempotencyManager.generateKey('org_1', 'send_email', 'msg_300');

    let attempts = 0;
    const flakyOperation = async () => {
      attempts++;
      if (attempts === 1) throw new Error('Transient 503 Provider Unavailable');
      return { status: 'sent', providerId: 'resend_def_456' };
    };

    // First attempt fails
    try {
      await IdempotencyManager.runIdempotent(key, 'org_1', 'send_email', flakyOperation);
    } catch {
      // Expected failure
    }

    // Second attempt should be allowed to acquire lock and succeed
    const run2 = await IdempotencyManager.runIdempotent(key, 'org_1', 'send_email', flakyOperation);
    assert.strictEqual(run2.cached, false);
    assert.strictEqual(run2.result.providerId, 'resend_def_456');
    assert.strictEqual(attempts, 2);
  });

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('════════════════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

runTests();
