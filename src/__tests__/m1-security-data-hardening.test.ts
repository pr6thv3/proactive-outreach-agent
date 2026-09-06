// ─── Milestone 1: Core Data, Tenant Isolation & Security Hardening Test Suite ───
// Exhaustive test coverage for M1 deliverables:
// 1. Prisma Schema Materialization (EmailEvent, FollowUp, ReplyClassification, MessageEdit, AgentEvent, User.isSuperAdmin)
// 2. Platform Admin Authorization Hardening (requirePlatformAdmin, isSuperAdmin, PLATFORM_ADMIN_SECRET)
// 3. Cryptographic Inbound Webhook Verification (Svix / HMAC timingSafeEqual, Tenant Scoping)
// 4. Endpoint & Cron Security Hardening (/api/admin/health, timing-safe CRON_SECRET, elimination of hardcoded fallback)
// 5. Rate Limiting Integration (IP/identifier checkRateLimit with resetIn)
// 6. Strict Workspace Scoping (requireWorkspace(request))
//
// Run with:
//   cross-env SQLITE_DATABASE_URL=file:./dev.db AUTH_DEV_BYPASS=true tsx src/__tests__/m1-security-data-hardening.test.ts

import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { db } from '../lib/db';
import { requireWorkspace, requireRole, requirePlatformAdmin, ApiAuthError } from '../lib/auth/context';
import { checkRateLimit } from '../lib/redis';
import { POST as handleInboundWebhook } from '../app/api/webhooks/inbound/route';
import { POST as handlePipelineRun } from '../app/api/pipeline/run/route';
import { POST as handleEnrichmentRun } from '../app/api/enrichment/run/route';
import { GET as handleAdminHealth } from '../app/api/admin/health/route';
import { GET as handleAdminTenants } from '../app/api/admin/tenants/route';

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
  if (actual !== expected) {
    assert(false, testName, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else {
    assert(true, testName);
  }
}

function section(name: string): void {
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 68 - name.length))}`);
}

async function runM1HardeningTestSuite() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║   MILESTONE 1: CORE DATA, TENANT ISOLATION & SECURITY HARDENING      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  const testOrgKey = `m1_test_org_${Date.now()}`;
  const testOrg = await db.organization.create({
    data: {
      workspaceKey: testOrgKey,
      name: 'M1 Hardening Test Organization',
      plan: 'enterprise',
      subscriptionStatus: 'active',
    },
  });

  const testSuperUser = await db.user.create({
    data: {
      name: 'Super Admin User',
      email: `superadmin_${Date.now()}@platform.com`,
      isSuperAdmin: true,
    },
  });

  const testStandardUser = await db.user.create({
    data: {
      name: 'Standard Workspace User',
      email: `standard_${Date.now()}@client.com`,
      isSuperAdmin: false,
    },
  });

  const testLead = await db.lead.create({
    data: {
      organizationId: testOrg.id,
      name: 'Jane Doe',
      email: `jane.doe.${Date.now()}@acmesaas.com`,
      company: 'Acme SaaS',
      title: 'VP Engineering',
      status: 'sent',
    },
  });

  const testDomain = await db.sendingDomain.create({
    data: {
      organizationId: testOrg.id,
      domain: `outreach-${Date.now()}.acmesaas.com`,
      fromEmail: `alex@outreach-${Date.now()}.acmesaas.com`,
      fromName: 'Alex',
      status: 'verified',
      dkimVerified: true,
      spfVerified: true,
      dmarcVerified: true,
    },
  });

  const testMessage = await db.outreachMessage.create({
    data: {
      organizationId: testOrg.id,
      leadId: testLead.id,
      subject: 'Streamlining Acme SaaS Infrastructure',
      body: 'Hi Jane, saw your growth...',
      status: 'sent',
      sentAt: new Date(),
    },
  });

  try {
    // ═══════════════════════════════════════════════════════════════════════════
    // 1. PRISMA SCHEMA MATERIALIZATION & DATABASE ACID INTEGRITY
    // ═══════════════════════════════════════════════════════════════════════════
    section('1. Prisma Schema Materialization & Database ACID Integrity');

    // 1.1 EmailEvent
    const emailEvent = await db.emailEvent.create({
      data: {
        organizationId: testOrg.id,
        recipient: testLead.email,
        eventType: 'delivered',
        type: 'delivered',
        messageId: testMessage.id,
        leadId: testLead.id,
        rawData: JSON.stringify({ provider: 'resend', status: 'delivered' }),
      },
    });
    assert(!!emailEvent.id, 'EmailEvent created in real database table');
    assertEqual(emailEvent.eventType, 'delivered', 'EmailEvent eventType persisted');
    assertEqual(emailEvent.organizationId, testOrg.id, 'EmailEvent scoped to organization');

    const emailEventsCount = await db.emailEvent.count({
      where: { organizationId: testOrg.id, messageId: testMessage.id },
    });
    assertEqual(emailEventsCount, 1, 'EmailEvent count query executed cleanly');

    // 1.2 FollowUp
    const followUp = await db.followUp.create({
      data: {
        organizationId: testOrg.id,
        messageId: testMessage.id,
        leadId: testLead.id,
        stepNumber: 1,
        sequencePos: 1,
        scheduledAt: new Date(Date.now() + 3 * 86400000),
        status: 'scheduled',
        type: 'reminder',
        subject: 'Quick follow up regarding Acme',
        body: 'Just bumping this to the top of your inbox...',
      },
    });
    assert(!!followUp.id, 'FollowUp created in real database table');
    assertEqual(followUp.status, 'scheduled', 'FollowUp status scheduled');
    assertEqual(followUp.sequencePos, 1, 'FollowUp sequencePos persisted');

    // 1.3 ReplyClassification
    const classification = await db.replyClassification.create({
      data: {
        organizationId: testOrg.id,
        messageId: testMessage.id,
        leadId: testLead.id,
        category: 'interested',
        confidence: 0.94,
        sentiment: 'positive',
        reasoning: 'Lead expressed high interest in demo next Tuesday',
        replyText: 'Sounds great, would love to see a demo!',
        nextAction: 'escalate',
      },
    });
    assert(!!classification.id, 'ReplyClassification created in real database table');
    assertEqual(classification.category, 'interested', 'ReplyClassification category persisted');
    assertEqual(classification.confidence, 0.94, 'ReplyClassification confidence persisted');

    // 1.4 MessageEdit
    const messageEdit = await db.messageEdit.create({
      data: {
        organizationId: testOrg.id,
        messageId: testMessage.id,
        leadId: testLead.id,
        editType: 'body_changed',
        fieldName: 'body',
        originalValue: 'Original generic pitch',
        editedValue: 'Custom personalized value prop targeting Plaid architecture',
        originalContent: 'Original generic pitch',
        editedContent: 'Custom personalized value prop targeting Plaid architecture',
        changeMagnitude: 0.75,
        addedWords: 8,
        removedWords: 3,
        keptPhrases: JSON.stringify(['targeting Plaid architecture']),
      },
    });
    assert(!!messageEdit.id, 'MessageEdit created in real database table');
    assertEqual(messageEdit.editType, 'body_changed', 'MessageEdit editType persisted');
    assertEqual(messageEdit.changeMagnitude, 0.75, 'MessageEdit changeMagnitude persisted');

    // 1.5 AgentEvent
    const agentEvent = await db.agentEvent.create({
      data: {
        organizationId: testOrg.id,
        leadId: testLead.id,
        agentName: 'ThinkAgent',
        stepName: 'SequenceScoring',
        phase: 'think',
        level: 'info',
        message: 'Calculated ICP match score 88.5',
        status: 'success',
        durationMs: 42,
      },
    });
    assert(!!agentEvent.id, 'AgentEvent created in real database table');
    assertEqual(agentEvent.agentName, 'ThinkAgent', 'AgentEvent agentName persisted');
    assertEqual(agentEvent.durationMs, 42, 'AgentEvent durationMs persisted');

    // 1.6 User isSuperAdmin flag
    assertEqual(testSuperUser.isSuperAdmin, true, 'User isSuperAdmin flag is true for superadmin');
    assertEqual(testStandardUser.isSuperAdmin, false, 'User isSuperAdmin flag is false for standard user');

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. PLATFORM ADMIN AUTHORIZATION HARDENING
    // ═══════════════════════════════════════════════════════════════════════════
    section('2. Platform Admin Authorization Hardening');

    process.env.PLATFORM_ADMIN_SECRET = 'super_secret_platform_token_xyz_987';
    process.env.ADMIN_SECRET = 'legacy_admin_token_456';

    // 2.1 Valid Secret via x-platform-admin-secret header
    const validSecretReq = new NextRequest('http://localhost:3000/api/admin/fleet', {
      headers: { 'x-platform-admin-secret': 'super_secret_platform_token_xyz_987' },
    });
    const secretAdminContext = await requirePlatformAdmin(validSecretReq);
    assertEqual(secretAdminContext.isSuperAdmin, true, 'requirePlatformAdmin succeeds with valid secret header');
    assertEqual(secretAdminContext.userId, 'platform_admin', 'Secret context mapped to platform_admin');

    // 2.2 Valid Secret via Bearer authorization header
    const validBearerReq = new NextRequest('http://localhost:3000/api/admin/fleet', {
      headers: { 'authorization': 'Bearer super_secret_platform_token_xyz_987' },
    });
    const bearerAdminContext = await requirePlatformAdmin(validBearerReq);
    assertEqual(bearerAdminContext.isSuperAdmin, true, 'requirePlatformAdmin succeeds with valid Bearer token');

    // 2.3 Invalid Secret rejected
    const invalidSecretReq = new NextRequest('http://localhost:3000/api/admin/fleet', {
      headers: { 'x-platform-admin-secret': 'attacker_wrong_secret_123' },
    });
    let invalidSecretThrew = false;
    try {
      await requirePlatformAdmin(invalidSecretReq);
    } catch (err: any) {
      invalidSecretThrew = true;
      assertEqual(err.statusCode, 401, 'Invalid secret returns 401');
    }
    assert(invalidSecretThrew, 'requirePlatformAdmin rejects invalid secret header');

    // 2.4 Admin endpoints enforce requirePlatformAdmin
    const adminHealthRes = await handleAdminHealth(validSecretReq);
    assertEqual(adminHealthRes.status, 200, 'GET /api/admin/health accepts valid platform admin');

    const adminTenantsRes = await handleAdminTenants(validSecretReq);
    assertEqual(adminTenantsRes.status, 200, 'GET /api/admin/tenants accepts valid platform admin');

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. CRYPTOGRAPHIC INBOUND WEBHOOK VERIFICATION & SCOPED RESOLUTION
    // ═══════════════════════════════════════════════════════════════════════════
    section('3. Cryptographic Inbound Webhook Verification & Scoped Resolution');

    const webhookSecret = 'whsec_test_svix_key_0123456789abcdef';
    process.env.RESEND_WEBHOOK_SECRET = webhookSecret;

    const webhookPayload = JSON.stringify({
      from: `Jane Doe <${testLead.email}>`,
      to: [`alex@${testDomain.domain}`],
      subject: 'Re: Streamlining Acme SaaS Infrastructure',
      text: 'Thanks for reaching out! Let us schedule a conversation for next Tuesday.',
      headers: {
        'In-Reply-To': testMessage.id,
      },
    });

    const msgId = `msg_svix_${Date.now()}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const cleanSecret = webhookSecret.slice(6);
    const secretBytes = Buffer.from(cleanSecret, 'base64').length > 0 ? Buffer.from(cleanSecret, 'base64') : Buffer.from(webhookSecret);
    const expectedSig = crypto
      .createHmac('sha256', secretBytes)
      .update(`${msgId}.${timestamp}.${webhookPayload}`)
      .digest('base64');

    // 3.1 Valid Signed Inbound Webhook
    const validWebhookReq = new NextRequest('http://localhost:3000/api/webhooks/inbound', {
      method: 'POST',
      body: webhookPayload,
      headers: {
        'content-type': 'application/json',
        'svix-id': msgId,
        'svix-timestamp': timestamp,
        'svix-signature': `v1,${expectedSig}`,
      },
    });

    const webhookResponse = await handleInboundWebhook(validWebhookReq);
    assertEqual(webhookResponse.status, 200, 'Signed inbound webhook accepted with 200 OK');
    const webhookJson = await webhookResponse.json();
    assertEqual(webhookJson.data.matched, true, 'Inbound webhook matched lead and message');
    assertEqual(webhookJson.data.organizationId, testOrg.id, 'Inbound webhook scoped to tenant organization');

    // Verify lead status updated to replied
    const updatedLead = await db.lead.findUnique({ where: { id: testLead.id } });
    assertEqual(updatedLead?.status, 'replied', 'Lead status transitioned to replied');

    // 3.2 Forged / Tampered Webhook Payload Rejected
    const forgedWebhookReq = new NextRequest('http://localhost:3000/api/webhooks/inbound', {
      method: 'POST',
      body: webhookPayload + '{"tampered": true}',
      headers: {
        'content-type': 'application/json',
        'svix-id': msgId,
        'svix-timestamp': timestamp,
        'svix-signature': `v1,${expectedSig}`,
      },
    });

    const forgedRes = await handleInboundWebhook(forgedWebhookReq);
    assertEqual(forgedRes.status, 401, 'Forged/tampered webhook rejected with 401');

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. PUBLIC ENDPOINT & CRON SECURITY HARDENING
    // ═══════════════════════════════════════════════════════════════════════════
    section('4. Public Endpoint & Cron Security Hardening');

    process.env.CRON_SECRET = 'cron_production_secret_key_8899';

    // 4.1 Valid CRON_SECRET on pipeline run
    const validCronReq = new NextRequest('http://localhost:3000/api/pipeline/run', {
      method: 'POST',
      headers: { 'authorization': 'Bearer cron_production_secret_key_8899' },
    });
    const cronPipelineRes = await handlePipelineRun(validCronReq);
    assertEqual(cronPipelineRes.status, 200, 'POST /api/pipeline/run authorized with valid CRON_SECRET');

    // 4.2 Old hardcoded fallback secret rejected
    const oldHardcodedCronReq = new NextRequest('http://localhost:3000/api/pipeline/run', {
      method: 'POST',
      headers: { 'authorization': 'Bearer cron_secret_key_12345' },
    });
    const oldCronRes = await handlePipelineRun(oldHardcodedCronReq);
    assertEqual(oldCronRes.status, 401, 'POST /api/pipeline/run strictly rejects legacy hardcoded fallback');

    // 4.3 Enrichment run with valid secret
    const validEnrichCronReq = new NextRequest('http://localhost:3000/api/enrichment/run', {
      method: 'POST',
      headers: { 'authorization': 'Bearer cron_production_secret_key_8899' },
    });
    const enrichCronRes = await handleEnrichmentRun(validEnrichCronReq);
    assertEqual(enrichCronRes.status, 200, 'POST /api/enrichment/run authorized with valid CRON_SECRET');

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. RATE LIMITING ENFORCEMENT & RESET TRACKING
    // ═══════════════════════════════════════════════════════════════════════════
    section('5. Rate Limiting Enforcement & Reset Tracking');

    const rateKey = `test_rate_key_${Date.now()}`;
    const rl1 = await checkRateLimit(rateKey, 3, 60);
    assertEqual(rl1.allowed, true, 'Attempt 1 is allowed');
    assertEqual(rl1.remaining, 2, 'Remaining attempts is 2');
    assert(rl1.resetIn > 0 && rl1.resetIn <= 60, 'resetIn seconds reported');

    const rl2 = await checkRateLimit(rateKey, 3, 60);
    assertEqual(rl2.allowed, true, 'Attempt 2 is allowed');
    assertEqual(rl2.remaining, 1, 'Remaining attempts is 1');

    const rl3 = await checkRateLimit(rateKey, 3, 60);
    assertEqual(rl3.allowed, true, 'Attempt 3 is allowed');
    assertEqual(rl3.remaining, 0, 'Remaining attempts is 0');

    const rl4 = await checkRateLimit(rateKey, 3, 60);
    assertEqual(rl4.allowed, false, 'Attempt 4 exceeds threshold and is blocked');
    assertEqual(rl4.remaining, 0, 'Remaining is 0 when blocked');

    // ═══════════════════════════════════════════════════════════════════════════
    // 6. STRICT WORKSPACE PARAMETER SCOPING
    // ═══════════════════════════════════════════════════════════════════════════
    section('6. Strict Workspace Parameter Scoping');

    const apiKeyRaw = `key_${Date.now()}_secret123`;
    const keyHash = crypto.createHash('sha256').update(apiKeyRaw).digest('hex');

    await db.apiKey.create({
      data: {
        organizationId: testOrg.id,
        name: 'M1 Verification API Key',
        keyHash,
        scopes: JSON.stringify(['read', 'write']),
      },
    });

    const apiKeyRequest = new NextRequest('http://localhost:3000/api/leads', {
      headers: { 'x-api-key': apiKeyRaw },
    });

    const scopedContext = await requireWorkspace(apiKeyRequest);
    assertEqual(scopedContext.organizationId, testOrg.id, 'requireWorkspace extracts X-API-Key and scopes to correct org');
    assertEqual(scopedContext.isApiKey, true, 'requireWorkspace recognizes API Key auth');

  } finally {
    // Cleanup test data
    await db.emailEvent.deleteMany({ where: { organizationId: testOrg.id } }).catch(() => {});
    await db.followUp.deleteMany({ where: { organizationId: testOrg.id } }).catch(() => {});
    await db.replyClassification.deleteMany({ where: { organizationId: testOrg.id } }).catch(() => {});
    await db.messageEdit.deleteMany({ where: { organizationId: testOrg.id } }).catch(() => {});
    await db.agentEvent.deleteMany({ where: { organizationId: testOrg.id } }).catch(() => {});
    await db.activity.deleteMany({ where: { organizationId: testOrg.id } }).catch(() => {});
    await db.outreachMessage.deleteMany({ where: { organizationId: testOrg.id } }).catch(() => {});
    await db.sendingDomain.deleteMany({ where: { organizationId: testOrg.id } }).catch(() => {});
    await db.apiKey.deleteMany({ where: { organizationId: testOrg.id } }).catch(() => {});
    await db.lead.deleteMany({ where: { organizationId: testOrg.id } }).catch(() => {});
    await db.organization.delete({ where: { id: testOrg.id } }).catch(() => {});
    await db.user.delete({ where: { id: testSuperUser.id } }).catch(() => {});
    await db.user.delete({ where: { id: testStandardUser.id } }).catch(() => {});
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY REPORT
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log(`║  MILESTONE 1 TEST RESULTS: ${passed} PASSED, ${failed} FAILED                       ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  if (failed > 0) {
    console.error(`\n❌ Failed tests (${failed}):`);
    failures.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
  } else {
    console.log('\n🎉 ALL MILESTONE 1 TESTS PASSED 100% GREEN!\n');
  }
}

runM1HardeningTestSuite().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
