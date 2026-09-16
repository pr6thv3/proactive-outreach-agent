// ─── ADVERSARIAL STRESS TEST SUITE: SERVER-SIDE EMERGENCY STOP (R7) ─────
// Empirical challenger verification:
// 1. Concurrency, rapid flip-flop, queue race conditions, mid-flight batch dispatch interruption
// 2. Mid-batch emergency stop triggering: ZERO subsequent outbound calls escape across any worker or API route
// 3. Cross-tenant isolation under concurrent load: Org A stopped must NEVER block Org B
// 4. Idempotency under repeated, identical, and conflicting calls
// 5. Input fuzzing, special characters, unicode, cold-cache DB recovery, inbound queue preservation
// ───────────────────────────────────────────────────────────────────────

import assert from 'assert';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import {
  setWorkspaceEmergencyStop,
  isWorkspaceEmergencyStopped,
  getWorkspaceEmergencyStopStatus,
  assertOutboundAllowed,
  EmergencyStopBlockedError,
  resetEmergencyStopForTesting,
} from '@/lib/safety/emergency-stop';
import { runTrackedProcessor } from '@/lib/queue/worker';
import { DeliverabilityService } from '@/lib/deliverability';
import { evaluateSendReadiness } from '@/lib/deliverability/send-readiness';
import { POST as sendRoutePOST } from '@/app/api/leads/[id]/send/route';
import { POST as emergencyStopPOST, GET as emergencyStopGET } from '@/app/api/autonomy/emergency-stop/route';

let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (error: any) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(error);
    failed++;
  }
}

async function main() {
  console.log('══════════════════════════════════════════════════════════════════');
  console.log('  EMPIRICAL ADVERSARIAL CHALLENGER: SERVER-SIDE EMERGENCY STOP (R7)');
  console.log('══════════════════════════════════════════════════════════════════\n');

  resetEmergencyStopForTesting();

  const timestamp = Date.now();
  const orgAlpha = `org_adv_alpha_${timestamp}`;
  const orgBeta = `org_adv_beta_${timestamp}`;

  // Pre-seed organizations in database
  await db.organization.create({ data: { id: orgAlpha, name: 'Adversarial Org Alpha', plan: 'enterprise' } }).catch(() => {});
  await db.organization.create({ data: { id: orgBeta, name: 'Adversarial Org Beta', plan: 'enterprise' } }).catch(() => {});

  // Pre-seed sending domains and senders for deliverability checks
  const domainAlpha = await db.sendingDomain.create({
    data: {
      organizationId: orgAlpha,
      domain: `alpha-${timestamp}.com`,
      status: 'verified',
      reputationScore: 98,
      dailyLimit: 1000,
    },
  });
  const senderAlpha = await db.senderAccount.create({
    data: {
      organizationId: orgAlpha,
      email: `outreach@alpha-${timestamp}.com`,
      name: 'Alpha Outreach',
      domainId: domainAlpha.id,
      status: 'active',
      dailyLimit: 500,
      reputationScore: 98,
    },
  });

  const domainBeta = await db.sendingDomain.create({
    data: {
      organizationId: orgBeta,
      domain: `beta-${timestamp}.com`,
      status: 'verified',
      reputationScore: 98,
      dailyLimit: 1000,
    },
  });
  const senderBeta = await db.senderAccount.create({
    data: {
      organizationId: orgBeta,
      email: `outreach@beta-${timestamp}.com`,
      name: 'Beta Outreach',
      domainId: domainBeta.id,
      status: 'active',
      dailyLimit: 500,
      reputationScore: 98,
    },
  });

  // ══════════════════════════════════════════════════════════════════
  // SUITE 1: CONCURRENT BURSTS & RAPID FLIP-FLOP STRESS
  // ══════════════════════════════════════════════════════════════════
  console.log('── SUITE 1: Concurrency & Rapid Flip-Flop Stress ────────────────');

  await runTest('1.1 Concurrent 50 parallel engage calls converge idempotently', async () => {
    const promises = Array.from({ length: 50 }, (_, i) =>
      setWorkspaceEmergencyStop(orgAlpha, true, `Concurrent engage thread #${i}`, `user_${i}`)
    );
    const results = await Promise.all(promises);

    // All results must report isStopped === true
    for (const res of results) {
      assert.strictEqual(res.isStopped, true);
      assert.strictEqual(res.organizationId, orgAlpha);
    }

    const current = await isWorkspaceEmergencyStopped(orgAlpha);
    assert.strictEqual(current, true, 'Org Alpha must be stopped after concurrent engage');
  });

  await runTest('1.2 High-frequency rapid flip-flop (engage/release x 60) terminates deterministically', async () => {
    // Alternate engage and release rapidly across 60 sequential turns
    for (let i = 0; i < 60; i++) {
      const shouldStop = i % 2 === 0;
      await setWorkspaceEmergencyStop(orgAlpha, shouldStop, `Flip-flop step ${i}`);
      const state = await isWorkspaceEmergencyStopped(orgAlpha);
      assert.strictEqual(state, shouldStop, `State mismatch at flip-flop step ${i}`);
    }

    // Explicitly release and verify
    await setWorkspaceEmergencyStop(orgAlpha, false, 'Flip-flop final release');
    assert.strictEqual(await isWorkspaceEmergencyStopped(orgAlpha), false);
  });

  await runTest('1.3 Randomized concurrent race: 40 mixed engage/release promises with final fence', async () => {
    // Fire 40 concurrent mixed requests
    const mixed = Array.from({ length: 40 }, (_, i) =>
      setWorkspaceEmergencyStop(orgAlpha, i % 2 === 1, `Random race ${i}`)
    );
    await Promise.all(mixed);

    // Now apply deterministic final fence
    await setWorkspaceEmergencyStop(orgAlpha, true, 'Deterministic final engage');
    assert.strictEqual(await isWorkspaceEmergencyStopped(orgAlpha), true);

    await setWorkspaceEmergencyStop(orgAlpha, false, 'Deterministic final release');
    assert.strictEqual(await isWorkspaceEmergencyStopped(orgAlpha), false);
  });

  // ══════════════════════════════════════════════════════════════════
  // SUITE 2: MID-FLIGHT BATCH DISPATCH INTERRUPTION & ZERO LEAKAGE
  // ══════════════════════════════════════════════════════════════════
  console.log('\n── SUITE 2: Mid-Flight Batch Dispatch Interruption & Zero Leakage ──');

  await runTest('2.1 Mid-batch interruption: Triggering emergency stop mid-flight halts all subsequent sends with ZERO leakage', async () => {
    const batchSize = 25;
    const leads: any[] = [];
    const messages: any[] = [];

    // Create 25 leads and messages for Org Alpha
    for (let i = 0; i < batchSize; i++) {
      const lead = await db.lead.create({
        data: {
          organizationId: orgAlpha,
          name: `Batch Lead ${i}`,
          email: `batch.lead.${timestamp}.${i}@example.com`,
          status: 'approved',
          emailVerified: true,
          leadScore: 92,
        },
      });
      leads.push(lead);

      const msg = await db.outreachEmail.create({
        data: {
          organizationId: orgAlpha,
          leadId: lead.id,
          subject: `Batch Outreach #${i}`,
          body: `Hello from batch outreach ${i}`,
          status: 'approved',
        },
      });
      messages.push(msg);
    }

    // Ensure emergency stop is off initially
    await setWorkspaceEmergencyStop(orgAlpha, false, 'Initial state: unstopped');

    let escapeCount = 0;
    let blockedCount = 0;
    let sentBeforeStop = 0;
    let stopTriggered = false;

    // We mock/spy on actual email provider or execute via processor
    // Track each execution through the worker processor
    const processItem = async (msg: typeof messages[0], index: number) => {
      // Intentionally trigger emergency stop at index 6
      if (index === 6 && !stopTriggered) {
        stopTriggered = true;
        await setWorkspaceEmergencyStop(orgAlpha, true, 'Emergency killswitch engaged at item 6');
      }

      // Small artificial delay to simulate realistic network/execution jitter
      await new Promise(r => setTimeout(r, 10 + (index % 5) * 5));

      const fakeJob: any = {
        id: `job_batch_${msg.id}`,
        data: {
          organizationId: orgAlpha,
          messageId: msg.id,
          leadId: msg.leadId,
          traceId: `trace_batch_${index}`,
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
      };

      try {
        await runTrackedProcessor('send-email', fakeJob);
        // If it got here, it wasn't blocked by worker
        if (stopTriggered) {
          escapeCount++;
        } else {
          sentBeforeStop++;
        }
      } catch (err: any) {
        if (err instanceof EmergencyStopBlockedError || err?.code === 'EMERGENCY_STOP_ACTIVE') {
          blockedCount++;
        } else {
          // Send readiness or other rejection
          blockedCount++;
        }
      }
    };

    // Run sequentially / interleaved to test mid-flight interruption
    for (let i = 0; i < batchSize; i++) {
      await processItem(messages[i], i);
    }

    console.log(`    [Empirical Batch Run] Sent before stop: ${sentBeforeStop}, Blocked after stop: ${blockedCount}, Escaped: ${escapeCount}`);

    // VERIFY ZERO ESCAPED OUTBOUND CALLS
    assert.strictEqual(
      escapeCount,
      0,
      `CRITICAL VIOLATION: ${escapeCount} outbound calls escaped after emergency stop was engaged!`
    );
    assert.ok(blockedCount >= (batchSize - 6), `Expected at least ${batchSize - 6} blocked calls, got ${blockedCount}`);

    // Clean up emergency stop state for next tests
    await setWorkspaceEmergencyStop(orgAlpha, false, 'Batch test cleanup');
  });

  await runTest('2.2 Concurrent mid-flight queue race: 20 simultaneous workers with emergency stop triggered mid-concurrency', async () => {
    const queueSize = 20;
    const testMessages: any[] = [];

    for (let i = 0; i < queueSize; i++) {
      const lead = await db.lead.create({
        data: {
          organizationId: orgAlpha,
          name: `Concurrent Lead ${i}`,
          email: `concurrent.${timestamp}.${i}@example.com`,
          status: 'approved',
          emailVerified: true,
          leadScore: 90,
        },
      });
      const msg = await db.outreachEmail.create({
        data: {
          organizationId: orgAlpha,
          leadId: lead.id,
          subject: `Concurrent Outreach ${i}`,
          body: `Body ${i}`,
          status: 'approved',
        },
      });
      testMessages.push(msg);
    }

    // Engage emergency stop concurrently while workers are firing
    let stopTime: number | null = null;
    let escapesAfterStop = 0;
    let blockedCount = 0;
    let completedBeforeStop = 0;

    const workerTasks = testMessages.map(async (msg, index) => {
      // Stagger start slightly
      await new Promise(r => setTimeout(r, index * 8));

      const fakeJob: any = {
        id: `job_conc_${msg.id}`,
        data: {
          organizationId: orgAlpha,
          messageId: msg.id,
          leadId: msg.leadId,
          traceId: `trace_conc_${index}`,
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
      };

      try {
        const res: any = await runTrackedProcessor('send-email', fakeJob);
        if (res?.sent === true) {
          const completionTime = Date.now();
          if (stopTime !== null && completionTime > stopTime) {
            escapesAfterStop++;
          } else {
            completedBeforeStop++;
          }
        } else {
          // Job was blocked by send readiness / worker checks (sent: false, blocked: true)
          blockedCount++;
        }
      } catch (err: any) {
        blockedCount++;
      }
    });

    // Trigger emergency stop at 50ms into the execution
    const stopper = (async () => {
      await new Promise(r => setTimeout(r, 50));
      await setWorkspaceEmergencyStop(orgAlpha, true, 'Emergency stop mid-concurrency');
      stopTime = Date.now();
    })();

    await Promise.all([...workerTasks, stopper]);

    console.log(`    [Concurrent Race] Completed before stop: ${completedBeforeStop}, Blocked: ${blockedCount}, Post-stop escapes: ${escapesAfterStop}`);

    assert.strictEqual(
      escapesAfterStop,
      0,
      `CRITICAL VIOLATION: ${escapesAfterStop} outbound jobs escaped after emergency stop confirmation!`
    );
    assert.ok(blockedCount > 0, 'At least some jobs must have been blocked by emergency stop');

    await setWorkspaceEmergencyStop(orgAlpha, false, 'Cleanup concurrent test');
  });

  // ══════════════════════════════════════════════════════════════════
  // SUITE 3: CROSS-TENANT ISOLATION UNDER HEAVY LOAD
  // ══════════════════════════════════════════════════════════════════
  console.log('\n── SUITE 3: Cross-Tenant Isolation Under Heavy Load ─────────────');

  await runTest('3.1 Org A stopped mid-load NEVER blocks or drops Org B sends', async () => {
    // Engage stop on Org A
    await setWorkspaceEmergencyStop(orgAlpha, true, 'Org Alpha emergency quarantine');
    await setWorkspaceEmergencyStop(orgBeta, false, 'Org Beta operational');

    assert.strictEqual(await isWorkspaceEmergencyStopped(orgAlpha), true);
    assert.strictEqual(await isWorkspaceEmergencyStopped(orgBeta), false);

    // Prepare jobs for Org A and Org B
    const jobA: any = {
      id: 'job_org_a',
      data: { organizationId: orgAlpha, messageId: 'msg_a' },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };
    const jobB: any = {
      id: 'job_org_b',
      data: { organizationId: orgBeta, messageId: 'msg_b' },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    // Org A must be blocked with EmergencyStopBlockedError
    let orgABlocked = false;
    try {
      await runTrackedProcessor('send-email', jobA);
    } catch (err: any) {
      if (err instanceof EmergencyStopBlockedError) {
        orgABlocked = true;
        assert.strictEqual(err.organizationId, orgAlpha);
      }
    }
    assert.strictEqual(orgABlocked, true, 'Org A outbound job must be blocked');

    // Org B must NOT be blocked by EmergencyStopBlockedError
    let orgBEncounteredEmergencyStop = false;
    try {
      await runTrackedProcessor('send-email', jobB);
    } catch (err: any) {
      if (err instanceof EmergencyStopBlockedError) {
        orgBEncounteredEmergencyStop = true;
      }
    }
    assert.strictEqual(
      orgBEncounteredEmergencyStop,
      false,
      'CRITICAL VIOLATION: Org B was blocked by Org A emergency stop!'
    );

    // Verify Direct Send API route cross-tenant isolation
    const reqA = new NextRequest('http://localhost:3000/api/leads/lead_1/send', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-organization-id': orgAlpha,
        'x-user-id': 'user_a',
        'x-role': 'MEMBER',
      },
      body: JSON.stringify({ subject: 'Sub A', body: 'Body A' }),
    });
    const resA = await sendRoutePOST(reqA, { params: Promise.resolve({ id: 'lead_1' }) });
    assert.strictEqual(resA.status, 423, 'Org A direct send must return HTTP 423 Locked');

    const reqB = new NextRequest('http://localhost:3000/api/leads/lead_nonexistent/send', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-organization-id': orgBeta,
        'x-user-id': 'user_b',
        'x-role': 'MEMBER',
      },
      body: JSON.stringify({ subject: 'Sub B', body: 'Body B' }),
    });
    const resB = await sendRoutePOST(reqB, { params: Promise.resolve({ id: 'lead_nonexistent' }) });
    // Org B should NOT return 423 (it should return 404 lead not found or 422, but definitely NOT 423)
    assert.notStrictEqual(resB.status, 423, 'Org B direct send must NOT return 423 Locked');

    await setWorkspaceEmergencyStop(orgAlpha, false, 'Reset Org Alpha');
  });

  // ══════════════════════════════════════════════════════════════════
  // SUITE 4: IDEMPOTENCY & CONFLICTING REASONS
  // ══════════════════════════════════════════════════════════════════
  console.log('\n── SUITE 4: Idempotency & Conflicting Reasons ───────────────────');

  await runTest('4.1 Multiple consecutive engage calls with identical reasons are strictly idempotent', async () => {
    const reason = 'Statutory compliance investigation';
    const s1 = await setWorkspaceEmergencyStop(orgAlpha, true, reason, 'admin_1');
    const s2 = await setWorkspaceEmergencyStop(orgAlpha, true, reason, 'admin_1');
    const s3 = await setWorkspaceEmergencyStop(orgAlpha, true, reason, 'admin_1');

    assert.strictEqual(s1.isStopped, true);
    assert.strictEqual(s2.isStopped, true);
    assert.strictEqual(s3.isStopped, true);
    assert.strictEqual(s3.reason, reason);
    assert.strictEqual(await isWorkspaceEmergencyStopped(orgAlpha), true);
  });

  await runTest('4.2 Multiple consecutive engage calls with differing reasons update reason gracefully without corruption', async () => {
    await setWorkspaceEmergencyStop(orgAlpha, true, 'Reason 1: Bounce rate surge', 'user_1');
    const s2 = await setWorkspaceEmergencyStop(orgAlpha, true, 'Reason 2: Legal cease and desist', 'user_2');

    assert.strictEqual(s2.isStopped, true);
    assert.strictEqual(s2.reason, 'Reason 2: Legal cease and desist');
    assert.strictEqual(s2.stoppedBy, 'user_2');

    const fetched = await getWorkspaceEmergencyStopStatus(orgAlpha);
    assert.strictEqual(fetched.reason, 'Reason 2: Legal cease and desist');
    assert.strictEqual(fetched.isStopped, true);
  });

  await runTest('4.3 Multiple consecutive release calls are strictly idempotent', async () => {
    await setWorkspaceEmergencyStop(orgAlpha, true, 'Prepare for release test');
    const r1 = await setWorkspaceEmergencyStop(orgAlpha, false, 'Clearance 1');
    const r2 = await setWorkspaceEmergencyStop(orgAlpha, false, 'Clearance 2');
    const r3 = await setWorkspaceEmergencyStop(orgAlpha, false, 'Clearance 3');

    assert.strictEqual(r1.isStopped, false);
    assert.strictEqual(r2.isStopped, false);
    assert.strictEqual(r3.isStopped, false);
    assert.strictEqual(await isWorkspaceEmergencyStopped(orgAlpha), false);
  });

  // ══════════════════════════════════════════════════════════════════
  // SUITE 5: EDGE CASES, FUZZING, COLD-CACHE & INBOUND PRESERVATION
  // ══════════════════════════════════════════════════════════════════
  console.log('\n── SUITE 5: Edge Cases, Fuzzing & Cold-Cache Recovery ───────────');

  await runTest('5.1 Cold-cache recovery: In-memory store wiped, DB state restored transparently', async () => {
    await setWorkspaceEmergencyStop(orgAlpha, true, 'Cold cache persistence probe', 'admin_audit');

    // Manually wipe in-memory cache to simulate cold-start / new container / reboot
    resetEmergencyStopForTesting();

    // Query status without memory cache
    const recovered = await getWorkspaceEmergencyStopStatus(orgAlpha);
    assert.strictEqual(recovered.isStopped, true, 'Must recover true state from DB proxy');
    assert.strictEqual(recovered.reason, 'Cold cache persistence probe');

    const isStopped = await isWorkspaceEmergencyStopped(orgAlpha);
    assert.strictEqual(isStopped, true, 'isWorkspaceEmergencyStopped must reflect recovered state');

    // Wipe again and release
    await setWorkspaceEmergencyStop(orgAlpha, false, 'Release before wipe');
    resetEmergencyStopForTesting();

    const recoveredReleased = await getWorkspaceEmergencyStopStatus(orgAlpha);
    assert.strictEqual(recoveredReleased.isStopped, false, 'Must recover false state from DB proxy');
  });

  await runTest('5.2 Fuzz testing: Extreme payload sizes, special characters, unicode, and SQL injection syntax in reason', async () => {
    const adversarialReasons = [
      '', // empty
      '   ', // whitespace
      "'; DROP TABLE users; -- ' OR 1=1 --", // SQL injection payload
      '<script>alert("xss")</script><svg onload=alert(1)>', // XSS payload
      '🚨 🛑 ⚠️ 紧急停止! 緊急停止! Чрезвычайная остановка! 💥', // Multilingual unicode & emoji
      'A'.repeat(5000), // 5,000 character string
    ];

    for (const reason of adversarialReasons) {
      const res = await setWorkspaceEmergencyStop(orgAlpha, true, reason, 'fuzzer');
      assert.strictEqual(res.isStopped, true);
      assert.strictEqual(await isWorkspaceEmergencyStopped(orgAlpha), true);

      // Verify assertOutboundAllowed throws without crashing
      let thrown = false;
      try {
        await assertOutboundAllowed(orgAlpha);
      } catch (err: any) {
        thrown = true;
        assert.ok(err instanceof EmergencyStopBlockedError);
      }
      assert.strictEqual(thrown, true);
    }

    await setWorkspaceEmergencyStop(orgAlpha, false, 'Fuzz test cleanup');
  });

  await runTest('5.3 Inbound event queues (webhook-processing) remain UNBLOCKED while emergency stop is active', async () => {
    await setWorkspaceEmergencyStop(orgAlpha, true, 'Outbound halt test');

    const inboundJob: any = {
      id: 'job_inbound_1',
      data: {
        organizationId: orgAlpha,
        payload: { event: 'email.opened', emailId: 'msg_test' },
        rawBody: '{"event":"email.opened"}',
        traceId: 'trace_inbound_1',
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    // 'webhook-processing' is an inbound queue — it MUST NOT throw EmergencyStopBlockedError
    let threwEmergency = false;
    try {
      await runTrackedProcessor('webhook-processing', inboundJob);
    } catch (err: any) {
      if (err instanceof EmergencyStopBlockedError || err?.code === 'EMERGENCY_STOP_ACTIVE') {
        threwEmergency = true;
      }
    }

    assert.strictEqual(
      threwEmergency,
      false,
      'R7 VIOLATION: Inbound webhook processing must NOT be blocked by emergency stop'
    );

    await setWorkspaceEmergencyStop(orgAlpha, false, 'Cleanup inbound test');
  });

  await runTest('5.4 Boundary checks: Empty/undefined orgId fails gracefully without unhandled crashes', async () => {
    let emptyOrgError = false;
    try {
      await setWorkspaceEmergencyStop('', true, 'Empty org test');
    } catch {
      emptyOrgError = true;
    }
    assert.strictEqual(emptyOrgError, true, 'setWorkspaceEmergencyStop with empty orgId must reject');

    // isWorkspaceEmergencyStopped with empty org returns false
    const emptyStopped = await isWorkspaceEmergencyStopped('');
    assert.strictEqual(emptyStopped, false);

    // Non-existent organization returns false
    const randomOrgStopped = await isWorkspaceEmergencyStopped('org_does_not_exist_99999');
    assert.strictEqual(randomOrgStopped, false);
  });

  await runTest('5.5 REST API contract: GET and POST /api/autonomy/emergency-stop under adversarial bodies', async () => {
    // 1. Valid engage via action
    const reqEngage = new NextRequest('http://localhost:3000/api/autonomy/emergency-stop', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-organization-id': orgAlpha,
        'x-user-id': 'admin_rest',
        'x-role': 'ADMIN',
      },
      body: JSON.stringify({ action: 'engage', reason: 'REST API test engage' }),
    });
    const resEngage = await emergencyStopPOST(reqEngage);
    assert.strictEqual(resEngage.status, 200);
    const bodyEngage = await resEngage.json();
    assert.strictEqual(bodyEngage.data.isStopped, true);

    // 2. GET returns engaged status
    const reqGet = new NextRequest('http://localhost:3000/api/autonomy/emergency-stop', {
      method: 'GET',
      headers: {
        'x-organization-id': orgAlpha,
        'x-user-id': 'admin_rest',
        'x-role': 'ADMIN',
      },
    });
    const resGet = await emergencyStopGET(reqGet);
    assert.strictEqual(resGet.status, 200);
    const bodyGet = await resGet.json();
    assert.strictEqual(bodyGet.data.isStopped, true);

    // 3. Invalid payload returns 400 Bad Request
    const reqInvalid = new NextRequest('http://localhost:3000/api/autonomy/emergency-stop', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-organization-id': orgAlpha,
        'x-user-id': 'admin_rest',
        'x-role': 'ADMIN',
      },
      body: JSON.stringify({ invalidField: 123 }),
    });
    const resInvalid = await emergencyStopPOST(reqInvalid);
    assert.strictEqual(resInvalid.status, 400, 'Invalid payload must return HTTP 400');

    // 4. Release via stopped: false
    const reqRelease = new NextRequest('http://localhost:3000/api/autonomy/emergency-stop', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-organization-id': orgAlpha,
        'x-user-id': 'admin_rest',
        'x-role': 'ADMIN',
      },
      body: JSON.stringify({ stopped: false, reason: 'REST API test release' }),
    });
    const resRelease = await emergencyStopPOST(reqRelease);
    assert.strictEqual(resRelease.status, 200);
    const bodyRelease = await resRelease.json();
    assert.strictEqual(bodyRelease.data.isStopped, false);

    assert.strictEqual(await isWorkspaceEmergencyStopped(orgAlpha), false);
  });

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(`  ADVERSARIAL STRESS TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('══════════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal stress test runner error:', err);
  process.exit(1);
});
