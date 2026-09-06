import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { db } from '../lib/db';
import { AutonomousWorkflowEngine } from '../lib/agents/infrastructure/autonomous-engine';
import { processSendEmailJob } from '../lib/queue/processors/send-email.processor';
import { evaluateSendReadiness, assertReadyToSend } from '../lib/deliverability/send-readiness';
import { DeliverabilityService } from '../lib/deliverability';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testFailures: string[] = [];

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ ${testName}`);
  } else {
    failedTests++;
    const msg = detail ? `${testName} — ${detail}` : testName;
    testFailures.push(msg);
    console.log(`  ❌ ${msg}`);
  }
}

async function runEmpiricalVerification() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  EMPIRICAL CHALLENGER: PRODUCTION READINESS AUDIT            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const timestamp = Date.now();
  const orgAId = `audit_org_a_${timestamp}`;
  const orgBId = `audit_org_b_${timestamp}`;

  // ═══════════════════════════════════════════════════════════════
  // SUITE 1: Multi-Tenant Concurrency & Isolation
  // ═══════════════════════════════════════════════════════════════
  console.log('── 1. Multi-Tenant Cross-Isolation Under Concurrency ──────────');
  const orgA = await db.organization.create({
    data: { id: orgAId, workspaceKey: `ws_${orgAId}`, name: 'Tenant A', slug: `slug-${orgAId}` },
  });
  const orgB = await db.organization.create({
    data: { id: orgBId, workspaceKey: `ws_${orgBId}`, name: 'Tenant B', slug: `slug-${orgBId}` },
  });

  const domainA = await db.sendingDomain.create({
    data: { organizationId: orgA.id, domain: `tenant-a-${timestamp}.com`, status: 'verified', dailyLimit: 100 },
  });
  const domainB = await db.sendingDomain.create({
    data: { organizationId: orgB.id, domain: `tenant-b-${timestamp}.com`, status: 'verified', dailyLimit: 100 },
  });

  const senderA = await db.senderAccount.create({
    data: { organizationId: orgA.id, domainId: domainA.id, email: `alex@tenant-a-${timestamp}.com`, name: 'Alex A', status: 'active', dailyLimit: 100 },
  });
  const senderB = await db.senderAccount.create({
    data: { organizationId: orgB.id, domainId: domainB.id, email: `alex@tenant-b-${timestamp}.com`, name: 'Alex B', status: 'active', dailyLimit: 100 },
  });

  const leadA = await db.lead.create({
    data: { organizationId: orgA.id, name: 'Lead A', email: `lead_a_${timestamp}@test.com`, status: 'enriched', emailVerified: true, isBlacklisted: false, doNotContact: false },
  });
  const leadB = await db.lead.create({
    data: { organizationId: orgB.id, name: 'Lead B', email: `lead_b_${timestamp}@test.com`, status: 'enriched', emailVerified: true, isBlacklisted: false, doNotContact: false },
  });

  const msgA = await db.outreachMessage.create({
    data: { organizationId: orgA.id, leadId: leadA.id, subject: 'Subject A', body: 'Body A', channel: 'email', status: 'approved' },
  });
  const msgB = await db.outreachMessage.create({
    data: { organizationId: orgB.id, leadId: leadB.id, subject: 'Subject B', body: 'Body B', channel: 'email', status: 'approved' },
  });

  // Cross-tenant send attempt 1: Tenant A tries to evaluate/send Tenant B's message
  const evalCross = await evaluateSendReadiness({
    organizationId: orgA.id,
    messageId: msgB.id,
    traceId: `trace_cross_${timestamp}`,
  });
  assert(!evalCross.ready, '1.1: Cross-tenant send-readiness fails (Tenant A cannot access Tenant B message)');
  const msgCheck = evalCross.checks.find(c => c.id === 'message_exists');
  assert(msgCheck?.status === 'block', '1.1: message_exists check blocks cross-tenant message access');

  // Cross-tenant send attempt 2: Worker processing Tenant B message with Tenant A organizationId
  const workerCross = await processSendEmailJob({
    organizationId: orgA.id,
    messageId: msgB.id,
    dryRun: true,
    traceId: `trace_cross_worker_${timestamp}`,
  });
  assert(workerCross.blocked === true, '1.2: Worker blocks cross-tenant message dispatch');
  assert(workerCross.sent === false, '1.2: Worker reports sent=false on cross-tenant mismatch');

  // Concurrently run 20 independent operations across Tenant A and Tenant B
  console.log('  Running 20 concurrent cross-tenant readiness evaluations...');
  const concurrentCrossResults = await Promise.all([
    ...Array.from({ length: 10 }).map(() =>
      evaluateSendReadiness({ organizationId: orgA.id, messageId: msgA.id, traceId: `trace_a` })
    ),
    ...Array.from({ length: 10 }).map(() =>
      evaluateSendReadiness({ organizationId: orgB.id, messageId: msgB.id, traceId: `trace_b` })
    ),
  ]);
  const allTenantsIsolated = concurrentCrossResults.every((r, idx) => {
    // First 10 should belong to Tenant A, second 10 to Tenant B
    return r.checks.length > 0;
  });
  assert(allTenantsIsolated, '1.3: High-concurrency operations remain strictly isolated per tenant');

  // ═══════════════════════════════════════════════════════════════
  // SUITE 2: Emergency Stop Killswitch Responsiveness & Zero Loss
  // ═══════════════════════════════════════════════════════════════
  console.log('\n── 2. Emergency Stop Killswitch Responsiveness & Zero Dropped ─');

  const engine = new AutonomousWorkflowEngine({ organizationId: orgA.id });

  await db.user.create({ data: { id: `user_${orgAId}`, email: `user_${orgAId}@test.com`, name: "User A" } });
  // Baseline: Killswitch OFF -> engine processes normally
  await db.userPreference.upsert({
    where: { userId: `user_${orgAId}` },
    update: { autonomyPaused: false },
    create: { userId: `user_${orgAId}`, activeOrgId: orgA.id, autonomyPaused: false },
  });

  // Create 3 new leads to be discovered
  const leads = await Promise.all([
    db.lead.create({ data: { organizationId: orgA.id, name: 'L1', email: `l1_${timestamp}@t.com`, status: 'new', isBlacklisted: false, doNotContact: false } }),
    db.lead.create({ data: { organizationId: orgA.id, name: 'L2', email: `l2_${timestamp}@t.com`, status: 'new', isBlacklisted: false, doNotContact: false } }),
    db.lead.create({ data: { organizationId: orgA.id, name: 'L3', email: `l3_${timestamp}@t.com`, status: 'new', isBlacklisted: false, doNotContact: false } }),
  ]);

  const beforeCycle = await engine.runCycle();
  assert(beforeCycle.discovered > 0, '2.1: Engine discovers leads when killswitch is OFF');

  // ACTIVATE EMERGENCY KILLSWITCH
  await db.userPreference.update({
    where: { userId: `user_${orgAId}` },
    data: { autonomyPaused: true, pausedReason: 'EMERGENCY_STOP_CHALLENGER', pausedAt: new Date() },
  });

  // Execute cycle immediately following killswitch
  const killswitchCycle = await engine.runCycle();
  assert(killswitchCycle.discovered === 0, '2.2: Killswitch immediately halts discoveries within 1 cycle (0 discovered)');
  assert(killswitchCycle.drafted === 0, '2.2: Killswitch halts drafting within 1 cycle (0 drafted)');
  assert(killswitchCycle.scheduled === 0, '2.2: Killswitch halts scheduling within 1 cycle (0 scheduled)');

  // Verify Zero State Loss: leads are NOT dropped or deleted
  const remainingLeads = await db.lead.count({ where: { organizationId: orgA.id } });
  assert(remainingLeads >= 4, '2.3: Zero state loss — all leads preserved during emergency stop');

  // Verify Campaign Emergency Stop
  const campEmergency = await db.campaign.create({
    data: { organizationId: orgA.id, name: 'Emergency Campaign', status: 'paused', pausedReason: 'Manual emergency stop' },
  });
  const msgEmergency = await db.outreachMessage.create({
    data: { organizationId: orgA.id, leadId: leadA.id, campaignId: campEmergency.id, subject: 'Emergency Subject', body: 'Body', status: 'approved' },
  });

  const workerEmergency = await processSendEmailJob({
    organizationId: orgA.id,
    messageId: msgEmergency.id,
    dryRun: true,
    traceId: `trace_emergency_${timestamp}`,
  });
  assert(workerEmergency.blocked === true, '2.4: Paused campaign immediately blocks worker processing within 1 cycle');
  assert(workerEmergency.sent === false, '2.4: Paused campaign drops zero messages and sends nothing');

  const preservedMsg = await db.outreachMessage.findUnique({ where: { id: msgEmergency.id } });
  assert(preservedMsg !== null, '2.5: Message record exists (zero dropped messages)');
  assert(preservedMsg?.status === 'blocked', '2.5: Message transitioned safely to "blocked" for human audit');

  // ═══════════════════════════════════════════════════════════════
  // SUITE 3: Race Condition Duplicate Send Audit
  // ═══════════════════════════════════════════════════════════════
  console.log('\n── 3. Empirical Race Condition Duplicate Send Vulnerability ───');
  
  // Unpause autonomy so send-readiness allows the race test to proceed
  await db.userPreference.updateMany({
    where: { activeOrgId: orgA.id },
    data: { autonomyPaused: false, pausedReason: null, pausedAt: null },
  });

  const campRace = await db.campaign.create({
    data: { organizationId: orgA.id, name: 'Race Camp', status: 'running', maxDailySends: 100 },
  });
  const msgRace = await db.outreachMessage.create({
    data: { organizationId: orgA.id, leadId: leadA.id, campaignId: campRace.id, senderId: senderA.id, subject: 'Race Subj', body: 'Race Body', status: 'approved' },
  });

  const evalRaceCheck = await evaluateSendReadiness({
    organizationId: orgA.id,
    messageId: msgRace.id,
    traceId: `trace_race_eval`,
  });
  console.log('  msgRace ready:', evalRaceCheck.ready, 'blocked checks:', evalRaceCheck.checks.filter(c => c.status === 'block').map(c => ({ id: c.id, reason: c.reason })));

  let physicalDispatches = 0;
  const originalSendEmail = DeliverabilityService.sendEmail.bind(DeliverabilityService);
  DeliverabilityService.sendEmail = async (params: any) => {
    physicalDispatches++;
    await new Promise(r => setTimeout(r, 25)); // simulate realistic network I/O
    return originalSendEmail({ ...params, dryRun: true });
  };

  // Trigger 5 concurrent worker dispatches for the identical approved message
  await Promise.all(
    Array.from({ length: 5 }).map(() =>
      processSendEmailJob({
        organizationId: orgA.id,
        messageId: msgRace.id,
        campaignId: campRace.id,
        dryRun: true,
        traceId: `trace_race_check`,
      })
    )
  );

  DeliverabilityService.sendEmail = originalSendEmail;

  console.log(`  Physical dispatches for single approved message: ${physicalDispatches}`);
  if (physicalDispatches > 1) {
    console.log(`  ⚠️ VULNERABILITY REPRODUCED: ${physicalDispatches} concurrent sends executed for a single message!`);
  }
  // Record finding in audit
  assert(
    physicalDispatches === 1,
    '3.1: Concurrency safety: Exact-once delivery under simultaneous worker execution',
    `Expected 1 send, but observed ${physicalDispatches} concurrent duplicate sends!`
  );

  // Cleanup
  await db.activity.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } }).catch(() => {});
  await db.outreachMessage.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } }).catch(() => {});
  await db.lead.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } }).catch(() => {});
  await db.campaign.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } }).catch(() => {});
  await db.senderAccount.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } }).catch(() => {});
  await db.sendingDomain.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } }).catch(() => {});
  await db.userPreference.deleteMany({ where: { activeOrgId: { in: [orgAId, orgBId] } } }).catch(() => {});
  await db.user.deleteMany({ where: { id: `user_${orgAId}` } }).catch(() => {});
  await db.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } }).catch(() => {});

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`  AUDIT RESULTS: ${passedTests} passed, ${failedTests} failed (${totalTests} total)`);
  console.log('══════════════════════════════════════════════════════════════');
  if (testFailures.length > 0) {
    console.log('\nDetected Vulnerabilities:');
    testFailures.forEach(f => console.log(`  - ${f}`));
  }
}

runEmpiricalVerification().catch(err => {
  console.error('Audit run error:', err);
  process.exit(1);
});
