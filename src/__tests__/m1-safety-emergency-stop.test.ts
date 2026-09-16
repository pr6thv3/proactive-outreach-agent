// ─── TEST SUITE: MILESTONE 1 (R7, R9, R3) ───────────────────────────
// Production Pilot Validation & Non-Negotiable Guardrails
// 1. R7: Server-Side Emergency Stop (queues, workers, send route, multi-tenant)
// 2. R9: Safe Suppression / Escalation Separation (decoupled failure boundary)
// 3. R3: Safe Provider Semantics & Customer-Configurable Circuit Breakers
// 4. API Endpoints: /api/autonomy/emergency-stop (GET & POST)
// ───────────────────────────────────────────────────────────────────

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import {
  setWorkspaceEmergencyStop,
  isWorkspaceEmergencyStopped,
  checkWorkspaceEmergencyStop,
  getWorkspaceEmergencyStopStatus,
  assertOutboundAllowed,
  EmergencyStopBlockedError,
  resetEmergencyStopForTesting,
} from '@/lib/safety/emergency-stop';
import {
  executeSafeSuppression,
  createEscalationTask,
  executeSeparatedSuppressionAndEscalation,
  isEmailSuppressed,
  getEscalationTasks,
  resolveEscalationTask,
  resetSuppressionForTesting,
} from '@/lib/policy/suppression';
import {
  setOrganizationCircuitBreakerThresholds,
  getOrganizationCircuitBreakerThresholds,
  resolveCircuitBreakerThresholds,
  evaluateCircuitBreaker,
  resetCircuitBreakerForTesting,
  DEFAULT_CIRCUIT_BREAKER_THRESHOLDS,
} from '@/lib/safety/circuit-breaker';
import { checkCircuitBreaker } from '@/lib/risk/circuit-breaker';
import { runTrackedProcessor } from '@/lib/queue/worker';
import { evaluateSendReadiness } from '@/lib/deliverability/send-readiness';
import { GET as emergencyStopGET, POST as emergencyStopPOST } from '@/app/api/autonomy/emergency-stop/route';
import { POST as sendRoutePOST } from '@/app/api/leads/[id]/send/route';

let testsPassed = 0;
let testsFailed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    testsPassed++;
  } catch (error: any) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(error);
    testsFailed++;
  }
}

async function runM1TestSuite() {
  console.log('══════════════════════════════════════════════════════════════════');
  console.log('  MILESTONE 1: SAFETY, EMERGENCY STOP, SUPPRESSION & CIRCUIT BREAKERS');
  console.log('══════════════════════════════════════════════════════════════════\n');

  // Reset state before tests
  resetEmergencyStopForTesting();
  resetSuppressionForTesting();
  resetCircuitBreakerForTesting();

  const orgA = `org_safety_a_${Date.now()}`;
  const orgB = `org_safety_b_${Date.now()}`;

  // Seed test organizations in DB for FK constraints
  await db.organization.create({
    data: { id: orgA, name: 'Safety Test Org A', plan: 'pro' },
  }).catch(() => {});
  await db.organization.create({
    data: { id: orgB, name: 'Safety Test Org B', plan: 'pro' },
  }).catch(() => {});

  // ──────────────────────────────────────────────────────────────────
  // 1. R7: SERVER-SIDE EMERGENCY STOP
  // ──────────────────────────────────────────────────────────────────
  console.log('── 1. R7: Server-Side Emergency Stop ───────────────────────────────');

  await test('1.1 Default state: Emergency stop is not active for new workspaces', async () => {
    const isStoppedA = await isWorkspaceEmergencyStopped(orgA);
    const isStoppedB = await checkWorkspaceEmergencyStop(orgB);
    assert.strictEqual(isStoppedA, false);
    assert.strictEqual(isStoppedB, false);

    // assertOutboundAllowed should not throw
    await assertOutboundAllowed(orgA);
  });

  await test('1.2 Engaging Emergency Stop updates state, audit log, and isStopped flag', async () => {
    const status = await setWorkspaceEmergencyStop(
      orgA,
      true,
      'Domain deliverability spike detected',
      'user_admin_123'
    );

    assert.strictEqual(status.isStopped, true);
    assert.strictEqual(status.scope, 'WORKSPACE');
    assert.strictEqual(status.organizationId, orgA);
    assert.strictEqual(status.reason, 'Domain deliverability spike detected');
    assert.ok(status.stoppedAt instanceof Date);

    const isStopped = await isWorkspaceEmergencyStopped(orgA);
    assert.strictEqual(isStopped, true);

    const fetchedStatus = await getWorkspaceEmergencyStopStatus(orgA);
    assert.strictEqual(fetchedStatus.isStopped, true);
    assert.strictEqual(fetchedStatus.reason, 'Domain deliverability spike detected');
  });

  await test('1.3 Outbound assertion throws EmergencyStopBlockedError when active', async () => {
    let thrown = false;
    try {
      await assertOutboundAllowed(orgA);
    } catch (err: any) {
      thrown = true;
      assert.ok(err instanceof EmergencyStopBlockedError);
      assert.strictEqual(err.code, 'EMERGENCY_STOP_ACTIVE');
      assert.strictEqual(err.organizationId, orgA);
      assert.ok(err.message.includes('Outbound side-effects blocked'));
    }
    assert.strictEqual(thrown, true, 'assertOutboundAllowed must throw when stopped');
  });

  await test('1.4 Multi-tenant isolation: Org A stopped does NOT block Org B', async () => {
    const isStoppedA = await isWorkspaceEmergencyStopped(orgA);
    const isStoppedB = await isWorkspaceEmergencyStopped(orgB);

    assert.strictEqual(isStoppedA, true, 'Org A must remain stopped');
    assert.strictEqual(isStoppedB, false, 'Org B must not be stopped');

    // Org B allowed to dispatch outbound
    await assertOutboundAllowed(orgB);
  });

  await test('1.5 Worker queue enforcement: Outbound jobs blocked while inbound continue', async () => {
    const fakeSendEmailJob: any = {
      id: 'job_send_1',
      data: { organizationId: orgA, messageId: 'msg_1' },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    // 'send-email' must be blocked for Org A
    let sendBlocked = false;
    try {
      await runTrackedProcessor('send-email', fakeSendEmailJob);
    } catch (err: any) {
      sendBlocked = true;
      assert.ok(err instanceof EmergencyStopBlockedError);
      assert.strictEqual(err.organizationId, orgA);
    }
    assert.strictEqual(sendBlocked, true, 'send-email queue must be blocked during emergency stop');

    // 'followup' must be blocked for Org A
    let followupBlocked = false;
    try {
      await runTrackedProcessor('followup', fakeSendEmailJob);
    } catch (err: any) {
      followupBlocked = true;
      assert.ok(err instanceof EmergencyStopBlockedError);
    }
    assert.strictEqual(followupBlocked, true, 'followup queue must be blocked during emergency stop');

    // Org B's send-email job should NOT be blocked by Org A's emergency stop
    const fakeSendEmailJobOrgB: any = {
      id: 'job_send_org_b',
      data: { organizationId: orgB, messageId: 'msg_b', to: 'test@example.com', subject: 'Hi', body: 'Test' },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };
    try {
      await runTrackedProcessor('send-email', fakeSendEmailJobOrgB);
    } catch (err: any) {
      assert.notStrictEqual(err.code, 'EMERGENCY_STOP_ACTIVE', 'Org B must not encounter emergency stop');
    }
  });

  await test('1.6 Direct Send API route (/api/leads/[id]/send) blocks outbound with HTTP 423', async () => {
    const request = new NextRequest('http://localhost:3000/api/leads/lead_123/send', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-organization-id': orgA,
        'x-user-id': 'user_test_1',
        'x-role': 'MEMBER',
      },
      body: JSON.stringify({
        subject: 'Test Subject',
        body: 'Test Body',
      }),
    });

    const response = await sendRoutePOST(request, { params: Promise.resolve({ id: 'lead_123' }) });
    assert.strictEqual(response.status, 423, 'Must return 423 Locked when emergency stop is active');

    const body = await response.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'emergency_stop_active');
    assert.ok(body.error.message.includes('Workspace Emergency Stop is active'));
  });

  await test('1.7 Send-readiness evaluation blocks via Gate 1 when emergency stop active', async () => {
    // Create lead and message in orgA so evaluateSendReadiness checks Gate 1
    const testLead = await db.lead.create({
      data: {
        organizationId: orgA,
        name: 'Readiness Test Lead',
        email: 'readiness.test@example.com',
        status: 'new',
      },
    });

    const testMsg = await db.outreachEmail.create({
      data: {
        organizationId: orgA,
        leadId: testLead.id,
        subject: 'Readiness check test',
        body: 'Body text',
        status: 'approved',
      },
    });

    const readiness = await evaluateSendReadiness({
      organizationId: orgA,
      messageId: testMsg.id,
      traceId: 'trace_test_readiness_1',
    });

    assert.strictEqual(readiness.ready, false);
    const gate1 = readiness.checks.find(c => c.id === 'autonomy_paused');
    assert.ok(gate1, 'Gate 1 (autonomy_paused) check must exist');
    assert.strictEqual(gate1.status, 'block');
    assert.ok(gate1.reason.includes('Workspace Emergency Stop is active'));
  });

  await test('1.8 Releasing Emergency Stop resumes outbound dispatch', async () => {
    const released = await setWorkspaceEmergencyStop(
      orgA,
      false,
      'Investigation complete, normal operations resumed',
      'user_admin_123'
    );

    assert.strictEqual(released.isStopped, false);
    assert.strictEqual(await isWorkspaceEmergencyStopped(orgA), false);

    // assertOutboundAllowed should not throw
    await assertOutboundAllowed(orgA);
  });

  await test('1.9 Idempotence: repeated engage/release calls maintain consistent state', async () => {
    await setWorkspaceEmergencyStop(orgA, true, 'Repeat test 1');
    const s1 = await setWorkspaceEmergencyStop(orgA, true, 'Repeat test 2');
    assert.strictEqual(s1.isStopped, true);
    assert.strictEqual(await isWorkspaceEmergencyStopped(orgA), true);

    await setWorkspaceEmergencyStop(orgA, false, 'Release 1');
    const s2 = await setWorkspaceEmergencyStop(orgA, false, 'Release 2');
    assert.strictEqual(s2.isStopped, false);
    assert.strictEqual(await isWorkspaceEmergencyStopped(orgA), false);
  });

  // ──────────────────────────────────────────────────────────────────
  // 2. R9: SAFE SUPPRESSION / ESCALATION SEPARATION
  // ──────────────────────────────────────────────────────────────────
  console.log('\n── 2. R9: Safe Suppression / Escalation Separation ─────────────────');

  await test('2.1 Phase 1: Explicit opt-out immediately suppresses email across workspace', async () => {
    const testEmail = 'prospect.optout@example.com';

    // Create a dummy lead and queued outreach email to verify cancellation
    const lead = await db.lead.create({
      data: {
        organizationId: orgA,
        name: 'Prospect Optout',
        email: testEmail,
        status: 'new',
        doNotContact: false,
        isBlacklisted: false,
      },
    });

    const emailRecord = await db.outreachEmail.create({
      data: {
        organizationId: orgA,
        leadId: lead.id,
        status: 'QUEUED',
        subject: 'Follow up',
        body: 'Are you available?',
      },
    });

    const followup = await db.followUp.create({
      data: {
        organizationId: orgA,
        leadId: lead.id,
        status: 'scheduled',
        scheduledAt: new Date(Date.now() + 86400000),
      },
    });

    const result = await executeSafeSuppression({
      organizationId: orgA,
      email: testEmail,
      leadId: lead.id,
      reason: 'User replied "Please remove me from your list"',
      source: 'reply_triage',
    });

    assert.strictEqual(result.suppressed, true);
    assert.strictEqual(result.dncAdded, true);
    assert.strictEqual(result.leadUpdated, true);
    assert.ok(result.cancelledEmailsCount >= 1);
    assert.ok(result.cancelledFollowUpsCount >= 1);

    // Verify DNC query
    const isSuppressed = await isEmailSuppressed(testEmail, orgA);
    assert.strictEqual(isSuppressed, true, 'Email must be in DNC list');

    // Verify plus-addressing suppression: test+marketing@example.com is also suppressed
    const isPlusSuppressed = await isEmailSuppressed('prospect.optout+promo@example.com', orgA);
    assert.strictEqual(isPlusSuppressed, true, 'Plus-addressed variant must be suppressed');

    // Verify lead status in DB
    const updatedLead = await db.lead.findUnique({ where: { id: lead.id } });
    assert.strictEqual(updatedLead.status, 'unsubscribed');
    assert.strictEqual(updatedLead.doNotContact, true);
    assert.strictEqual(updatedLead.isBlacklisted, true);

    // Verify outreach email status is cancelled
    const updatedEmail = await db.outreachEmail.findUnique({ where: { id: emailRecord.id } });
    assert.strictEqual(updatedEmail.status, 'cancelled');

    // Verify followup status is cancelled
    const updatedFollowup = await db.followUp.findUnique({ where: { id: followup.id } });
    assert.strictEqual(updatedFollowup.status, 'cancelled');
  });

  await test('2.2 Phase 1 Idempotency: Repeating suppression produces identical result without duplicate error', async () => {
    const email = 'duplicate.test@example.com';
    const first = await executeSafeSuppression({ organizationId: orgA, email, reason: 'Stop' });
    const second = await executeSafeSuppression({ organizationId: orgA, email, reason: 'Stop again' });

    assert.strictEqual(first.suppressed, true);
    assert.strictEqual(second.suppressed, true);
    assert.strictEqual(await isEmailSuppressed(email, orgA), true);
  });

  await test('2.3 Phase 2: Durable EscalationTask persistence and resolution workflow', async () => {
    const task = await createEscalationTask({
      organizationId: orgA,
      leadId: 'lead_gdpr_1',
      type: 'PRIVACY_GDPR',
      severity: 'CRITICAL',
      title: 'GDPR Article 17 Right to Erasure Request',
      description: 'Prospect explicitly demanded full data erasure under GDPR Article 17.',
      payload: { article: 17, demandedAt: new Date().toISOString() },
    });

    assert.ok(task.id);
    assert.strictEqual(task.organizationId, orgA);
    assert.strictEqual(task.type, 'PRIVACY_GDPR');
    assert.strictEqual(task.severity, 'CRITICAL');
    assert.strictEqual(task.status, 'OPEN');

    // Retrieve tasks
    const tasks = await getEscalationTasks(orgA, { type: 'PRIVACY_GDPR' });
    assert.ok(tasks.length >= 1);
    const found = tasks.find(t => t.id === task.id);
    assert.ok(found);

    // Resolve task
    const resolved = await resolveEscalationTask(task.id, {
      notes: 'All personal data scrubbed in compliance with GDPR Article 17.',
      resolvedBy: 'dpo@acmesaas.com',
    });
    assert.strictEqual(resolved.status, 'RESOLVED');
    assert.strictEqual(resolved.resolutionNotes, 'All personal data scrubbed in compliance with GDPR Article 17.');
    assert.ok(resolved.resolvedAt instanceof Date);
  });

  await test('2.4 Decoupled Failure Boundary: Downstream escalation failure NEVER causes suppression to be lost', async () => {
    const targetEmail = 'gdpr.failure.isolated@example.com';

    // Simulate downstream escalation crash / database deadlock
    const coordinatedResult = await executeSeparatedSuppressionAndEscalation({
      suppression: {
        organizationId: orgA,
        email: targetEmail,
        reason: 'GDPR demand accompanied by systemic escalation service crash',
      },
      escalation: {
        organizationId: orgA,
        type: 'PRIVACY_GDPR',
        title: 'Crash Task',
        description: 'This task is doomed to fail',
      },
      simulateEscalationFailure: true,
    });

    // 1. Suppression MUST be 100% successful
    assert.strictEqual(coordinatedResult.suppressed, true, 'Suppression must succeed despite escalation failure');
    assert.strictEqual(coordinatedResult.dncAdded, true);

    // 2. Email MUST be in DNC list
    const isSuppressed = await isEmailSuppressed(targetEmail, orgA);
    assert.strictEqual(isSuppressed, true, 'Target email must be durably suppressed in DNC');

    // 3. Escalation failure captured cleanly without throwing
    assert.strictEqual(coordinatedResult.escalated, false);
    assert.ok(coordinatedResult.escalationError);
    assert.ok(coordinatedResult.escalationError.includes('simulated failure'));
  });

  // ──────────────────────────────────────────────────────────────────
  // 3. R3: SAFE PROVIDER SEMANTICS & CUSTOMER CIRCUIT BREAKERS
  // ──────────────────────────────────────────────────────────────────
  console.log('\n── 3. R3: Honest Semantics & Customer-Configurable Circuit Breakers ─');

  await test('3.1 Semantic Integrity: No "exact-once" claims in src/lib/ or src/app/', async () => {
    const srcLibDir = path.resolve(process.cwd(), 'src/lib');
    const srcAppDir = path.resolve(process.cwd(), 'src/app');

    function scanFiles(dir: string): string[] {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          results = results.concat(scanFiles(fullPath));
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const allFiles = [...scanFiles(srcLibDir), ...scanFiles(srcAppDir)];
    const forbiddenPattern = /exact-once/i;
    const violations: { file: string; line: number; text: string }[] = [];

    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (forbiddenPattern.test(line)) {
          violations.push({ file: path.relative(process.cwd(), file), line: idx + 1, text: line.trim() });
        }
      });
    }

    assert.strictEqual(
      violations.length,
      0,
      `Found forbidden "exact-once" claims in source files:\n${violations.map(v => `${v.file}:${v.line} -> ${v.text}`).join('\n')}`
    );
  });

  await test('3.2 Circuit breaker default thresholds match specifications (3% bounce, 0.1% complaint, 2% unsub)', async () => {
    const resolved = await resolveCircuitBreakerThresholds(orgA);
    assert.strictEqual(resolved.source, 'default');
    assert.strictEqual(resolved.thresholds.bounceRateThreshold, 0.03);
    assert.strictEqual(resolved.thresholds.complaintRateThreshold, 0.001);
    assert.strictEqual(resolved.thresholds.unsubscribeRateThreshold, 0.02);
  });

  await test('3.3 Customer-configurable organization threshold overrides platform defaults', async () => {
    // Customer sets strict enterprise bounce threshold: 1.5% (0.015)
    await setOrganizationCircuitBreakerThresholds(orgA, {
      bounceRateThreshold: 0.015,
      complaintRateThreshold: 0.0008,
    });

    const orgConfig = await getOrganizationCircuitBreakerThresholds(orgA);
    assert.strictEqual(orgConfig?.bounceRateThreshold, 0.015);
    assert.strictEqual(orgConfig?.complaintRateThreshold, 0.0008);

    const resolved = await resolveCircuitBreakerThresholds(orgA);
    assert.strictEqual(resolved.source, 'organization');
    assert.strictEqual(resolved.thresholds.bounceRateThreshold, 0.015);
    assert.strictEqual(resolved.thresholds.complaintRateThreshold, 0.0008);
    // Unchanged thresholds fall back to default
    assert.strictEqual(resolved.thresholds.unsubscribeRateThreshold, 0.02);
  });

  await test('3.4 Circuit breaker evaluation trips on 2.0% bounce rate under customer threshold (1.5%) but passes default (3.0%)', async () => {
    // Org A has 0.015 threshold. Metrics: 2% bounce rate (0.020)
    const resultOrgA = await evaluateCircuitBreaker({
      organizationId: orgA,
      metricsOverride: { bounceRate: 0.02, complaintRate: 0.0001, unsubscribeRate: 0.005 },
    });

    assert.strictEqual(resultOrgA.triggered, true, 'Must trigger under custom 1.5% threshold');
    assert.strictEqual(resultOrgA.status, 'block');
    assert.strictEqual(resultOrgA.details.bounceExceeded, true);
    assert.ok(resultOrgA.reason?.includes('organization thresholds'));

    // Org B has default 0.030 threshold. Same 2% bounce rate must PASS
    const resultOrgB = await evaluateCircuitBreaker({
      organizationId: orgB,
      metricsOverride: { bounceRate: 0.02, complaintRate: 0.0001, unsubscribeRate: 0.005 },
    });

    assert.strictEqual(resultOrgB.triggered, false, 'Must pass under default 3.0% threshold');
    assert.strictEqual(resultOrgB.details.bounceExceeded, false);
  });

  await test('3.5 checkCircuitBreaker from risk module seamlessly integrates organization threshold', async () => {
    // Create sending domain in DB
    const domainRecord = await db.sendingDomain.create({
      data: {
        organizationId: orgA,
        domain: `outreach-${Date.now()}.io`,
        status: 'verified',
        reputationScore: 90,
      },
    });

    // Create 100 sent events and 2 bounced events = 2.0% bounce rate
    const events: any[] = [];
    for (let i = 0; i < 98; i++) {
      events.push({ organizationId: orgA, domainId: domainRecord.id, eventType: 'sent' });
    }
    events.push({ organizationId: orgA, domainId: domainRecord.id, eventType: 'bounced' });
    events.push({ organizationId: orgA, domainId: domainRecord.id, eventType: 'bounced' });

    await db.emailEvent.createMany({ data: events });

    const status = await checkCircuitBreaker({
      domainId: domainRecord.id,
      organizationId: orgA,
    });

    // Since Org A has threshold 1.5% (0.015), 2.0% must trigger block!
    assert.strictEqual(status.triggered, true);
    assert.strictEqual(status.status, 'block');
    assert.strictEqual(status.details.bounceExceeded, true);
    assert.strictEqual(status.thresholds.bounceRate, 0.015);
  });

  // ──────────────────────────────────────────────────────────────────
  // 4. EMERGENCY STOP API ROUTE (/api/autonomy/emergency-stop)
  // ──────────────────────────────────────────────────────────────────
  console.log('\n── 4. API Endpoints: /api/autonomy/emergency-stop ──────────────────');

  await test('4.1 GET /api/autonomy/emergency-stop returns current status', async () => {
    const req = new NextRequest('http://localhost:3000/api/autonomy/emergency-stop', {
      method: 'GET',
      headers: {
        'x-organization-id': orgB,
        'x-user-id': 'user_b',
        'x-role': 'MEMBER',
      },
    });

    const res = await emergencyStopGET(req);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.isStopped, false);
    assert.strictEqual(body.data.organizationId, orgB);
  });

  await test('4.2 POST /api/autonomy/emergency-stop engages stop via API', async () => {
    const req = new NextRequest('http://localhost:3000/api/autonomy/emergency-stop', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-organization-id': orgB,
        'x-user-id': 'user_b',
        'x-role': 'ADMIN',
      },
      body: JSON.stringify({
        stopped: true,
        reason: 'Emergency stop initiated by Security Admin via API',
      }),
    });

    const res = await emergencyStopPOST(req);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.isStopped, true);
    assert.strictEqual(body.data.emergencyStop.reason, 'Emergency stop initiated by Security Admin via API');

    // Confirm server-side state is engaged
    assert.strictEqual(await isWorkspaceEmergencyStopped(orgB), true);
  });

  await test('4.3 POST /api/autonomy/emergency-stop releases stop via API', async () => {
    const req = new NextRequest('http://localhost:3000/api/autonomy/emergency-stop', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-organization-id': orgB,
        'x-user-id': 'user_b',
        'x-role': 'ADMIN',
      },
      body: JSON.stringify({
        action: 'release',
        reason: 'All clear confirmed',
      }),
    });

    const res = await emergencyStopPOST(req);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.isStopped, false);

    // Confirm server-side state is released
    assert.strictEqual(await isWorkspaceEmergencyStopped(orgB), false);
  });

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(`  M1 TEST SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('══════════════════════════════════════════════════════════════════\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runM1TestSuite().catch(err => {
  console.error('Fatal M1 test runner error:', err);
  process.exit(1);
});
