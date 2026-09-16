// ─── EMPIRICAL CHALLENGER TEST SUITE: MILESTONE 1 (R9 & R3) ──────────────
// Empirical Stress Testing:
// 1. Safe Suppression / Escalation Separation (R9):
//    - Fault-injection during Phase 2 (DB exceptions, network timeouts, unhandled input errors)
//    - Empirical proof that Phase 1 immediate DNC suppression is NEVER rolled back or delayed
//    - Concurrency and race condition stress tests
//    - Pre-send gate verification on suppressed leads
//    - Deep dive on Phase 2 database error swallowing
// 2. Customer-Configurable Circuit Breakers (R3):
//    - Custom low thresholds (e.g. 0.01 bounce rate) vs organization default (0.03)
//    - Spam complaint and unsubscribe rate thresholds
//    - Multi-tenant threshold isolation
//    - Empirical proof of Campaign Schema Default Shadowing defect
// ──────────────────────────────────────────────────────────────────────────

import assert from 'assert';
import { db } from '@/lib/db';
import {
  executeSafeSuppression,
  createEscalationTask,
  executeSeparatedSuppressionAndEscalation,
  isEmailSuppressed,
  getEscalationTasks,
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
import { evaluateSendReadiness } from '@/lib/deliverability/send-readiness';

let testsPassed = 0;
let testsFailed = 0;
const failureDetails: { name: string; error: any }[] = [];

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    testsPassed++;
  } catch (error: any) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(error);
    testsFailed++;
    failureDetails.push({ name, error });
  }
}

export async function runChallengerTestSuite() {
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('  CHALLENGER EMPIRICAL SUITE: SAFE SUPPRESSION (R9) & CIRCUIT BREAKERS (R3)');
  console.log('══════════════════════════════════════════════════════════════════════\n');

  resetSuppressionForTesting();
  resetCircuitBreakerForTesting();

  const orgEmpiricalA = `org_empirical_a_${Date.now()}`;
  const orgEmpiricalB = `org_empirical_b_${Date.now()}`;
  const orgEmpiricalC = `org_empirical_c_${Date.now()}`;

  // Seed test organizations in DB
  await db.organization.create({
    data: { id: orgEmpiricalA, name: 'Empirical Challenger Org A', plan: 'enterprise' },
  }).catch(() => {});
  await db.organization.create({
    data: { id: orgEmpiricalB, name: 'Empirical Challenger Org B', plan: 'growth' },
  }).catch(() => {});
  await db.organization.create({
    data: { id: orgEmpiricalC, name: 'Empirical Challenger Org C', plan: 'standard' },
  }).catch(() => {});

  // ──────────────────────────────────────────────────────────────────
  // 1. FAULT INJECTION & PROOF OF NON-ROLLBACK FOR SAFE SUPPRESSION (R9)
  // ──────────────────────────────────────────────────────────────────
  console.log('── 1. R9: Safe Suppression / Escalation Separation & Non-Rollback ───');

  await test('1.1 Fault Injection: Simulated network timeout/queue deadlock in Phase 2 never rolls back Phase 1', async () => {
    const email = 'prospect.timeout@enterprise-target.com';

    // Seed lead with active outbound entities
    const lead = await db.lead.create({
      data: {
        organizationId: orgEmpiricalA,
        name: 'Timeout Target Lead',
        email,
        status: 'new',
        doNotContact: false,
        isBlacklisted: false,
      },
    });

    const msg1 = await db.outreachEmail.create({
      data: {
        organizationId: orgEmpiricalA,
        leadId: lead.id,
        status: 'QUEUED',
        subject: 'Q3 Partnership',
        body: 'Outreach body 1',
      },
    });
    const msg2 = await db.outreachEmail.create({
      data: {
        organizationId: orgEmpiricalA,
        leadId: lead.id,
        status: 'approved',
        subject: 'Q3 Follow-up',
        body: 'Outreach body 2',
      },
    });
    const followup1 = await db.followUp.create({
      data: {
        organizationId: orgEmpiricalA,
        leadId: lead.id,
        status: 'scheduled',
        scheduledAt: new Date(Date.now() + 86400000),
      },
    });

    // Execute with Phase 2 failure injection
    const result = await executeSeparatedSuppressionAndEscalation({
      suppression: {
        organizationId: orgEmpiricalA,
        email,
        leadId: lead.id,
        reason: 'GDPR Opt-out with systemic network timeout',
        source: 'reply_triage',
      },
      escalation: {
        organizationId: orgEmpiricalA,
        type: 'PRIVACY_GDPR',
        title: 'GDPR Article 17 Erasure',
        description: 'Prospect demanded immediate erasure',
      },
      simulateEscalationFailure: true,
    });

    // Phase 2 assertions
    assert.strictEqual(result.escalated, false, 'Escalation must be recorded as failed');
    assert.ok(result.escalationError, 'Escalation error message must be captured');
    assert.ok(result.escalationError.includes('simulated failure'), 'Error must reflect simulated failure');

    // Phase 1 assertions: PROOF OF NON-ROLLBACK
    assert.strictEqual(result.suppressed, true, 'Suppression MUST be true');
    assert.strictEqual(result.dncAdded, true, 'DNC entry MUST be added');
    assert.strictEqual(result.leadUpdated, true, 'Lead record MUST be updated');
    assert.strictEqual(result.cancelledEmailsCount, 2, 'Both outreach emails must be cancelled');
    assert.strictEqual(result.cancelledFollowUpsCount, 1, 'Followup must be cancelled');

    // Durability proof via direct DB queries:
    const dncEntry = await db.doNotContact.findFirst({
      where: { email, organizationId: orgEmpiricalA },
    });
    assert.ok(dncEntry, 'DNC record MUST exist in database');

    const dbLead = await db.lead.findUnique({ where: { id: lead.id } });
    assert.strictEqual(dbLead.status, 'unsubscribed', 'Lead status in DB must be unsubscribed');
    assert.strictEqual(dbLead.doNotContact, true, 'Lead doNotContact in DB must be true');
    assert.strictEqual(dbLead.isBlacklisted, true, 'Lead isBlacklisted in DB must be true');

    const dbMsg1 = await db.outreachEmail.findUnique({ where: { id: msg1.id } });
    const dbMsg2 = await db.outreachEmail.findUnique({ where: { id: msg2.id } });
    assert.strictEqual(dbMsg1.status, 'cancelled', 'Message 1 must be cancelled in DB');
    assert.strictEqual(dbMsg2.status, 'cancelled', 'Message 2 must be cancelled in DB');

    const dbFollowup1 = await db.followUp.findUnique({ where: { id: followup1.id } });
    assert.strictEqual(dbFollowup1.status, 'cancelled', 'Followup 1 must be cancelled in DB');

    // Memory query check
    assert.strictEqual(await isEmailSuppressed(email, orgEmpiricalA), true, 'isEmailSuppressed must return true');
  });

  await test('1.2 Fault Injection: Unhandled validation error (empty title) in Phase 2 does not roll back Phase 1', async () => {
    const email = 'prospect.badinput@domain.com';

    const lead = await db.lead.create({
      data: {
        organizationId: orgEmpiricalA,
        name: 'Bad Input Lead',
        email,
        status: 'new',
        doNotContact: false,
        isBlacklisted: false,
      },
    });

    const msg = await db.outreachEmail.create({
      data: {
        organizationId: orgEmpiricalA,
        leadId: lead.id,
        status: 'QUEUED',
        subject: 'Test Subject',
        body: 'Body',
      },
    });

    // Pass invalid escalation payload (empty title)
    const result = await executeSeparatedSuppressionAndEscalation({
      suppression: {
        organizationId: orgEmpiricalA,
        email,
        leadId: lead.id,
        reason: 'Unsubscribe request',
      },
      escalation: {
        organizationId: orgEmpiricalA,
        type: 'LEGAL_THREAT',
        title: '', // Invalid! Must trigger validation error
        description: 'Threatened legal action',
      },
    });

    // Phase 2 should fail validation
    assert.strictEqual(result.escalated, false);
    assert.ok(result.escalationError?.includes('title is required'));

    // Phase 1 must remain intact
    assert.strictEqual(result.suppressed, true);
    assert.strictEqual(await isEmailSuppressed(email, orgEmpiricalA), true);

    const dbMsg = await db.outreachEmail.findUnique({ where: { id: msg.id } });
    assert.strictEqual(dbMsg.status, 'cancelled');

    const dbLead = await db.lead.findUnique({ where: { id: lead.id } });
    assert.strictEqual(dbLead.doNotContact, true);
  });

  await test('1.3 Fault Injection: Missing organizationId in Phase 2 escalation does not roll back Phase 1', async () => {
    const email = 'prospect.missingorg@domain.com';

    const lead = await db.lead.create({
      data: {
        organizationId: orgEmpiricalA,
        name: 'Missing Org Lead',
        email,
        status: 'new',
        doNotContact: false,
        isBlacklisted: false,
      },
    });

    const result = await executeSeparatedSuppressionAndEscalation({
      suppression: {
        organizationId: orgEmpiricalA,
        email,
        leadId: lead.id,
        reason: 'Unsubscribe',
      },
      escalation: {
        organizationId: '', // Invalid! Missing org ID
        type: 'SECURITY_WARNING',
        title: 'Security Alert',
        description: 'Phishing claim',
      },
    });

    assert.strictEqual(result.escalated, false);
    assert.ok(result.escalationError?.includes('organizationId is required'));
    assert.strictEqual(result.suppressed, true);
    assert.strictEqual(await isEmailSuppressed(email, orgEmpiricalA), true);
  });

  await test('1.4 Fault Injection: Plus-addressing suppression holds even under Phase 2 escalation failure', async () => {
    const baseEmail = 'vip.client@fintech.com';
    const plusEmail = 'vip.client+promo-deals@fintech.com';

    const lead = await db.lead.create({
      data: {
        organizationId: orgEmpiricalA,
        name: 'VIP Client',
        email: baseEmail,
        status: 'new',
        doNotContact: false,
        isBlacklisted: false,
      },
    });

    const result = await executeSeparatedSuppressionAndEscalation({
      suppression: {
        organizationId: orgEmpiricalA,
        email: plusEmail,
        leadId: lead.id,
        reason: 'Do not email plus address or base address',
      },
      escalation: {
        organizationId: orgEmpiricalA,
        type: 'VIP_ESCALATION',
        title: 'VIP Opt-out',
        description: 'Key account opt-out',
      },
      simulateEscalationFailure: true,
    });

    assert.strictEqual(result.escalated, false);
    assert.strictEqual(result.suppressed, true);

    // Both plus and base email MUST be suppressed
    assert.strictEqual(await isEmailSuppressed(plusEmail, orgEmpiricalA), true);
    assert.strictEqual(await isEmailSuppressed(baseEmail, orgEmpiricalA), true);
  });

  await test('1.5 Concurrency Stress: 10 concurrent opt-outs with Phase 2 failure do not deadlock or drop suppression', async () => {
    const email = 'concurrent.optout@scale-test.com';

    const lead = await db.lead.create({
      data: {
        organizationId: orgEmpiricalA,
        name: 'Concurrent Lead',
        email,
        status: 'new',
        doNotContact: false,
        isBlacklisted: false,
      },
    });

    // Launch 10 simultaneous requests
    const promises = Array.from({ length: 10 }).map((_, idx) =>
      executeSeparatedSuppressionAndEscalation({
        suppression: {
          organizationId: orgEmpiricalA,
          email,
          leadId: lead.id,
          reason: `Concurrent opt-out request ${idx + 1}`,
        },
        escalation: {
          organizationId: orgEmpiricalA,
          type: 'PRIVACY_GDPR',
          title: `Concurrent task ${idx + 1}`,
          description: 'Testing race conditions under failure',
        },
        simulateEscalationFailure: true,
      })
    );

    const results = await Promise.all(promises);

    // All 10 must report suppressed = true
    for (const res of results) {
      assert.strictEqual(res.suppressed, true, 'Every concurrent request must succeed in suppression');
      assert.strictEqual(res.escalated, false, 'Every concurrent request escalation must fail');
    }

    // Lead must still be suppressed
    assert.strictEqual(await isEmailSuppressed(email, orgEmpiricalA), true);
    const dbLead = await db.lead.findUnique({ where: { id: lead.id } });
    assert.strictEqual(dbLead.doNotContact, true);
    assert.strictEqual(dbLead.status, 'unsubscribed');
  });

  await test('1.6 Pre-Send Gate Proof: Suppressed lead is immediately blocked from outbound dispatch by evaluateSendReadiness', async () => {
    const email = 'gate.blocked@outbound-safety.com';

    const lead = await db.lead.create({
      data: {
        organizationId: orgEmpiricalA,
        name: 'Gate Blocked Lead',
        email,
        status: 'new',
      },
    });

    const msg = await db.outreachEmail.create({
      data: {
        organizationId: orgEmpiricalA,
        leadId: lead.id,
        status: 'approved',
        subject: 'Trying to sneak through',
        body: 'Outbound body',
      },
    });

    // Suppress lead with Phase 2 failure
    await executeSeparatedSuppressionAndEscalation({
      suppression: {
        organizationId: orgEmpiricalA,
        email,
        leadId: lead.id,
        reason: 'Stop all messages',
      },
      escalation: {
        organizationId: orgEmpiricalA,
        type: 'PRIVACY_GDPR',
        title: 'Erasure Task',
        description: 'Failed escalation',
      },
      simulateEscalationFailure: true,
    });

    // Now evaluate send readiness for the message
    const readiness = await evaluateSendReadiness({
      organizationId: orgEmpiricalA,
      messageId: msg.id,
      traceId: 'trace_empirical_gate_check',
    });

    assert.strictEqual(readiness.ready, false, 'Message MUST NOT be ready to send');
    
    // Check that DNC / Blacklist / Unsubscribed gates are triggered
    const dncCheck = readiness.checks.find(c => c.id === 'lead_not_dnc');
    const blacklistCheck = readiness.checks.find(c => c.id === 'lead_not_blacklisted');
    const unsubCheck = readiness.checks.find(c => c.id === 'lead_not_unsubscribed');

    assert.ok(dncCheck || blacklistCheck || unsubCheck, 'At least one deliverability gate must block');
    if (dncCheck) assert.strictEqual(dncCheck.status, 'block');
    if (blacklistCheck) assert.strictEqual(blacklistCheck.status, 'block');
    if (unsubCheck) assert.strictEqual(unsubCheck.status, 'block');
  });

  await test('1.7 Empirical Investigation: Phase 2 DB error handling analysis in createEscalationTask', async () => {
    const email = 'db.failure.audit@compliance-audit.org';

    // In this scenario, we test what happens when db.escalationTask.create encounters a DB exception
    // We verify:
    // 1. Phase 1 DNC suppression remains 100% intact (NON-ROLLBACK holds)
    // 2. We observe that createEscalationTask internally catches db.escalationTask.create errors
    //    and caches in memory, returning escalated: true unless simulateEscalationFailure is used.
    
    const originalCreate = db.escalationTask.create;
    let dbCreateAttempted = false;
    db.escalationTask.create = async () => {
      dbCreateAttempted = true;
      throw new Error('PRISMA_DB_FATAL: Connection to PostgreSQL replica timed out after 5000ms');
    };

    try {
      const result = await executeSeparatedSuppressionAndEscalation({
        suppression: {
          organizationId: orgEmpiricalA,
          email,
          reason: 'Legal threat with DB failure',
        },
        escalation: {
          organizationId: orgEmpiricalA,
          type: 'LEGAL_THREAT',
          title: 'Cease and Desist Notice',
          description: 'Demanded halt of all outreach',
        },
      });

      // 1. Phase 1 non-rollback is GUARANTEED:
      assert.strictEqual(result.suppressed, true, 'Phase 1 suppression must NEVER fail');
      assert.strictEqual(await isEmailSuppressed(email, orgEmpiricalA), true, 'Email must be in DNC');

      // 2. DB failure propagates to executeSeparatedSuppressionAndEscalation:
      assert.strictEqual(dbCreateAttempted, true, 'db.escalationTask.create was called');
      assert.strictEqual(result.escalated, false, 'Escalation must be reported as false when DB persistence fails');
      assert.ok(result.escalationError, 'escalationError must capture the DB failure');
      assert.ok(result.escalationError.includes('PRISMA_DB_FATAL'), 'escalationError must contain original DB exception');
    } finally {
      db.escalationTask.create = originalCreate;
    }
  });

  // ──────────────────────────────────────────────────────────────────
  // 2. CUSTOMER-CONFIGURABLE CIRCUIT BREAKERS & TRIP SEMANTICS (R3)
  // ──────────────────────────────────────────────────────────────────
  console.log('\n── 2. R3: Customer-Configurable Circuit Breakers & Trip Semantics ──');

  await test('2.1 Default Thresholds: Matches industry standard platform baseline', async () => {
    const resolved = await resolveCircuitBreakerThresholds(orgEmpiricalB);
    assert.strictEqual(resolved.source, 'default');
    assert.strictEqual(resolved.thresholds.bounceRateThreshold, 0.03, 'Default bounce rate is 3%');
    assert.strictEqual(resolved.thresholds.complaintRateThreshold, 0.001, 'Default complaint rate is 0.1%');
    assert.strictEqual(resolved.thresholds.unsubscribeRateThreshold, 0.02, 'Default unsubscribe rate is 2%');
  });

  await test('2.2 Custom Configuration: Organization configures strict low thresholds (1.0% bounce rate)', async () => {
    // Org A configures strict enterprise parameters:
    // 0.01 bounce rate (1%), 0.0005 complaint rate (0.05%), 0.01 unsubscribe rate (1%)
    const configured = await setOrganizationCircuitBreakerThresholds(orgEmpiricalA, {
      bounceRateThreshold: 0.01,
      complaintRateThreshold: 0.0005,
      unsubscribeRateThreshold: 0.01,
    });

    assert.strictEqual(configured.bounceRateThreshold, 0.01);
    assert.strictEqual(configured.complaintRateThreshold, 0.0005);
    assert.strictEqual(configured.unsubscribeRateThreshold, 0.01);

    const resolved = await resolveCircuitBreakerThresholds(orgEmpiricalA);
    assert.strictEqual(resolved.source, 'organization');
    assert.strictEqual(resolved.thresholds.bounceRateThreshold, 0.01);
    assert.strictEqual(resolved.thresholds.complaintRateThreshold, 0.0005);
    assert.strictEqual(resolved.thresholds.unsubscribeRateThreshold, 0.01);
  });

  await test('2.3 Empirical Trip Comparison: Bounce Rate = 0.012 (1.2%)', async () => {
    // At 1.2% bounce rate:
    // - Org A (threshold 0.01): MUST BLOCK (1.2% >= 1.0%)
    // - Org B (default 0.03): MUST PASS (1.2% < 3.0% and < 2.25% warning threshold)

    const evalOrgA = await evaluateCircuitBreaker({
      organizationId: orgEmpiricalA,
      metricsOverride: { bounceRate: 0.012, complaintRate: 0.0001, unsubscribeRate: 0.002 },
    });
    assert.strictEqual(evalOrgA.triggered, true, 'Org A with 0.01 threshold must trigger');
    assert.strictEqual(evalOrgA.status, 'block');
    assert.strictEqual(evalOrgA.details.bounceExceeded, true);
    assert.strictEqual(evalOrgA.source, 'organization');
    assert.ok(evalOrgA.reason?.includes('1.20% exceeds threshold 1.00%'));

    const evalOrgB = await evaluateCircuitBreaker({
      organizationId: orgEmpiricalB,
      metricsOverride: { bounceRate: 0.012, complaintRate: 0.0001, unsubscribeRate: 0.002 },
    });
    assert.strictEqual(evalOrgB.triggered, false, 'Org B with 0.03 default must pass');
    assert.strictEqual(evalOrgB.status, 'pass');
    assert.strictEqual(evalOrgB.details.bounceExceeded, false);
    assert.strictEqual(evalOrgB.source, 'default');
  });

  await test('2.4 Empirical Trip Comparison: Boundary values (0.009, 0.010, 0.030)', async () => {
    // Test 0.009 (0.9%): Org A is in warning band (0.9% >= 0.75%), Org B passes cleanly
    const eval009A = await evaluateCircuitBreaker({
      organizationId: orgEmpiricalA,
      metricsOverride: { bounceRate: 0.009, complaintRate: 0, unsubscribeRate: 0 },
    });
    assert.strictEqual(eval009A.triggered, false);
    assert.strictEqual(eval009A.status, 'warn', '0.9% must trigger warning on 1% threshold');

    const eval009B = await evaluateCircuitBreaker({
      organizationId: orgEmpiricalB,
      metricsOverride: { bounceRate: 0.009, complaintRate: 0, unsubscribeRate: 0 },
    });
    assert.strictEqual(eval009B.triggered, false);
    assert.strictEqual(eval009B.status, 'pass', '0.9% must be clean pass on 3% default');

    // Test exact boundary: 0.010 (1.0%): Org A blocks, Org B passes
    const eval010A = await evaluateCircuitBreaker({
      organizationId: orgEmpiricalA,
      metricsOverride: { bounceRate: 0.010, complaintRate: 0, unsubscribeRate: 0 },
    });
    assert.strictEqual(eval010A.triggered, true, 'Exact threshold must block');
    assert.strictEqual(eval010A.status, 'block');

    const eval010B = await evaluateCircuitBreaker({
      organizationId: orgEmpiricalB,
      metricsOverride: { bounceRate: 0.010, complaintRate: 0, unsubscribeRate: 0 },
    });
    assert.strictEqual(eval010B.triggered, false);
    assert.strictEqual(eval010B.status, 'pass');

    // Test exact default boundary: 0.030 (3.0%): Both block
    const eval030B = await evaluateCircuitBreaker({
      organizationId: orgEmpiricalB,
      metricsOverride: { bounceRate: 0.030, complaintRate: 0, unsubscribeRate: 0 },
    });
    assert.strictEqual(eval030B.triggered, true);
    assert.strictEqual(eval030B.status, 'block');
  });

  await test('2.5 Spam Complaint Threshold: 0.0007 trips Org A (0.0005) but passes Org B (0.001)', async () => {
    // Complaint rate = 0.07% (0.0007)
    const evalOrgA = await evaluateCircuitBreaker({
      organizationId: orgEmpiricalA,
      metricsOverride: { bounceRate: 0.002, complaintRate: 0.0007, unsubscribeRate: 0.001 },
    });
    assert.strictEqual(evalOrgA.triggered, true, 'Complaint rate 0.07% must trip 0.05% threshold');
    assert.strictEqual(evalOrgA.status, 'block');
    assert.strictEqual(evalOrgA.details.complaintExceeded, true);

    const evalOrgB = await evaluateCircuitBreaker({
      organizationId: orgEmpiricalB,
      metricsOverride: { bounceRate: 0.002, complaintRate: 0.0007, unsubscribeRate: 0.001 },
    });
    assert.strictEqual(evalOrgB.triggered, false, 'Complaint rate 0.07% must pass 0.1% default');
    assert.strictEqual(evalOrgB.details.complaintExceeded, false);
  });

  await test('2.6 Multi-Tenant Isolation: 3 different workspaces evaluate independently without crosstalk', async () => {
    // Org A: 0.01 threshold
    // Org B: default 0.03 threshold
    // Org C: 0.02 threshold
    await setOrganizationCircuitBreakerThresholds(orgEmpiricalC, {
      bounceRateThreshold: 0.02,
    });

    const testRate = 0.016; // 1.6% bounce rate

    const resA = await evaluateCircuitBreaker({
      organizationId: orgEmpiricalA,
      metricsOverride: { bounceRate: testRate, complaintRate: 0, unsubscribeRate: 0 },
    });
    const resB = await evaluateCircuitBreaker({
      organizationId: orgEmpiricalB,
      metricsOverride: { bounceRate: testRate, complaintRate: 0, unsubscribeRate: 0 },
    });
    const resC = await evaluateCircuitBreaker({
      organizationId: orgEmpiricalC,
      metricsOverride: { bounceRate: testRate, complaintRate: 0, unsubscribeRate: 0 },
    });

    assert.strictEqual(resA.triggered, true, 'Org A (1.0%) must trip at 1.6%');
    assert.strictEqual(resB.triggered, false, 'Org B (3.0%) must not trip at 1.6%');
    assert.strictEqual(resC.triggered, false, 'Org C (2.0%) must not trip at 1.6%');
  });

  await test('2.7 checkCircuitBreaker at Domain Level: Trips on 2.0% bounce rate under Org A (1.0%) threshold', async () => {
    // Create domain for Org A
    const domain = await db.sendingDomain.create({
      data: {
        organizationId: orgEmpiricalA,
        domain: `domain-level-${Date.now()}.com`,
        status: 'verified',
        reputationScore: 95,
      },
    });

    // Create 100 email events: 98 sent, 2 bounced = 2.0% bounce rate
    const events: any[] = [];
    for (let i = 0; i < 98; i++) {
      events.push({ organizationId: orgEmpiricalA, domainId: domain.id, eventType: 'sent' });
    }
    events.push({ organizationId: orgEmpiricalA, domainId: domain.id, eventType: 'bounced' });
    events.push({ organizationId: orgEmpiricalA, domainId: domain.id, eventType: 'bounced' });

    await db.emailEvent.createMany({ data: events });

    // Call checkCircuitBreaker at domain level
    const status = await checkCircuitBreaker({
      domainId: domain.id,
      organizationId: orgEmpiricalA,
    });

    assert.strictEqual(status.triggered, true, 'Must trip at domain level');
    assert.strictEqual(status.status, 'block');
    assert.strictEqual(status.details.bounceExceeded, true);
    assert.strictEqual(status.thresholds.bounceRate, 0.01, 'Threshold must be Org A 0.01');
  });

  await test('2.8 VERIFIED REMEDIATION: Uncustomized Campaigns Inherit Organization Thresholds (R3)', async () => {
    // A campaign created without custom overrides must inherit the organization's custom thresholds
    // rather than having platform schema defaults shadow organization policy.

    const campaign = await db.campaign.create({
      data: {
        organizationId: orgEmpiricalA,
        name: 'Standard Pilot Campaign',
        status: 'active',
        // Note: No threshold overrides provided by the user!
      },
    });

    const resolved = await resolveCircuitBreakerThresholds(orgEmpiricalA, campaign.id);

    console.log(`    [Remediation Verified] Campaign resolve source: '${resolved.source}', bounce threshold: ${resolved.thresholds.bounceRateThreshold}`);
    console.log(`    [Remediation Verified] Organization A configured threshold: 0.01`);

    assert.strictEqual(
      resolved.source,
      'organization',
      'Remediation verified: source is correctly reported as "organization" when campaign has no overrides'
    );
    assert.strictEqual(
      resolved.thresholds.bounceRateThreshold,
      0.01,
      'Remediation verified: threshold resolved to organization override 0.01'
    );

    // Now test what happens in checkCircuitBreaker when evaluated on this campaign with 2.0% bounce rate:
    const domain = await db.sendingDomain.create({
      data: {
        organizationId: orgEmpiricalA,
        domain: `campaign-shadow-${Date.now()}.com`,
        status: 'verified',
        reputationScore: 95,
      },
    });

    const events: any[] = [];
    for (let i = 0; i < 98; i++) {
      events.push({ organizationId: orgEmpiricalA, domainId: domain.id, campaignId: campaign.id, eventType: 'sent' });
    }
    events.push({ organizationId: orgEmpiricalA, domainId: domain.id, campaignId: campaign.id, eventType: 'bounced' });
    events.push({ organizationId: orgEmpiricalA, domainId: domain.id, campaignId: campaign.id, eventType: 'bounced' });

    await db.emailEvent.createMany({ data: events });

    const status = await checkCircuitBreaker({
      domainId: domain.id,
      campaignId: campaign.id,
      organizationId: orgEmpiricalA,
    });

    console.log(`    [Remediation Verified] checkCircuitBreaker status: '${status.status}', triggered: ${status.triggered}, evaluated threshold: ${status.thresholds.bounceRate}`);

    // With the hierarchy shadowing fix, 2.0% bounce rate TRIPS the circuit breaker under 1.0% org threshold:
    assert.strictEqual(
      status.triggered,
      true,
      'Remediation verified: circuit breaker tripped at 2.0% bounce rate under 1.0% org threshold'
    );
    assert.strictEqual(
      status.status,
      'block',
      'Circuit breaker status is "block"'
    );

    const checkCampaign = await db.campaign.findUnique({ where: { id: campaign.id } });
    assert.strictEqual(
      checkCampaign.status,
      'paused',
      'Remediation verified: Campaign was automatically paused upon circuit breaker trip!'
    );
  });

  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log(`  EMPIRICAL CHALLENGER SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('══════════════════════════════════════════════════════════════════════\n');

  if (testsFailed > 0) {
    console.error('Failure Details:');
    failureDetails.forEach(f => console.error(`- ${f.name}:`, f.error));
    process.exit(1);
  }
}

// Execute if run directly
if (process.argv[1]?.includes('challenger-m1-fault-injection.test.ts')) {
  runChallengerTestSuite().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}
