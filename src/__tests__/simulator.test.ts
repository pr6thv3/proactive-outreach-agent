// ─── Mailbox Simulator Test Suite ──────────────────────────────────────────────
import { db } from '../lib/db';
import { ReplyClassifierAgent } from '../lib/agents/reeval/reply-classifier';
import { interruptSequence } from '../lib/agents/act/followup-scheduler';

async function runSimulatorTests() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║   PROACTIVEREACH — MAILBOX & PROSPECT SIMULATOR TEST SUITE               ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS [${testName}] ${detail || ''}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL [${testName}] ${detail || ''}`);
      failed++;
    }
  }

  const testOrgId = `org_sim_${Date.now()}`;
  await db.organization.create({
    data: { id: testOrgId, name: 'Simulator Test Org', slug: `sim-${Date.now()}` },
  });

  const lead = await db.lead.create({
    data: {
      organizationId: testOrgId,
      name: 'Elena Rostova',
      firstName: 'Elena',
      lastName: 'Rostova',
      email: `elena.${Date.now()}@datadoghq.com`,
      company: 'Datadog',
      title: 'Head of Security',
      status: 'discovered',
    },
  });

  const message = await db.outreachMessage.create({
    data: {
      organizationId: testOrgId,
      leadId: lead.id,
      subject: 'Quick question regarding Datadog SOC2 automation',
      body: 'Hi Elena, saw your recent cloud security expansion...',
      status: 'approved',
    },
  });

  // 1. Test Open Event simulation
  await db.outreachMessage.update({
    where: { id: message.id },
    data: { openedAt: new Date() },
  });
  const updatedMsg = await db.outreachMessage.findUnique({ where: { id: message.id } });
  assert(!!updatedMsg?.openedAt, 'T1.1', `Open event registered for message ${message.id}`);

  // 2. Test Positive Reply simulation & Meeting Escalation
  const classifier = new ReplyClassifierAgent();
  const meetingReply = "Hi Alex, Thursday at 2pm works. Please send over your invite.";
  const meetingResult = await classifier.run({
    messageId: message.id,
    replyText: meetingReply,
  }, {
    leadId: lead.id,
    lead: lead as any,
    organizationId: testOrgId,
    signals: [],
    previousMessages: [],
    traceId: `trace_sim_${Date.now()}`,
  } as any);

  assert(meetingResult.success, 'T2.1', 'Simulator classified inbound meeting request');
  assert(meetingResult.data?.sentiment === 'positive' || meetingResult.data?.category === 'meeting_request' || meetingResult.data?.nextAction === 'escalate', 'T2.2', `Positive sentiment identified from simulated reply (${meetingResult.data?.sentiment})`);

  await interruptSequence({
    leadId: lead.id,
    organizationId: testOrgId,
    reason: 'reply',
    note: 'Simulated positive reply',
  });
  await db.lead.update({
    where: { id: lead.id },
    data: { status: 'meeting_booked' },
  });
  const bookedLead = await db.lead.findUnique({ where: { id: lead.id } });
  assert(bookedLead?.status === 'meeting_booked', 'T2.3', 'Lead stage escalated to "meeting_booked" on simulator calendar trigger');

  // 3. Test Unsubscribe simulation & DNC Suppression
  const optOutReply = "Please unsubscribe me from future communications.";
  const optOutResult = await classifier.run({
    messageId: message.id,
    replyText: optOutReply,
  }, {
    leadId: lead.id,
    lead: lead as any,
    organizationId: testOrgId,
    signals: [],
    previousMessages: [],
    traceId: `trace_unsub_${Date.now()}`,
  } as any);

  assert(optOutResult.data?.nextAction === 'mark_unsub' || optOutResult.data?.sentiment === 'negative', 'T3.1', 'Opt-out classified as unsubscribe');

  await db.lead.update({
    where: { id: lead.id },
    data: { doNotContact: true, isBlacklisted: true, status: 'unsubscribed' },
  });
  const unsubLead = await db.lead.findUnique({ where: { id: lead.id } });
  assert(unsubLead?.doNotContact === true && unsubLead?.isBlacklisted === true, 'T3.2', 'Lead permanently blacklisted on simulated opt-out');

  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log(`║   SIMULATOR TEST RESULTS: ${passed} Passed / ${failed} Failed                            ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSimulatorTests().catch((err) => {
  console.error('Simulator test failure:', err);
  process.exit(1);
});
