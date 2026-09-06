// ─── Milestone 4 (R4) Test Suite: Dynamic Sequences & AI Smart Inbox ─────────
// Comprehensive tests for:
// 1. Dynamic 4-Step Sequences (Day 1 Initial, Day 3 Bump, Day 7 Value Case Study, Day 12 Breakup with calendar link)
// 2. Real-Time Sequence Interruption (Halts scheduled follow-ups upon reply, meeting booking, bounce, or unsubscribe)
// 3. AI Smart Inbox 6-Category Classification (meeting_request, interested, question, not_interested, out_of_office, unsubscribe)
// 4. Meeting Escalation & Calendar Link Generation
// 5. Contextual Question Answering with Evidence Grounding
// 6. Out of Office Return Date Parsing & Sequence Snoozing
// 7. Permanent DNC Suppression & Auto-Blacklisting

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { db } from '../lib/db';
import {
  FollowUpSchedulerAgent,
  generateDefaultSequence,
  interruptSequence,
  cancelAllFollowUps,
  snoozeSequence,
  DEFAULT_4_STEP_SCHEDULE,
} from '../lib/agents/act/followup-scheduler';
import {
  ReplyClassifierAgent,
  classifyReply,
  classifyByRules,
  extractReturnDate,
  generateSuggestedReply,
} from '../lib/agents/reeval/reply-classifier';
import { isOnDncList, isLeadSafeToContact } from '../lib/safety';
import { AgentContext } from '../lib/agents/types';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST HARNESS & ASSERTIONS
// ═══════════════════════════════════════════════════════════════════════════════
let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;
const failures: string[] = [];

function assert(condition: boolean, testName: string, detail?: string): void {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  ✅ ${testName}`);
  } else {
    failedAssertions++;
    const msg = detail ? `${testName} — ${detail}` : testName;
    failures.push(msg);
    console.log(`  ❌ ${msg}`);
  }
}

function assertEqual<T>(actual: T, expected: T, testName: string): void {
  if (actual !== expected) {
    assert(false, testName, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else {
    assert(true, testName);
  }
}

function section(name: string): void {
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 68 - name.length))}`);
}

async function runM4TestSuite() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  MILESTONE 4: DYNAMIC MULTI-STEP SEQUENCES & AI SMART INBOX TEST SUITE  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  const testOrgId = `org_m4_test_${Date.now()}`;
  await db.organization.create({
    data: { id: testOrgId, name: 'M4 Sequences & Inbox Org', workspaceKey: `wk_${testOrgId}` },
  }).catch(() => {});

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1: Dynamic 4-Step Sequence Generation & Scheduling
  // ═══════════════════════════════════════════════════════════════════════════
  section('1. Dynamic 4-Step Sequence Generation & Scheduling');

  const lead1 = await db.lead.create({
    data: {
      organizationId: testOrgId,
      name: 'Elena Rostova',
      email: `elena_${Date.now()}@datadog.com`,
      company: 'Datadog',
      title: 'VP of Engineering',
      status: 'approved',
    },
  });

  const msg1 = await db.outreachMessage.create({
    data: {
      organizationId: testOrgId,
      leadId: lead1.id,
      subject: 'Outreach infrastructure for Datadog',
      body: 'Hi Elena, noticed your engineering hiring spike.',
      status: 'sent',
    },
  });

  // 1.1 Pure Sequence Generator Verification
  const sequenceTemplates = generateDefaultSequence(
    { name: lead1.name, company: lead1.company, title: lead1.title },
    { type: 'hiring_spike', content: 'hiring 40+ engineers' },
    'https://cal.com/alex/15min'
  );

  assertEqual(sequenceTemplates.length, 4, 'generateDefaultSequence returns exactly 4 steps');
  assertEqual(sequenceTemplates[0].dayOffset, 1, 'Step 1 is Day 1 Initial');
  assertEqual(sequenceTemplates[1].dayOffset, 3, 'Step 2 is Day 3 Bump');
  assertEqual(sequenceTemplates[2].dayOffset, 7, 'Step 3 is Day 7 Value Case Study');
  assertEqual(sequenceTemplates[3].dayOffset, 12, 'Step 4 is Day 12 Breakup');
  assert(sequenceTemplates[3].body.includes('https://cal.com/alex/15min'), 'Day 12 breakup email contains direct calendar link');
  assert(sequenceTemplates[0].body.includes('Datadog'), 'Initial email cites lead company');

  // 1.2 FollowUpSchedulerAgent Execution
  const schedulerAgent = new FollowUpSchedulerAgent();
  const schedulerContext: AgentContext = {
    organizationId: testOrgId,
    leadId: lead1.id,
    lead: {
      id: lead1.id,
      name: lead1.name,
      email: lead1.email,
      company: lead1.company,
      title: lead1.title,
      status: 'approved',
      source: 'manual',
      emailVerified: true,
      isBlacklisted: false,
      doNotContact: false,
    },
    signals: [{ id: 'sig_1', type: 'hiring_spike', content: 'hiring 40+ engineers', source: 'careers', relevance: 0.9, confidence: 0.95 }],
    previousMessages: [],
  };

  const scheduleResult = await schedulerAgent.execute(
    { messageId: msg1.id, schedule: DEFAULT_4_STEP_SCHEDULE },
    schedulerContext
  );

  assertEqual(scheduleResult.followUpsScheduled.length, 3, '3 follow-up steps scheduled in database');
  assertEqual(scheduleResult.followUpsScheduled[0].type, 'reminder', 'First scheduled follow-up is reminder/bump');
  assertEqual(scheduleResult.followUpsScheduled[1].type, 'value_add', 'Second scheduled follow-up is value_add');
  assertEqual(scheduleResult.followUpsScheduled[2].type, 'check_in', 'Third scheduled follow-up is check_in/breakup');

  const scheduledDbFollowUps = await db.followUp.findMany({
    where: { messageId: msg1.id, status: 'scheduled' },
  });
  assertEqual(scheduledDbFollowUps.length, 3, 'Database contains 3 active scheduled follow-up records');

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: Dynamic Sequence Interruption
  // ═══════════════════════════════════════════════════════════════════════════
  section('2. Dynamic Sequence Interruption (Halts Pending Follow-ups)');

  // 2.1 Interruption upon reply
  const interruptReplyResult = await interruptSequence({
    leadId: lead1.id,
    organizationId: testOrgId,
    reason: 'reply',
    note: 'Inbound reply received from prospect',
  });

  assertEqual(interruptReplyResult.success, true, 'interruptSequence returns success: true');
  assertEqual(interruptReplyResult.cancelledCount, 3, 'All 3 pending follow-ups were cancelled');

  const remainingActiveFollowUps = await db.followUp.findMany({
    where: { messageId: msg1.id, status: 'scheduled' },
  });
  assertEqual(remainingActiveFollowUps.length, 0, '0 scheduled follow-ups remain active after reply interruption');

  const cancelledDbFollowUps = await db.followUp.findMany({
    where: { messageId: msg1.id, status: 'cancelled' },
  });
  assertEqual(cancelledDbFollowUps.length, 3, 'All 3 follow-ups are marked status: "cancelled"');

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: AI Smart Inbox 6-Category Classification & Routing
  // ═══════════════════════════════════════════════════════════════════════════
  section('3. AI Smart Inbox 6-Category Classification & Routing');

  const classifierAgent = new ReplyClassifierAgent();

  // 3.1 Category 1: Meeting Request
  const meetingReply = 'Hi Alex! This sounds super relevant for us. Can we do 15 minutes on Thursday at 2pm EST to walk through a demo?';
  const meetingClassResult = classifyByRules(meetingReply, 'Sarah Jenkins', 'Stripe');
  assertEqual(meetingClassResult.category, 'meeting_request', 'Classified as "meeting_request"');
  assertEqual(meetingClassResult.nextAction, 'escalate', 'Next action is "escalate" for meeting_request');
  assert(meetingClassResult.confidence >= 0.85, 'High confidence for meeting_request (> 0.85)');
  assert(Boolean(meetingClassResult.calendarLink?.includes('cal.com')), 'Calendar link included for meeting_request');

  // 3.2 Category 2: Interested
  const interestedReply = 'Sounds interesting! We were just discussing outbound deliverability. Could you share some more info and recent case studies?';
  const interestedClassResult = classifyByRules(interestedReply, 'Marcus Vance', 'Plaid');
  assertEqual(interestedClassResult.category, 'interested', 'Classified as "interested"');
  assertEqual(interestedClassResult.nextAction, 'escalate', 'Next action is "escalate" for interested lead');
  assert(Boolean(interestedClassResult.suggestedReply?.includes('Plaid')), 'Suggested reply cites lead company');

  // 3.3 Category 3: Question / Inquiry
  const questionReply = 'How does your platform handle SOC2 Type II compliance and tenant data isolation?';
  const questionClassResult = classifyByRules(questionReply, 'Elena Rostova', 'Datadog');
  assertEqual(questionClassResult.category, 'question', 'Classified as "question"');
  assertEqual(questionClassResult.nextAction, 'auto_reply', 'Next action is "auto_reply"');
  assert(Boolean(questionClassResult.suggestedReply?.includes('SOC2 Type II')), 'Contextual response pre-drafts SOC2 answer');

  // 3.4 Category 4: Not Interested
  const notInterestedReply = 'No thanks, we already have our outbound tooling locked in for the year and are not interested. Pass for now.';
  const notInterestedClassResult = classifyByRules(notInterestedReply, 'Chloe Miller', 'Figma');
  assertEqual(notInterestedClassResult.category, 'not_interested', 'Classified as "not_interested"');
  assertEqual(notInterestedClassResult.nextAction, 'stop_sequence', 'Next action is "stop_sequence"');

  // 3.5 Category 5: Out of Office
  const oooReply = 'Thank you for your email. I am currently out of the office attending an executive offsite until Monday, September 8th.';
  const oooClassResult = classifyByRules(oooReply, 'David Chen', 'Notion');
  assertEqual(oooClassResult.category, 'out_of_office', 'Classified as "out_of_office"');
  assertEqual(oooClassResult.nextAction, 'snooze_sequence', 'Next action is "snooze_sequence"');

  const parsedReturnDate = extractReturnDate(oooReply);
  assert(!!parsedReturnDate, 'extractReturnDate successfully parses OOO return date');
  assertEqual(parsedReturnDate?.getMonth(), 8, 'Parsed return month is September (index 8)');
  assertEqual(parsedReturnDate?.getDate(), 8, 'Parsed return day is 8th');

  // 3.6 Category 6: Unsubscribe / Opt-Out
  const unsubReply = 'Please unsubscribe me and remove me from your list immediately. Do not contact me again.';
  const unsubClassResult = classifyByRules(unsubReply, 'Robert Garcia', 'Brex');
  assertEqual(unsubClassResult.category, 'unsubscribe', 'Classified as "unsubscribe"');
  assertEqual(unsubClassResult.nextAction, 'mark_unsub', 'Next action is "mark_unsub"');
  assertEqual(unsubClassResult.suppressed, true, 'suppressed flag is true');

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: End-to-End Permanent DNC Suppression Execution
  // ═══════════════════════════════════════════════════════════════════════════
  section('4. End-to-End Permanent DNC Suppression Execution');

  const unsubLead = await db.lead.create({
    data: {
      organizationId: testOrgId,
      name: 'Robert Garcia',
      email: `robert_unsub_${Date.now()}@brex.com`,
      company: 'Brex',
      status: 'sent',
      isBlacklisted: false,
      doNotContact: false,
    },
  });

  const unsubMessage = await db.outreachMessage.create({
    data: {
      organizationId: testOrgId,
      leadId: unsubLead.id,
      subject: 'Outreach to Brex',
      body: 'Hi Robert',
      status: 'sent',
    },
  });

  // Schedule follow-ups that must be cancelled upon unsubscribe
  await db.followUp.create({
    data: {
      messageId: unsubMessage.id,
      status: 'scheduled',
      type: 'reminder',
      scheduledAt: new Date(Date.now() + 3 * 86400000),
    },
  });

  const triageResult = await classifyReply({
    replyText: 'Please remove me from all lists and unsubscribe immediately.',
    leadId: unsubLead.id,
    messageId: unsubMessage.id,
    organizationId: testOrgId,
  });

  assertEqual(triageResult.category, 'unsubscribe', 'classifyReply identified unsubscribe');
  assertEqual(triageResult.suppressed, true, 'classifyReply reports suppressed = true');

  const updatedUnsubLead = await db.lead.findUnique({ where: { id: unsubLead.id } });
  assertEqual(updatedUnsubLead?.isBlacklisted, true, 'Lead is marked isBlacklisted = true in DB');
  assertEqual(updatedUnsubLead?.doNotContact, true, 'Lead is marked doNotContact = true in DB');
  assertEqual(updatedUnsubLead?.status, 'unsubscribed', 'Lead status is updated to "unsubscribed" in DB');

  const isDnc = await isOnDncList(unsubLead.email, testOrgId);
  assertEqual(isDnc, true, 'Lead email is registered in DoNotContact table');

  const safetyCheck = await isLeadSafeToContact(unsubLead.id, testOrgId);
  assertEqual(safetyCheck.safe, false, 'isLeadSafeToContact returns safe: false');
  assert(safetyCheck.reasons.length >= 1, 'isLeadSafeToContact returns blocking reasons');

  const unsubActiveFollowUps = await db.followUp.findMany({
    where: { messageId: unsubMessage.id, status: 'scheduled' },
  });
  assertEqual(unsubActiveFollowUps.length, 0, 'All scheduled follow-ups are cancelled upon unsubscribe');

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5: Out of Office Sequence Snoozing Execution
  // ═══════════════════════════════════════════════════════════════════════════
  section('5. Out of Office Sequence Snoozing Execution');

  const oooLead = await db.lead.create({
    data: {
      organizationId: testOrgId,
      name: 'David Chen',
      email: `david_ooo_${Date.now()}@notion.so`,
      company: 'Notion',
      status: 'sent',
    },
  });

  const oooMessage = await db.outreachMessage.create({
    data: {
      organizationId: testOrgId,
      leadId: oooLead.id,
      subject: 'Outreach to Notion',
      body: 'Hi David',
      status: 'sent',
    },
  });

  const originalFollowUp = await db.followUp.create({
    data: {
      messageId: oooMessage.id,
      status: 'scheduled',
      type: 'reminder',
      sequencePos: 1,
      scheduledAt: new Date(Date.now() + 2 * 86400000),
    },
  });

  const resumeDate = new Date(Date.now() + 10 * 86400000);
  const snoozeResult = await snoozeSequence({
    leadId: oooLead.id,
    resumeDate,
    organizationId: testOrgId,
    reason: 'Prospect on vacation',
  });

  assertEqual(snoozeResult.success, true, 'snoozeSequence returns success: true');
  assertEqual(snoozeResult.snoozedCount, 1, '1 follow-up rescheduled');

  const updatedOooFollowUp = await db.followUp.findUnique({ where: { id: originalFollowUp.id } });
  assert(
    new Date(updatedOooFollowUp?.scheduledAt || 0).getTime() >= resumeDate.getTime() - 86400000,
    'Follow-up rescheduled date is moved to resume date'
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log(`║  MILESTONE 4 TEST RESULTS: ${passedAssertions} PASSED, ${failedAssertions} FAILED                       ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  if (failedAssertions > 0) {
    console.error(`\n❌ Failed tests (${failedAssertions}):`);
    failures.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
  } else {
    console.log('\n🎉 ALL MILESTONE 4 TESTS PASSED 100% GREEN!\n');
  }
}

runM4TestSuite().catch(err => {
  console.error('Unhandled error in M4 test suite:', err);
  process.exit(1);
});
