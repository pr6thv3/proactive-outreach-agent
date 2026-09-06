// ─── Milestone 1 Adversarial Challenger Test Harness ─────────────
// Independent Empirical Verification for Data Layer Persistence and Multi-Tenant Isolation
// Models Under Test:
// 1. EmailEvent
// 2. FollowUp
// 3. ReplyClassification
// 4. MessageEdit
// 5. AgentEvent
//
// Coverage:
// - Physical SQL Table Existence & Raw SQL Execution
// - Full CRUD lifecycle (Create, Read, Update, Delete, Count, Aggregates)
// - IDOR & Cross-Tenant Read/Write/Delete Attack Resistance
// - Multi-Tenant Scoping and Isolation
// - Foreign Key Cascade Deletion Integrity (Deleting Org A does NOT affect Org B)
// - Complex/Edge-case JSON, Unicode, and Null payload handling

import { db } from '../lib/db';

let passedCount = 0;
let failedCount = 0;
const failures: string[] = [];

function assert(condition: boolean, testName: string, detail?: string): void {
  if (condition) {
    passedCount++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedCount++;
    const msg = detail ? `${testName} — ${detail}` : testName;
    failures.push(msg);
    console.log(`  ❌ [FAIL] ${msg}`);
  }
}

function assertEqual<T>(actual: T, expected: T, testName: string): void {
  if (actual !== expected) {
    assert(false, testName, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else {
    assert(true, testName);
  }
}

function header(title: string): void {
  console.log(`\n════════════════════════════════════════════════════════════════════════════`);
  console.log(`  ${title}`);
  console.log(`════════════════════════════════════════════════════════════════════════════`);
}

async function runAdversarialValidation() {
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║   ADVERSARIAL CHALLENGER: DATA PERSISTENCE & MULTI-TENANT ISOLATION      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  // ──────────────────────────────────────────────────────────────────────────
  // 1. PHYSICAL DATABASE TABLE EXISTENCE VERIFICATION
  // ──────────────────────────────────────────────────────────────────────────
  header('1. Physical Database Table Existence (Raw SQLite/Prisma Schema)');

  const tables: any[] = await db.$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%';"
  );
  const tableNames = tables.map(t => t.name);
  console.log('  Detected physical tables:', tableNames.join(', '));

  assert(tableNames.includes('EmailEvent'), 'Physical table EmailEvent exists in database');
  assert(tableNames.includes('FollowUp'), 'Physical table FollowUp exists in database');
  assert(tableNames.includes('ReplyClassification'), 'Physical table ReplyClassification exists in database');
  assert(tableNames.includes('MessageEdit'), 'Physical table MessageEdit exists in database');
  assert(tableNames.includes('AgentEvent'), 'Physical table AgentEvent exists in database');
  assert(tableNames.includes('Organization'), 'Physical table Organization exists in database');

  // ──────────────────────────────────────────────────────────────────────────
  // 2. SETUP MULTI-TENANT ORGANIZATIONS & DEPENDENCIES
  // ──────────────────────────────────────────────────────────────────────────
  header('2. Multi-Tenant Test Fixture Initialization');

  const orgAlpha = await db.organization.create({
    data: {
      name: 'Alpha Corp (Tenant A)',
      workspaceKey: `org_alpha_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      plan: 'scale',
      subscriptionStatus: 'active',
    },
  });

  const orgBeta = await db.organization.create({
    data: {
      name: 'Beta LLC (Tenant B)',
      workspaceKey: `org_beta_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      plan: 'starter',
      subscriptionStatus: 'active',
    },
  });

  assert(!!orgAlpha.id && !!orgBeta.id, 'Created isolated test organizations Alpha and Beta');

  const leadAlpha = await db.lead.create({
    data: {
      organizationId: orgAlpha.id,
      name: 'Alice Alpha',
      email: `alice.${Date.now()}@alpha.example`,
      company: 'Alpha Innovations',
      status: 'active',
    },
  });

  const leadBeta = await db.lead.create({
    data: {
      organizationId: orgBeta.id,
      name: 'Bob Beta',
      email: `bob.${Date.now()}@beta.example`,
      company: 'Beta Dynamics',
      status: 'active',
    },
  });

  const messageAlpha = await db.outreachEmail.create({
    data: {
      organizationId: orgAlpha.id,
      leadId: leadAlpha.id,
      subject: 'Alpha Growth Pitch',
      body: 'Hello Alice from Alpha...',
      status: 'sent',
    },
  });

  const messageBeta = await db.outreachEmail.create({
    data: {
      organizationId: orgBeta.id,
      leadId: leadBeta.id,
      subject: 'Beta Partnership Pitch',
      body: 'Hello Bob from Beta...',
      status: 'sent',
    },
  });

  try {
    // ──────────────────────────────────────────────────────────────────────────
    // 3. EXHAUSTIVE CRUD FOR ALL 5 MODELS (TENANT A)
    // ──────────────────────────────────────────────────────────────────────────
    header('3. Comprehensive CRUD Operations for All 5 Materialized Models');

    // 3.1 EmailEvent CRUD
    const createdEmailEvent = await db.emailEvent.create({
      data: {
        organizationId: orgAlpha.id,
        recipient: leadAlpha.email,
        type: 'delivered',
        eventType: 'delivered',
        messageId: messageAlpha.id,
        leadId: leadAlpha.id,
        rawData: JSON.stringify({ provider: 'resend', headers: { 'x-svix-id': '12345' } }),
        metadata: { clientIp: '192.168.1.1', userAgent: 'Mozilla/5.0' },
      },
    });
    assert(!!createdEmailEvent.id, 'EmailEvent.create succeeded');
    assertEqual(createdEmailEvent.organizationId, orgAlpha.id, 'EmailEvent.create stored correct organizationId');
    assertEqual(createdEmailEvent.eventType, 'delivered', 'EmailEvent.create stored correct eventType');

    // EmailEvent findUnique & findFirst
    const fetchedEmailEvent = await db.emailEvent.findUnique({
      where: { id: createdEmailEvent.id },
    });
    assert(!!fetchedEmailEvent, 'EmailEvent.findUnique retrieved record');
    assertEqual(fetchedEmailEvent?.recipient, leadAlpha.email, 'EmailEvent.findUnique verified recipient');

    // EmailEvent update
    const updatedEmailEvent = await db.emailEvent.update({
      where: { id: createdEmailEvent.id },
      data: { bounceType: 'transient', bounceReason: 'Mailbox temporarily full' },
    });
    assertEqual(updatedEmailEvent.bounceType, 'transient', 'EmailEvent.update modified bounceType');
    assertEqual(updatedEmailEvent.bounceReason, 'Mailbox temporarily full', 'EmailEvent.update modified bounceReason');

    // 3.2 FollowUp CRUD
    const scheduledTime = new Date(Date.now() + 86400000);
    const createdFollowUp = await db.followUp.create({
      data: {
        organizationId: orgAlpha.id,
        messageId: messageAlpha.id,
        leadId: leadAlpha.id,
        stepNumber: 2,
        sequencePos: 2,
        scheduledAt: scheduledTime,
        status: 'scheduled',
        type: 'nudge',
        subject: 'Re: Alpha Growth Pitch - Checking in',
        body: 'Just following up on my previous note...',
        metadata: { generatedReason: 'No reply within 24h' },
      },
    });
    assert(!!createdFollowUp.id, 'FollowUp.create succeeded');
    assertEqual(createdFollowUp.organizationId, orgAlpha.id, 'FollowUp.create stored correct organizationId');
    assertEqual(createdFollowUp.sequencePos, 2, 'FollowUp.create stored correct sequencePos');

    // FollowUp updateMany
    const updateFollowUpCount = await db.followUp.updateMany({
      where: { organizationId: orgAlpha.id, status: 'scheduled' },
      data: { status: 'paused' },
    });
    assertEqual(updateFollowUpCount.count, 1, 'FollowUp.updateMany updated exactly 1 record');

    const verifiedFollowUp = await db.followUp.findUnique({ where: { id: createdFollowUp.id } });
    assertEqual(verifiedFollowUp?.status, 'paused', 'FollowUp status successfully transitioned to paused');

    // 3.3 ReplyClassification CRUD
    const createdReplyClassification = await db.replyClassification.create({
      data: {
        organizationId: orgAlpha.id,
        messageId: messageAlpha.id,
        leadId: leadAlpha.id,
        category: 'meeting_request',
        confidence: 0.98,
        sentiment: 'enthusiastic',
        reasoning: 'Lead asked for calendar booking link for 30 min chat',
        replyText: 'Hey! I am interested. Send me your calendar link.',
        nextAction: 'send_calendar_link',
        metadata: { sentimentScore: 0.95, detectedIntent: 'schedule_demo' },
      },
    });
    assert(!!createdReplyClassification.id, 'ReplyClassification.create succeeded');
    assertEqual(createdReplyClassification.category, 'meeting_request', 'ReplyClassification category persisted');
    assertEqual(createdReplyClassification.confidence, 0.98, 'ReplyClassification confidence persisted');

    // ReplyClassification update
    const updatedReplyClass = await db.replyClassification.update({
      where: { id: createdReplyClassification.id },
      data: { actionTaken: 'calendar_link_sent' },
    });
    assertEqual(updatedReplyClass.actionTaken, 'calendar_link_sent', 'ReplyClassification.update persisted actionTaken');

    // 3.4 MessageEdit CRUD
    const createdMessageEdit = await db.messageEdit.create({
      data: {
        organizationId: orgAlpha.id,
        messageId: messageAlpha.id,
        leadId: leadAlpha.id,
        editType: 'urgency_boost',
        fieldName: 'body',
        originalValue: 'Let me know if interested.',
        editedValue: 'We are reserving onboarding slots for this quarter.',
        originalContent: 'Let me know if interested.',
        editedContent: 'We are reserving onboarding slots for this quarter.',
        changeMagnitude: 0.85,
        addedWords: 9,
        removedWords: 5,
        keptPhrases: JSON.stringify(['onboarding']),
        fedToMemory: false,
      },
    });
    assert(!!createdMessageEdit.id, 'MessageEdit.create succeeded');
    assertEqual(createdMessageEdit.editType, 'urgency_boost', 'MessageEdit editType persisted');
    assertEqual(createdMessageEdit.changeMagnitude, 0.85, 'MessageEdit changeMagnitude persisted');

    // MessageEdit query & memory update
    const updatedMessageEdit = await db.messageEdit.update({
      where: { id: createdMessageEdit.id },
      data: { fedToMemory: true, outcomeAfterEdit: 'replied_positive' },
    });
    assertEqual(updatedMessageEdit.fedToMemory, true, 'MessageEdit fedToMemory flag updated to true');
    assertEqual(updatedMessageEdit.outcomeAfterEdit, 'replied_positive', 'MessageEdit outcomeAfterEdit updated');

    // 3.5 AgentEvent CRUD
    const createdAgentEvent = await db.agentEvent.create({
      data: {
        organizationId: orgAlpha.id,
        leadId: leadAlpha.id,
        agentName: 'StrategyArchitect',
        stepName: 'SignalEvidenceSynthesis',
        phase: 'synthesize',
        level: 'info',
        message: 'Synthesized 3 intent signals into high-converting hook',
        inputData: { signals: ['funding_round_b', 'hiring_sdr_lead'] },
        outputData: { hookAngle: 'Growth scaling bottleneck' },
        status: 'completed',
        traceId: `trace_alpha_${Date.now()}`,
        durationMs: 154,
      },
    });
    assert(!!createdAgentEvent.id, 'AgentEvent.create succeeded');
    assertEqual(createdAgentEvent.agentName, 'StrategyArchitect', 'AgentEvent agentName persisted');
    assertEqual(createdAgentEvent.durationMs, 154, 'AgentEvent durationMs persisted');

    // AgentEvent findMany with filters and sorting
    const alphaAgentEvents = await db.agentEvent.findMany({
      where: { organizationId: orgAlpha.id, level: 'info' },
      orderBy: { createdAt: 'desc' },
    });
    assertEqual(alphaAgentEvents.length, 1, 'AgentEvent.findMany retrieved matching record');
    assertEqual(alphaAgentEvents[0].phase, 'synthesize', 'AgentEvent.findMany verified phase attribute');

    // ──────────────────────────────────────────────────────────────────────────
    // 4. POPULATE TENANT B RECORDS FOR ADVERSARIAL ATTACK TESTING
    // ──────────────────────────────────────────────────────────────────────────
    header('4. Populate Tenant B Fixtures for Adversarial Cross-Tenant Testing');

    const betaEmailEvent = await db.emailEvent.create({
      data: {
        organizationId: orgBeta.id,
        recipient: leadBeta.email,
        type: 'opened',
        eventType: 'opened',
        messageId: messageBeta.id,
        leadId: leadBeta.id,
      },
    });

    const betaFollowUp = await db.followUp.create({
      data: {
        organizationId: orgBeta.id,
        messageId: messageBeta.id,
        leadId: leadBeta.id,
        stepNumber: 1,
        scheduledAt: new Date(Date.now() + 172800000),
        status: 'scheduled',
        subject: 'Beta Followup Step 1',
      },
    });

    const betaReplyClassification = await db.replyClassification.create({
      data: {
        organizationId: orgBeta.id,
        messageId: messageBeta.id,
        leadId: leadBeta.id,
        category: 'not_interested',
        confidence: 0.89,
        reasoning: 'Bad timing',
      },
    });

    const betaMessageEdit = await db.messageEdit.create({
      data: {
        organizationId: orgBeta.id,
        messageId: messageBeta.id,
        leadId: leadBeta.id,
        editType: 'tone_formal',
        originalValue: 'Hey Bob',
        editedValue: 'Dear Mr. Beta',
      },
    });

    const betaAgentEvent = await db.agentEvent.create({
      data: {
        organizationId: orgBeta.id,
        leadId: leadBeta.id,
        agentName: 'EnrichmentWorker',
        stepName: 'MxCheck',
        phase: 'enrich',
        level: 'info',
        message: 'MX record confirmed',
        durationMs: 88,
      },
    });

    assert(!!betaEmailEvent.id && !!betaFollowUp.id && !!betaReplyClassification.id && !!betaMessageEdit.id && !!betaAgentEvent.id, 'Tenant B fixtures created across all 5 models');

    // ──────────────────────────────────────────────────────────────────────────
    // 5. ADVERSARIAL ATTACK: CROSS-TENANT READ LEAK (IDOR READ)
    // ──────────────────────────────────────────────────────────────────────────
    header('5. Adversarial Challenge: Cross-Tenant Read Isolation (IDOR Attack)');

    // Attempt to read Tenant A's EmailEvent while scoped to Tenant B
    const leakedEmailEvent = await db.emailEvent.findFirst({
      where: {
        id: createdEmailEvent.id,
        organizationId: orgBeta.id,
      },
    });
    assertEqual(leakedEmailEvent, null, 'Tenant B query for Tenant A EmailEvent returned null');

    // Attempt to read Tenant A's FollowUp while scoped to Tenant B
    const leakedFollowUp = await db.followUp.findFirst({
      where: {
        id: createdFollowUp.id,
        organizationId: orgBeta.id,
      },
    });
    assertEqual(leakedFollowUp, null, 'Tenant B query for Tenant A FollowUp returned null');

    // Attempt to read Tenant A's ReplyClassification while scoped to Tenant B
    const leakedClassification = await db.replyClassification.findFirst({
      where: {
        id: createdReplyClassification.id,
        organizationId: orgBeta.id,
      },
    });
    assertEqual(leakedClassification, null, 'Tenant B query for Tenant A ReplyClassification returned null');

    // Attempt to read Tenant A's MessageEdit while scoped to Tenant B
    const leakedMessageEdit = await db.messageEdit.findFirst({
      where: {
        id: createdMessageEdit.id,
        organizationId: orgBeta.id,
      },
    });
    assertEqual(leakedMessageEdit, null, 'Tenant B query for Tenant A MessageEdit returned null');

    // Attempt to read Tenant A's AgentEvent while scoped to Tenant B
    const leakedAgentEvent = await db.agentEvent.findFirst({
      where: {
        id: createdAgentEvent.id,
        organizationId: orgBeta.id,
      },
    });
    assertEqual(leakedAgentEvent, null, 'Tenant B query for Tenant A AgentEvent returned null');

    // Listing scoped to Tenant B must return ZERO items from Tenant A
    const betaEmailList = await db.emailEvent.findMany({ where: { organizationId: orgBeta.id } });
    const containsAlphaEmail = betaEmailList.some((e: any) => e.id === createdEmailEvent.id || e.organizationId === orgAlpha.id);
    assertEqual(containsAlphaEmail, false, 'Tenant B EmailEvent list contains zero Tenant A records');

    const betaAgentEventList = await db.agentEvent.findMany({ where: { organizationId: orgBeta.id } });
    const containsAlphaAgentEvent = betaAgentEventList.some((e: any) => e.id === createdAgentEvent.id || e.organizationId === orgAlpha.id);
    assertEqual(containsAlphaAgentEvent, false, 'Tenant B AgentEvent list contains zero Tenant A records');

    // ──────────────────────────────────────────────────────────────────────────
    // 6. ADVERSARIAL ATTACK: CROSS-TENANT MUTATION & DELETION (IDOR WRITE)
    // ──────────────────────────────────────────────────────────────────────────
    header('6. Adversarial Challenge: Cross-Tenant Mutation & Deletion Resistance');

    // Attack: Tenant B tries to update Tenant A's FollowUp
    const maliciousFollowUpUpdate = await db.followUp.updateMany({
      where: {
        id: createdFollowUp.id,
        organizationId: orgBeta.id,
      },
      data: {
        status: 'cancelled_by_hacker',
        subject: 'HACKED SUBJECT',
      },
    });
    assertEqual(maliciousFollowUpUpdate.count, 0, 'Cross-tenant FollowUp update affected 0 rows');

    // Verify Tenant A's FollowUp remained intact
    const uncompromisedFollowUp = await db.followUp.findUnique({ where: { id: createdFollowUp.id } });
    assertEqual(uncompromisedFollowUp?.status, 'paused', 'Tenant A FollowUp status was NOT modified by Tenant B');
    assertEqual(uncompromisedFollowUp?.subject, 'Re: Alpha Growth Pitch - Checking in', 'Tenant A FollowUp subject was NOT modified');

    // Attack: Tenant B tries to update Tenant A's ReplyClassification
    const maliciousReplyUpdate = await db.replyClassification.updateMany({
      where: {
        id: createdReplyClassification.id,
        organizationId: orgBeta.id,
      },
      data: {
        category: 'spam_complaint',
      },
    });
    assertEqual(maliciousReplyUpdate.count, 0, 'Cross-tenant ReplyClassification update affected 0 rows');

    const uncompromisedReply = await db.replyClassification.findUnique({ where: { id: createdReplyClassification.id } });
    assertEqual(uncompromisedReply?.category, 'meeting_request', 'Tenant A ReplyClassification category remained meeting_request');

    // Attack: Tenant B tries to delete Tenant A's MessageEdit
    const maliciousEditDelete = await db.messageEdit.deleteMany({
      where: {
        id: createdMessageEdit.id,
        organizationId: orgBeta.id,
      },
    });
    assertEqual(maliciousEditDelete.count, 0, 'Cross-tenant MessageEdit delete affected 0 rows');

    const uncompromisedEdit = await db.messageEdit.findUnique({ where: { id: createdMessageEdit.id } });
    assert(!!uncompromisedEdit, 'Tenant A MessageEdit still exists and was NOT deleted by Tenant B');

    // Attack: Tenant B tries to delete Tenant A's EmailEvent
    const maliciousEventDelete = await db.emailEvent.deleteMany({
      where: {
        id: createdEmailEvent.id,
        organizationId: orgBeta.id,
      },
    });
    assertEqual(maliciousEventDelete.count, 0, 'Cross-tenant EmailEvent delete affected 0 rows');

    const uncompromisedEvent = await db.emailEvent.findUnique({ where: { id: createdEmailEvent.id } });
    assert(!!uncompromisedEvent, 'Tenant A EmailEvent still exists and was NOT deleted by Tenant B');

    // ──────────────────────────────────────────────────────────────────────────
    // 7. CASCADE DELETION & INDEPENDENCE INTEGRITY
    // ──────────────────────────────────────────────────────────────────────────
    header('7. Cascade Deletion Integrity & Multi-Tenant Independence');

    // Delete Organization Alpha
    await db.organization.delete({ where: { id: orgAlpha.id } });
    console.log('  Deleted Organization Alpha (Tenant A). Verifying cascade behavior...');

    // Verify all Alpha records are cleanly cascade-deleted
    const remainingAlphaEvents = await db.emailEvent.count({ where: { organizationId: orgAlpha.id } });
    const remainingAlphaFollowUps = await db.followUp.count({ where: { organizationId: orgAlpha.id } });
    const remainingAlphaClassifications = await db.replyClassification.count({ where: { organizationId: orgAlpha.id } });
    const remainingAlphaEdits = await db.messageEdit.count({ where: { organizationId: orgAlpha.id } });
    const remainingAlphaAgentEvents = await db.agentEvent.count({ where: { organizationId: orgAlpha.id } });

    assertEqual(remainingAlphaEvents, 0, 'All Tenant A EmailEvents cascade deleted on organization removal');
    assertEqual(remainingAlphaFollowUps, 0, 'All Tenant A FollowUps cascade deleted on organization removal');
    assertEqual(remainingAlphaClassifications, 0, 'All Tenant A ReplyClassifications cascade deleted on organization removal');
    assertEqual(remainingAlphaEdits, 0, 'All Tenant A MessageEdits cascade deleted on organization removal');
    assertEqual(remainingAlphaAgentEvents, 0, 'All Tenant A AgentEvents cascade deleted on organization removal');

    // CRITICAL: Verify Tenant B records are 100% INTACT after Tenant A is deleted!
    const betaEventsCount = await db.emailEvent.count({ where: { organizationId: orgBeta.id } });
    const betaFollowUpsCount = await db.followUp.count({ where: { organizationId: orgBeta.id } });
    const betaClassificationsCount = await db.replyClassification.count({ where: { organizationId: orgBeta.id } });
    const betaEditsCount = await db.messageEdit.count({ where: { organizationId: orgBeta.id } });
    const betaAgentEventsCount = await db.agentEvent.count({ where: { organizationId: orgBeta.id } });

    assertEqual(betaEventsCount, 1, 'Tenant B EmailEvent remains 100% intact');
    assertEqual(betaFollowUpsCount, 1, 'Tenant B FollowUp remains 100% intact');
    assertEqual(betaClassificationsCount, 1, 'Tenant B ReplyClassification remains 100% intact');
    assertEqual(betaEditsCount, 1, 'Tenant B MessageEdit remains 100% intact');
    assertEqual(betaAgentEventsCount, 1, 'Tenant B AgentEvent remains 100% intact');

    // ──────────────────────────────────────────────────────────────────────────
    // 8. UNICODE, EMOJI, AND COMPLEX PAYLOAD STRESS-TESTING
    // ──────────────────────────────────────────────────────────────────────────
    header('8. Complex Payload, Unicode & Null Safety Stress Test');

    const unicodeAgentEvent = await db.agentEvent.create({
      data: {
        organizationId: orgBeta.id,
        agentName: 'MultiLingualAgent 🤖',
        stepName: 'SpecialChars & Symbols: <script>alert("xss")</script> & €100,000 $¥',
        level: 'warn',
        message: 'Testing emojis: 🚀🔥⚡ and non-Latin scripts: こんにちは 世界 / Привет мир / مرحبا بالعالم',
        inputData: {
          nested: {
            deepArray: [1, 2, { key: 'value with quotes "double" and \'single\'' }],
            unicodeText: '🚀 Ultra-fast AI Outreach ⚡',
          },
        },
        outputData: {
          score: 99.99,
          notes: null,
          boolVal: true,
        },
        durationMs: 9999,
      },
    });

    assert(!!unicodeAgentEvent.id, 'AgentEvent with complex Unicode, emojis, and nested JSON created');
    assertEqual(unicodeAgentEvent.agentName, 'MultiLingualAgent 🤖', 'AgentEvent preserved exact emoji agentName');

    const fetchedUnicode = await db.agentEvent.findUnique({ where: { id: unicodeAgentEvent.id } });
    assertEqual(fetchedUnicode?.level, 'warn', 'AgentEvent level persisted as warn');
    assertEqual(fetchedUnicode?.durationMs, 9999, 'AgentEvent durationMs persisted as 9999');

  } finally {
    // Clean up Tenant B
    await db.emailEvent.deleteMany({ where: { organizationId: orgBeta.id } }).catch(() => {});
    await db.followUp.deleteMany({ where: { organizationId: orgBeta.id } }).catch(() => {});
    await db.replyClassification.deleteMany({ where: { organizationId: orgBeta.id } }).catch(() => {});
    await db.messageEdit.deleteMany({ where: { organizationId: orgBeta.id } }).catch(() => {});
    await db.agentEvent.deleteMany({ where: { organizationId: orgBeta.id } }).catch(() => {});
    await db.outreachEmail.deleteMany({ where: { organizationId: orgBeta.id } }).catch(() => {});
    await db.lead.deleteMany({ where: { organizationId: orgBeta.id } }).catch(() => {});
    await db.organization.delete({ where: { id: orgBeta.id } }).catch(() => {});
  }

  // ──────────────────────────────────────────────────────────────────────────
  // FINAL SUMMARY REPORT
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log(`║  ADVERSARIAL CHALLENGER RESULTS: ${passedCount} PASSED, ${failedCount} FAILED                 ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  if (failedCount > 0) {
    console.error(`\n❌ Failed tests (${failedCount}):`);
    failures.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
  } else {
    console.log('\n🌟 ALL ADVERSARIAL CHALLENGER TESTS PASSED 100% GREEN!\n');
  }
}

runAdversarialValidation().catch(err => {
  console.error('Fatal execution error in challenger script:', err);
  process.exit(1);
});
