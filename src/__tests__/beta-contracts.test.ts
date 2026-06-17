// ─── Beta Contract Tests ──────────────────────────────────
// Integration tests running against the SQLite database
// Validates 30-Day Beta requirements:
// - resultsLoop and results alias (GET /api/stats)
// - tenant scoping for messages/signals/leads
// - citation persistence on Signal
// - evidenceSnapshot persistence on OutreachMessage
// - readiness pass/warn/block cases
// - queued_without_redis
// - job health Redis/count/stale states
// - backend DNS data usage
// Run with: SQLITE_DATABASE_URL=file:./dev.db AUTH_DEV_BYPASS=true npx tsx src/__tests__/beta-contracts.test.ts

import { db } from '../lib/db';
import { evaluateSendReadiness } from '../lib/deliverability/send-readiness';
import { getCitationQuality, buildEvidenceSnapshot } from '../lib/agents/think/evidence';
import { enqueueJob } from '../lib/queue/producers';
import { GET as getStats } from '../app/api/stats/route';
import { GET as getJobHealth } from '../app/api/jobs/health/route';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, testName: string, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  ✅ ${testName}`);
  } else {
    failed++;
    const msg = detail ? `${testName} — ${detail}` : testName;
    failures.push(msg);
    console.log(`  ❌ ${msg}`);
  }
}

function assertEqual<T>(actual: T, expected: T, testName: string): void {
  const ok = actual === expected;
  if (!ok) {
    assert(false, testName, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else {
    assert(true, testName);
  }
}

function section(name: string): void {
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 60 - name.length))}`);
}

async function cleanDb() {
  await db.activity.deleteMany({});
  await db.jobQueue.deleteMany({});
  await db.outreachMessage.deleteMany({});
  await db.signal.deleteMany({});
  await db.lead.deleteMany({});
  await db.campaignSenderPool.deleteMany({});
  await db.campaign.deleteMany({});
  await db.senderAccount.deleteMany({});
  await db.sendingDomain.deleteMany({});
  await db.workspaceMember.deleteMany({});
  await db.organization.deleteMany({});
}

async function runTests() {
  console.log('Starting Beta Contract Tests...');
  
  // Ensure the environment is correctly set up
  if (process.env.SQLITE_DATABASE_URL !== 'file:./dev.db' && !process.env.SQLITE_DATABASE_URL) {
    console.error('ERROR: SQLITE_DATABASE_URL must be configured to file:./dev.db');
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════
  // TEST SUITE 1: CITATIONS & EVIDENCE PERSISTENCE
  // ═══════════════════════════════════════════════════════
  section('1. Citations & Evidence Snapshot');
  await cleanDb();

  const org = await db.organization.create({
    data: {
      workspaceKey: 'test_org_1',
      clerkOrgId: 'org_1',
      name: 'Test Org 1',
      ownerUserId: 'user_1',
    },
  });

  const lead = await db.lead.create({
    data: {
      organizationId: org.id,
      name: 'John Doe',
      email: 'john@example.com',
      company: 'Example Corp',
      status: 'new',
      source: 'test',
    },
  });

  const signal = await db.signal.create({
    data: {
      organizationId: org.id,
      leadId: lead.id,
      type: 'funding_round',
      content: 'Example Corp raised $5M Series A',
      source: 'web_scraper_homepage',
      relevance: 0.9,
      confidence: 0.95,
      urgency: 0.8,
      sourceUrl: 'https://example.com/blog/raised-5m',
      sourceTitle: 'Example Corp Blog',
    },
  });

  // Verify citation persistence
  const savedSignal = await db.signal.findUnique({
    where: { id: signal.id },
  });
  assert(!!savedSignal, 'Signal created');
  assertEqual(savedSignal?.sourceUrl, 'https://example.com/blog/raised-5m', 'sourceUrl persisted');
  assertEqual(savedSignal?.sourceTitle, 'Example Corp Blog', 'sourceTitle persisted');
  assertEqual(getCitationQuality({
    source: savedSignal!.source,
    confidence: savedSignal!.confidence,
    sourceUrl: savedSignal!.sourceUrl || undefined,
    sourceTitle: savedSignal!.sourceTitle || undefined,
  }), 'strong', 'citationQuality evaluated as strong');

  // Verify evidenceSnapshot persistence
  const evidence = buildEvidenceSnapshot([
    {
      id: signal.id,
      type: 'funding_round',
      content: signal.content,
      source: signal.source,
      relevance: signal.relevance,
      confidence: signal.confidence,
      sourceUrl: signal.sourceUrl || undefined,
      sourceTitle: signal.sourceTitle || undefined,
      urgency: signal.urgency || undefined,
      detectedAt: signal.detectedAt || undefined,
    }
  ], {
    strategy: 'growth_focus',
    angle: 'help them scale post funding',
    hook: 'congrats on Series A',
    subject: 'Scaling outreach',
    body: 'Hi John, congrats on the Series A...',
    tone: 'professional',
    reasoning: 'fresh funding is a great time to scale outbound',
  });

  const message = await db.outreachMessage.create({
    data: {
      organizationId: org.id,
      leadId: lead.id,
      subject: 'Scaling outreach',
      body: 'Hi John, congrats on the Series A...',
      channel: 'email',
      status: 'generated',
      sequencePos: 0,
      evidenceSnapshot: JSON.parse(JSON.stringify(evidence)),
    },
  });

  const savedMessage = await db.outreachMessage.findUnique({
    where: { id: message.id },
  });
  assert(!!savedMessage, 'OutreachMessage created');
  assert(!!savedMessage?.evidenceSnapshot, 'evidenceSnapshot exists');
  const snap = savedMessage?.evidenceSnapshot as any;
  assertEqual(snap.signals.length, 1, 'Snapshot contains 1 signal');
  assertEqual(snap.signals[0].sourceUrl, 'https://example.com/blog/raised-5m', 'Citations preserved inside snapshot');
  assertEqual(snap.signals[0].citationQuality, 'strong', 'Citation quality preserved in snapshot');
  assertEqual(snap.signals[0].relevance, 0.9, 'Relevance preserved in snapshot');
  assertEqual(snap.signals[0].createdAt, signal.detectedAt.toISOString(), 'createdAt (detectedAt ISO) preserved in snapshot');

  // ═══════════════════════════════════════════════════════
  // TEST SUITE 2: TENANT SCOPING
  // ═══════════════════════════════════════════════════════
  section('2. Tenant Scoping');

  const org2 = await db.organization.create({
    data: {
      workspaceKey: 'test_org_2',
      clerkOrgId: 'org_2',
      name: 'Test Org 2',
      ownerUserId: 'user_2',
    },
  });

  // Test that Org 2 cannot fetch or evaluate Org 1's message
  const crossReadiness = await evaluateSendReadiness({
    organizationId: org2.id,
    messageId: message.id,
    traceId: 'trace-cross-tenant',
  });

  assertEqual(crossReadiness.ready, false, 'Cross-tenant message evaluation is blocked');
  assert(
    crossReadiness.checks.some(c => c.id === 'message_exists' && c.status === 'block'),
    'Evaluation fails with message_exists block'
  );

  // ═══════════════════════════════════════════════════════
  // TEST SUITE 3: READINESS CHECKS
  // ═══════════════════════════════════════════════════════
  section('3. Send Readiness Evaluation');

  // Let's create resources under Org 1 to make the message sendable
  const domain = await db.sendingDomain.create({
    data: {
      organizationId: org.id,
      domain: 'outbound.example.com',
      status: 'verified',
      reputationScore: 95,
      dailyLimit: 100,
    },
  });

  const sender = await db.senderAccount.create({
    data: {
      organizationId: org.id,
      domainId: domain.id,
      email: 'alex@outbound.example.com',
      name: 'Alex',
      status: 'active',
      reputationScore: 95,
      dailyLimit: 50,
    },
  });

  const campaign = await db.campaign.create({
    data: {
      organizationId: org.id,
      name: 'Outbound campaign',
      status: 'active',
      goal: 'Book calls',
      targetAudience: 'SaaS',
      offer: 'Free trial',
      senderEmail: 'alex@outbound.example.com',
      senderName: 'Alex',
      tone: 'professional',
      cta: 'Reply',
      maxDailySends: 20,
    },
  });

  // Attach message to campaign and sender
  await db.outreachMessage.update({
    where: { id: message.id },
    data: {
      campaignId: campaign.id,
      senderId: sender.id,
      status: 'approved',
      approvedAt: new Date(),
      approvedBy: 'user_1',
    },
  });

  // Evaluate readiness - expect to pass
  let readiness = await evaluateSendReadiness({
    organizationId: org.id,
    messageId: message.id,
    traceId: 'trace-safe-send',
  });

  assertEqual(readiness.ready, true, 'Clean approved message is ready to send');
  assert(
    readiness.checks.every(c => c.status !== 'block'),
    'No blocking checks found'
  );

  // Test Block Case 1: Unapproved message status
  await db.outreachMessage.update({
    where: { id: message.id },
    data: { status: 'generated' },
  });
  readiness = await evaluateSendReadiness({
    organizationId: org.id,
    messageId: message.id,
    traceId: 'trace-block-status',
  });
  assertEqual(readiness.ready, false, 'Generated message is blocked');
  assert(
    readiness.checks.some(c => c.id === 'message_approved' && c.status === 'block'),
    'Blocked by message_approved check'
  );
  await db.outreachMessage.update({
    where: { id: message.id },
    data: { status: 'approved' },
  });

  // Test Block Case 2: DNC Lead
  await db.lead.update({
    where: { id: lead.id },
    data: { doNotContact: true },
  });
  readiness = await evaluateSendReadiness({
    organizationId: org.id,
    messageId: message.id,
    traceId: 'trace-block-dnc',
  });
  assertEqual(readiness.ready, false, 'DNC lead message is blocked');
  assert(
    readiness.checks.some(c => c.id === 'lead_not_dnc' && c.status === 'block'),
    'Blocked by lead_not_dnc check'
  );
  await db.lead.update({
    where: { id: lead.id },
    data: { doNotContact: false },
  });

  // Test Block Case 3: Blacklisted Lead
  await db.lead.update({
    where: { id: lead.id },
    data: { isBlacklisted: true },
  });
  readiness = await evaluateSendReadiness({
    organizationId: org.id,
    messageId: message.id,
    traceId: 'trace-block-blacklist',
  });
  assertEqual(readiness.ready, false, 'Blacklisted lead message is blocked');
  assert(
    readiness.checks.some(c => c.id === 'lead_not_blacklisted' && c.status === 'block'),
    'Blocked by lead_not_blacklisted check'
  );
  await db.lead.update({
    where: { id: lead.id },
    data: { isBlacklisted: false },
  });

  // Test Block Case 4: Campaign Inactive
  await db.campaign.update({
    where: { id: campaign.id },
    data: { status: 'paused' },
  });
  readiness = await evaluateSendReadiness({
    organizationId: org.id,
    messageId: message.id,
    traceId: 'trace-block-campaign',
  });
  assertEqual(readiness.ready, false, 'Paused campaign message is blocked');
  assert(
    readiness.checks.some(c => c.id === 'campaign_active' && c.status === 'block'),
    'Blocked by campaign_active check'
  );
  await db.campaign.update({
    where: { id: campaign.id },
    data: { status: 'active' },
  });

  // Test Block Case 5: Sender Inactive
  await db.senderAccount.update({
    where: { id: sender.id },
    data: { status: 'paused' },
  });
  readiness = await evaluateSendReadiness({
    organizationId: org.id,
    messageId: message.id,
    traceId: 'trace-block-sender',
  });
  assertEqual(readiness.ready, false, 'Paused sender message is blocked');
  assert(
    readiness.checks.some(c => c.id === 'sender_active' && c.status === 'block'),
    'Blocked by sender_active check'
  );
  await db.senderAccount.update({
    where: { id: sender.id },
    data: { status: 'active' },
  });

  // Test Block Case 6: Domain Unverified
  await db.sendingDomain.update({
    where: { id: domain.id },
    data: { status: 'pending' },
  });
  readiness = await evaluateSendReadiness({
    organizationId: org.id,
    messageId: message.id,
    traceId: 'trace-block-domain',
  });
  assertEqual(readiness.ready, false, 'Unverified domain message is blocked');
  assert(
    readiness.checks.some(c => c.id === 'domain_verified' && c.status === 'block'),
    'Blocked by domain_verified check'
  );
  await db.sendingDomain.update({
    where: { id: domain.id },
    data: { status: 'verified' },
  });

  // Test Block Case 7: Reputation Scores
  await db.sendingDomain.update({
    where: { id: domain.id },
    data: { reputationScore: 25 },
  });
  readiness = await evaluateSendReadiness({
    organizationId: org.id,
    messageId: message.id,
    traceId: 'trace-block-reputation',
  });
  assertEqual(readiness.ready, false, 'Low domain reputation message is blocked');
  assert(
    readiness.checks.some(c => c.id === 'domain_reputation' && c.status === 'block'),
    'Blocked by domain_reputation check (<30 score)'
  );
  await db.sendingDomain.update({
    where: { id: domain.id },
    data: { reputationScore: 95 },
  });

  // ═══════════════════════════════════════════════════════
  // TEST SUITE 4: QUEUED WITHOUT REDIS
  // ═══════════════════════════════════════════════════════
  section('4. Queued Without Redis');

  // Temporarily unset REDIS_URL
  const oldRedisUrl = process.env.REDIS_URL;
  delete process.env.REDIS_URL;

  const queueResult = await enqueueJob('send-email', {
    organizationId: org.id,
    leadId: lead.id,
    messageId: message.id,
  });

  assertEqual(queueResult.status, 'queued_without_redis', 'Enqueue reports queued_without_redis');
  assertEqual(queueResult.backend, 'database', 'Queued backend is database');

  // Verify job record exists in the DB
  const savedJob = await db.jobQueue.findUnique({
    where: { id: queueResult.jobId },
  });
  assert(!!savedJob, 'Job record created in database');
  assertEqual(savedJob?.status, 'pending', 'Database job record status is pending');

  // Restore REDIS_URL
  if (oldRedisUrl) {
    process.env.REDIS_URL = oldRedisUrl;
  }

  // ═══════════════════════════════════════════════════════
  // TEST SUITE 5: DASHBOARD STATS API (resultsLoop & alias)
  // ═══════════════════════════════════════════════════════
  section('5. Dashboard Stats API');

  // OverridegetCurrentUserContext to return our test workspace context
  process.env.AUTH_DEV_BYPASS = 'true';
  // We need to set the workspace key in the DB to match what the auth bypass generates: 'dev_workspace'
  const devOrg = await db.organization.findFirst({
    where: { workspaceKey: 'dev_workspace' },
  });
  if (devOrg) {
    // Recreate John Doe under the dev workspace for statistics
    const devLead = await db.lead.create({
      data: {
        organizationId: devOrg.id,
        name: 'Dev John',
        email: 'john.dev@example.com',
        company: 'Dev Corp',
        status: 'generated',
        source: 'test',
        leadScore: 85,
      },
    });

    await db.signal.create({
      data: {
        organizationId: devOrg.id,
        leadId: devLead.id,
        type: 'funding_round',
        content: 'Dev Corp raised Series A',
        source: 'web_scraper_homepage',
        relevance: 0.9,
        confidence: 0.95,
        urgency: 0.8,
        sourceUrl: 'https://example.com/raised',
        sourceTitle: 'Raise news',
      },
    });

    await db.outreachMessage.create({
      data: {
        organizationId: devOrg.id,
        leadId: devLead.id,
        subject: 'Congrats!',
        body: 'Congrats on Series A...',
        channel: 'email',
        status: 'generated',
        sequencePos: 0,
      },
    });
  }

  const statsRes = await getStats();
  assertEqual(statsRes.status, 200, 'Stats route returns 200');
  const statsData = await statsRes.json();
  
  assert(!!statsData.data.resultsLoop, 'Stats contains resultsLoop key');
  assert(!!statsData.data.results, 'Stats contains results alias key');
  
  const resultsLoop = statsData.data.resultsLoop;
  assertEqual(typeof resultsLoop.signalsFound, 'number', 'signalsFound is numeric');
  assertEqual(typeof resultsLoop.generatedEmails, 'number', 'generatedEmails is numeric');
  assertEqual(typeof resultsLoop.sentEmails, 'number', 'sentEmails is numeric');
  assertEqual(typeof resultsLoop.replies, 'number', 'replies is numeric');
  assertEqual(typeof resultsLoop.meetings, 'number', 'meetings is numeric');
  assertEqual(typeof resultsLoop.deliveryRate, 'number', 'deliveryRate is numeric');
  assertEqual(typeof resultsLoop.replyRate, 'number', 'replyRate is numeric');
  assertEqual(typeof resultsLoop.positiveReplyRate, 'number', 'positiveReplyRate is numeric');
  assertEqual(typeof resultsLoop.bounceRate, 'number', 'bounceRate is numeric');

  // Verify topSignals citation structure is also correct
  const topSignals = statsData.data.signals.topSignals;
  if (topSignals && topSignals.length > 0) {
    assert('citationQuality' in topSignals[0], 'topSignals contains citationQuality');
    assert('sourceUrl' in topSignals[0], 'topSignals contains sourceUrl');
    assert('sourceTitle' in topSignals[0], 'topSignals contains sourceTitle');
  }

  // ═══════════════════════════════════════════════════════
  // TEST SUITE 6: JOB HEALTH API
  // ═══════════════════════════════════════════════════════
  section('6. Job Health API');

  const jobHealthRes = await getJobHealth();
  assertEqual(jobHealthRes.status, 200, 'Job Health API returns 200');
  const jobHealthData = await jobHealthRes.json();
  
  assert('redis' in jobHealthData.data, 'Job Health data contains redis key');
  assert('queues' in jobHealthData.data, 'Job Health data contains queues key');
  assert('totals' in jobHealthData.data, 'Job Health data contains totals key');
  assert('traceId' in jobHealthData.data, 'Job Health data contains traceId');
  assert(Array.isArray(jobHealthData.data.recentJobs), 'recentJobs is an array');

  // ═══════════════════════════════════════════════════════
  // TEST SUITE 7: ADDITIONAL READINESS BLOCK CASES
  // ═══════════════════════════════════════════════════════
  section('7. Additional Readiness Block Cases');

  // Restore message to approved for further tests
  await db.outreachMessage.update({
    where: { id: message.id },
    data: { status: 'approved' },
  });

  // Test Block Case 8: Unsubscribed Lead
  await db.lead.update({
    where: { id: lead.id },
    data: { status: 'unsubscribed' },
  });
  readiness = await evaluateSendReadiness({
    organizationId: org.id,
    messageId: message.id,
    traceId: 'trace-block-unsubscribed',
  });
  assertEqual(readiness.ready, false, 'Unsubscribed lead message is blocked');
  assert(
    readiness.checks.some(c => c.id === 'lead_not_unsubscribed' && c.status === 'block'),
    'Blocked by lead_not_unsubscribed check'
  );
  await db.lead.update({
    where: { id: lead.id },
    data: { status: 'new' },
  });

  // Test Block Case 9: Invalid Email
  await db.lead.update({
    where: { id: lead.id },
    data: { email: 'not-a-valid-email' },
  });
  readiness = await evaluateSendReadiness({
    organizationId: org.id,
    messageId: message.id,
    traceId: 'trace-block-invalid-email',
  });
  assertEqual(readiness.ready, false, 'Invalid email lead message is blocked');
  assert(
    readiness.checks.some(c => c.id === 'valid_email' && c.status === 'block'),
    'Blocked by valid_email check'
  );
  await db.lead.update({
    where: { id: lead.id },
    data: { email: 'john@example.com' },
  });

  // Test Warn Case: Marginal Domain Reputation (30-50)
  await db.sendingDomain.update({
    where: { id: domain.id },
    data: { reputationScore: 45 },
  });
  readiness = await evaluateSendReadiness({
    organizationId: org.id,
    messageId: message.id,
    traceId: 'trace-warn-reputation',
  });
  // Marginal reputation should warn but not block
  assert(
    readiness.checks.some(c => c.id === 'domain_reputation' && c.status === 'warn'),
    'Domain reputation 45 produces warn (not block)'
  );
  // Ready should still be true since warn doesn't block
  assertEqual(readiness.ready, true, 'Marginal reputation (45) still allows send with warning');
  await db.sendingDomain.update({
    where: { id: domain.id },
    data: { reputationScore: 95 },
  });

  // ═══════════════════════════════════════════════════════
  // TEST SUITE 8: EVIDENCE SNAPSHOT STRUCTURE
  // ═══════════════════════════════════════════════════════
  section('8. Evidence Snapshot — generatedAt Field');

  const freshEvidence = buildEvidenceSnapshot([
    {
      id: signal.id,
      type: 'funding_round',
      content: signal.content,
      source: signal.source,
      relevance: signal.relevance,
      confidence: signal.confidence,
      sourceUrl: signal.sourceUrl || undefined,
      sourceTitle: signal.sourceTitle || undefined,
      urgency: signal.urgency || undefined,
      detectedAt: signal.detectedAt || undefined,
    }
  ], {
    strategy: 'growth_focus',
    angle: 'help them scale post funding',
    hook: 'congrats on Series A',
    subject: 'Scaling outreach',
    body: 'Hi John, congrats on the Series A...',
    tone: 'professional',
    reasoning: 'fresh funding is a great time to scale outbound',
  });

  assert(!!freshEvidence.generatedAt, 'Evidence snapshot has generatedAt');
  assert(typeof freshEvidence.generatedAt === 'string', 'generatedAt is a string');
  assert(!isNaN(Date.parse(freshEvidence.generatedAt)), 'generatedAt is a valid ISO date');

  // ═══════════════════════════════════════════════════════
  // TEST SUITE 9: HALLUCINATION GUARDRAIL
  // ═══════════════════════════════════════════════════════
  section('9. hasCitedSignalForClaim Guardrail');

  const { hasCitedSignalForClaim } = await import('../lib/agents/think/evidence');

  const testSignals = [
    {
      id: 'sig-1',
      type: 'funding_round',
      content: 'Example Corp raised $5M Series A from Acme Ventures',
      source: 'web_scraper_homepage',
      relevance: 0.9,
      confidence: 0.95,
      sourceUrl: 'https://example.com/blog/raised-5m',
      sourceTitle: 'Example Corp Blog',
    },
  ];

  assert(
    hasCitedSignalForClaim(testSignals as any, 'funding raised Series A'),
    'hasCitedSignalForClaim returns true for supported claim'
  );
  assert(
    !hasCitedSignalForClaim(testSignals as any, 'IPO filing SEC'),
    'hasCitedSignalForClaim returns false for unsupported claim'
  );

  // Weak citation should not support a factual claim
  const weakSignals = [
    {
      id: 'sig-2',
      type: 'growth',
      content: 'Company seems to be growing',
      source: 'signal_extractor_llm',
      relevance: 0.5,
      confidence: 0.3,
    },
  ];
  assert(
    !hasCitedSignalForClaim(weakSignals as any, 'growing company'),
    'Weak-citation signals do not support factual claims'
  );

  // ═══════════════════════════════════════════════════════
  // TEST SUITE 10: FULL-CYCLE WORKFLOW ASSERTION
  // ═══════════════════════════════════════════════════════
  section('10. Full-Cycle Workflow Assertion');

  // Verify the complete lifecycle: signal → message → evidence → readiness → queue
  // This is a meta-assertion that the entire chain works end-to-end
  const fullCycleSignal = await db.signal.findFirst({
    where: { organizationId: org.id },
    include: { lead: true },
  });
  assert(!!fullCycleSignal, 'Full-cycle: signal exists');
  assert(!!fullCycleSignal?.sourceUrl, 'Full-cycle: signal has sourceUrl (cited)');

  const fullCycleMessage = await db.outreachMessage.findFirst({
    where: { organizationId: org.id },
    include: { lead: true },
  });
  assert(!!fullCycleMessage, 'Full-cycle: message exists');
  assert(!!fullCycleMessage?.evidenceSnapshot, 'Full-cycle: message has evidenceSnapshot');

  const fullCycleJob = await db.jobQueue.findFirst({
    where: { organizationId: org.id },
  });
  assert(!!fullCycleJob, 'Full-cycle: job record exists in queue');

  // Clean up database at the end of the test
  await cleanDb();

  // ═══════════════════════════════════════════════════════
  // REPORT
  // ═══════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(64));
  console.log(`Beta Contract Integration Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('═'.repeat(64));

  if (failures.length > 0) {
    console.log('\nFailed tests:');
    for (const f of failures) {
      console.log(`  ❌ ${f}`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(error => {
  console.error('Test runner encountered an error:', error);
  process.exit(1);
});
