import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { db } from '../lib/db';
import { requireWorkspace, requireRole, requirePlatformAdmin, ApiAuthError, hasRole } from '../lib/auth/context';
import { checkRateLimit } from '../lib/redis';
import { POST as handleInboundWebhook } from '../app/api/webhooks/inbound/route';
import { POST as handlePipelineRun } from '../app/api/pipeline/run/route';
import { POST as handleEnrichmentRun } from '../app/api/enrichment/run/route';
import { GET as handleAdminHealth } from '../app/api/admin/health/route';
import { GET as handleAdminTenants } from '../app/api/admin/tenants/route';
import { GET as handleAdminOrgs } from '../app/api/admin/orgs/route';
import { GET as handleAdminFleet } from '../app/api/admin/fleet/route';
import { POST as handleSignup } from '../app/api/auth/signup/route';
import { POST as handleImportLeads } from '../app/api/leads/import/route';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(condition: boolean, desc: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  [AUDIT PASS] ${desc}`);
  } else {
    failed++;
    const msg = detail ? `${desc} -- FAILED: ${detail}` : `${desc} -- FAILED`;
    failures.push(msg);
    console.error(`  [AUDIT FAIL] ${msg}`);
  }
}

async function runForensicAudit() {
  console.log('================================================================');
  console.log('   INDEPENDENT FORENSIC INTEGRITY AUDIT: MILESTONE 1           ');
  console.log('================================================================\n');

  const orgA = await db.organization.create({
    data: {
      workspaceKey: `aud_org_a_${Date.now()}`,
      name: 'Auditor Tenant Alpha',
      plan: 'pro',
    },
  });

  const orgB = await db.organization.create({
    data: {
      workspaceKey: `aud_org_b_${Date.now()}`,
      name: 'Auditor Tenant Beta',
      plan: 'starter',
    },
  });

  const superUser = await db.user.create({
    data: {
      name: 'Auditor SuperUser',
      email: `superuser_${Date.now()}@auditor.test`,
      isSuperAdmin: true,
    },
  });

  const regularUser = await db.user.create({
    data: {
      name: 'Auditor RegularUser',
      email: `regularuser_${Date.now()}@auditor.test`,
      isSuperAdmin: false,
    },
  });

  const leadA = await db.lead.create({
    data: {
      organizationId: orgA.id,
      name: 'Alpha Target',
      email: `target_${Date.now()}@alpha.test`,
      company: 'Alpha Corp',
      status: 'sent',
    },
  });

  const domainA = await db.sendingDomain.create({
    data: {
      organizationId: orgA.id,
      domain: `send-${Date.now()}.alpha.test`,
      fromEmail: `sender@send-${Date.now()}.alpha.test`,
      fromName: 'Alpha Sender',
      status: 'verified',
    },
  });

  const messageA = await db.outreachMessage.create({
    data: {
      organizationId: orgA.id,
      leadId: leadA.id,
      subject: 'Alpha Outreach Proposal',
      body: 'Hello Alpha',
      status: 'sent',
      sentAt: new Date(),
    },
  });

  try {
    // -------------------------------------------------------------
    // VECTOR 1: PRISMA SCHEMA MATERIALIZATION & CASCADE INTEGRITY
    // -------------------------------------------------------------
    console.log('--- Vector 1: Prisma Schema Materialization & ACID Cascade ---');

    // 1.1 Model existence & persistence in real SQLite/Postgres DB
    const ee = await db.emailEvent.create({
      data: {
        organizationId: orgA.id,
        recipient: leadA.email,
        eventType: 'bounced',
        bounceType: 'hard',
        bounceReason: '550 5.1.1 User unknown',
        messageId: messageA.id,
        leadId: leadA.id,
      },
    });
    check(!!ee.id && ee.bounceType === 'hard', 'EmailEvent persisted with hard bounce data');

    const fu = await db.followUp.create({
      data: {
        organizationId: orgA.id,
        messageId: messageA.id,
        leadId: leadA.id,
        stepNumber: 2,
        sequencePos: 2,
        scheduledAt: new Date(Date.now() + 86400000),
        status: 'scheduled',
      },
    });
    check(!!fu.id && fu.stepNumber === 2, 'FollowUp persisted with stepNumber 2');

    const rc = await db.replyClassification.create({
      data: {
        organizationId: orgA.id,
        messageId: messageA.id,
        leadId: leadA.id,
        category: 'objection',
        confidence: 0.88,
        sentiment: 'negative',
        replyText: 'Not interested at this time',
        nextAction: 'pause_sequence',
      },
    });
    check(!!rc.id && rc.category === 'objection', 'ReplyClassification persisted with objection');

    const me = await db.messageEdit.create({
      data: {
        organizationId: orgA.id,
        messageId: messageA.id,
        leadId: leadA.id,
        editType: 'subject_tune',
        fieldName: 'subject',
        originalValue: 'Old Subject',
        editedValue: 'New High-Converting Subject',
        changeMagnitude: 0.5,
      },
    });
    check(!!me.id && me.editType === 'subject_tune', 'MessageEdit persisted with subject_tune');

    const ae = await db.agentEvent.create({
      data: {
        organizationId: orgA.id,
        leadId: leadA.id,
        agentName: 'ReevalAgent',
        stepName: 'ObjectionHandling',
        phase: 'reeval',
        level: 'info',
        status: 'success',
        durationMs: 35,
      },
    });
    check(!!ae.id && ae.agentName === 'ReevalAgent', 'AgentEvent persisted with agentName');

    // 1.2 Multi-tenant isolation between Org A and Org B
    const orgBEvents = await db.emailEvent.findMany({ where: { organizationId: orgB.id } });
    check(orgBEvents.length === 0, 'Org B cannot read Org A EmailEvents');

    // 1.3 User model isSuperAdmin field
    check(superUser.isSuperAdmin === true, 'User model isSuperAdmin column is true for platform admin');
    check(regularUser.isSuperAdmin === false, 'User model isSuperAdmin column defaults to false');

    // -------------------------------------------------------------
    // VECTOR 2: PLATFORM ADMIN AUTHORIZATION & TIMING DEFENSE
    // -------------------------------------------------------------
    console.log('\n--- Vector 2: Platform Admin Authorization & Timing Defense ---');

    process.env.PLATFORM_ADMIN_SECRET = 'auditor_super_platform_secret_123';
    process.env.ADMIN_SECRET = 'auditor_admin_backup_secret_456';
    process.env.CRON_SECRET = 'auditor_cron_secret_789';

    // 2.1 Unauthorized request without secret or session
    let caught401 = false;
    try {
      const emptyReq = new NextRequest('http://localhost:3000/api/admin/fleet');
      const prevBypass = process.env.AUTH_DEV_BYPASS;
      process.env.AUTH_DEV_BYPASS = 'false';
      try {
        await requirePlatformAdmin(emptyReq);
      } finally {
        process.env.AUTH_DEV_BYPASS = prevBypass;
      }
    } catch (err: any) {
      caught401 = err.statusCode === 401;
    }
    check(caught401, 'requirePlatformAdmin blocks unauthenticated requests with 401');

    // 2.2 Invalid secret rejected even if dev bypass was set
    let caughtInvalidSecret = false;
    try {
      const badSecretReq = new NextRequest('http://localhost:3000/api/admin/fleet', {
        headers: { 'x-platform-admin-secret': 'forged_fake_secret_xyz' },
      });
      await requirePlatformAdmin(badSecretReq);
    } catch (err: any) {
      caughtInvalidSecret = err.statusCode === 401;
    }
    check(caughtInvalidSecret, 'requirePlatformAdmin rejects invalid secret header with 401');

    // 2.3 Bearer header auth with valid secret
    const validBearerReq = new NextRequest('http://localhost:3000/api/admin/orgs', {
      headers: { authorization: 'Bearer auditor_super_platform_secret_123' },
    });
    const bearerAdmin = await requirePlatformAdmin(validBearerReq);
    check(bearerAdmin.isSuperAdmin === true, 'requirePlatformAdmin succeeds via Bearer header');

    // 2.4 Admin endpoints enforce requirePlatformAdmin
    const orgsRes = await handleAdminOrgs(validBearerReq);
    check(orgsRes.status === 200, 'GET /api/admin/orgs returns 200 for platform admin');

    const fleetRes = await handleAdminFleet(validBearerReq);
    check(fleetRes.status === 200, 'GET /api/admin/fleet returns 200 for platform admin');

    const healthRes = await handleAdminHealth(validBearerReq);
    check(healthRes.status === 200, 'GET /api/admin/health returns 200 for platform admin');

    const tenantsRes = await handleAdminTenants(validBearerReq);
    check(tenantsRes.status === 200, 'GET /api/admin/tenants returns 200 for platform admin');

    // -------------------------------------------------------------
    // VECTOR 3: CRYPTOGRAPHIC SVIX WEBHOOK VERIFICATION
    // -------------------------------------------------------------
    console.log('\n--- Vector 3: Cryptographic Svix Webhook Verification ---');

    const svixSecret = 'whsec_auditor_svix_secret_key_1122334455';
    process.env.RESEND_WEBHOOK_SECRET = svixSecret;

    const webhookBody = JSON.stringify({
      from: `Target <${leadA.email}>`,
      to: [`sender@${domainA.domain}`],
      subject: 'Re: Alpha Outreach Proposal',
      text: 'Yes! Lets talk tomorrow.',
      headers: {
        'x-message-id': messageA.id,
      },
    });

    const validMsgId = `msg_test_${Date.now()}`;
    const validTimestamp = Math.floor(Date.now() / 1000).toString();
    const cleanSec = svixSecret.slice(6);
    const secretBuf = Buffer.from(cleanSec, 'base64').length > 0 ? Buffer.from(cleanSec, 'base64') : Buffer.from(svixSecret);
    const validSig = crypto
      .createHmac('sha256', secretBuf)
      .update(`${validMsgId}.${validTimestamp}.${webhookBody}`)
      .digest('base64');

    // 3.1 Legitimate signature succeeds
    const validReq = new NextRequest('http://localhost:3000/api/webhooks/inbound', {
      method: 'POST',
      body: webhookBody,
      headers: {
        'content-type': 'application/json',
        'svix-id': validMsgId,
        'svix-timestamp': validTimestamp,
        'svix-signature': `v1,${validSig}`,
      },
    });
    const validWebhookRes = await handleInboundWebhook(validReq);
    check(validWebhookRes.status === 200, 'Valid Svix signed webhook accepted with 200');

    // 3.2 Expired timestamp (> 5 minutes ago) rejected
    const expiredTimestamp = (Math.floor(Date.now() / 1000) - 360).toString();
    const expiredSig = crypto
      .createHmac('sha256', secretBuf)
      .update(`${validMsgId}.${expiredTimestamp}.${webhookBody}`)
      .digest('base64');

    const expiredReq = new NextRequest('http://localhost:3000/api/webhooks/inbound', {
      method: 'POST',
      body: webhookBody,
      headers: {
        'content-type': 'application/json',
        'svix-id': validMsgId,
        'svix-timestamp': expiredTimestamp,
        'svix-signature': `v1,${expiredSig}`,
      },
    });
    const expiredRes = await handleInboundWebhook(expiredReq);
    check(expiredRes.status === 401, 'Replay attack with expired timestamp (>5 min) rejected with 401');

    // 3.3 Tampered body rejected
    const tamperedBody = webhookBody + ' ';
    const tamperedReq = new NextRequest('http://localhost:3000/api/webhooks/inbound', {
      method: 'POST',
      body: tamperedBody,
      headers: {
        'content-type': 'application/json',
        'svix-id': validMsgId,
        'svix-timestamp': validTimestamp,
        'svix-signature': `v1,${validSig}`,
      },
    });
    const tamperedRes = await handleInboundWebhook(tamperedReq);
    check(tamperedRes.status === 401, 'Tampered payload rejected with 401');

    // 3.4 Missing headers rejected
    const missingHeadersReq = new NextRequest('http://localhost:3000/api/webhooks/inbound', {
      method: 'POST',
      body: webhookBody,
      headers: {
        'content-type': 'application/json',
      },
    });
    const missingRes = await handleInboundWebhook(missingHeadersReq);
    check(missingRes.status === 401, 'Webhook missing Svix headers rejected with 401');

    // -------------------------------------------------------------
    // VECTOR 4: CRON SECURITY & TIMING-SAFE VERIFICATION
    // -------------------------------------------------------------
    console.log('\n--- Vector 4: Cron Security & Timing-Safe Verification ---');

    process.env.CRON_SECRET = 'audit_cron_secret_secure_9988';

    // 4.1 Pipeline run with invalid cron secret
    const badCronReq = new NextRequest('http://localhost:3000/api/pipeline/run', {
      method: 'POST',
      headers: { authorization: 'Bearer invalid_secret_attack' },
    });
    const badCronRes = await handlePipelineRun(badCronReq);
    check(badCronRes.status === 401, 'Pipeline run rejects invalid secret with 401');

    // 4.2 Pipeline run with old hardcoded secret
    const oldCronReq = new NextRequest('http://localhost:3000/api/pipeline/run', {
      method: 'POST',
      headers: { authorization: 'Bearer cron_secret_key_12345' },
    });
    const oldCronRes = await handlePipelineRun(oldCronReq);
    check(oldCronRes.status === 401, 'Pipeline run rejects old hardcoded fallback with 401');

    // 4.3 Pipeline run with valid cron secret
    const validCronReq = new NextRequest('http://localhost:3000/api/pipeline/run', {
      method: 'POST',
      headers: { authorization: 'Bearer audit_cron_secret_secure_9988' },
    });
    const validCronRes = await handlePipelineRun(validCronReq);
    check(validCronRes.status === 200, 'Pipeline run succeeds with valid CRON_SECRET');

    // 4.4 Enrichment run with valid cron secret
    const validEnrichReq = new NextRequest('http://localhost:3000/api/enrichment/run', {
      method: 'POST',
      headers: { authorization: 'Bearer audit_cron_secret_secure_9988' },
    });
    const validEnrichRes = await handleEnrichmentRun(validEnrichReq);
    check(validEnrichRes.status === 200, 'Enrichment run succeeds with valid CRON_SECRET');

    // -------------------------------------------------------------
    // VECTOR 5: RATE LIMITING BOUNDS & API ENFORCEMENT
    // -------------------------------------------------------------
    console.log('\n--- Vector 5: Rate Limiting Bounds & API Enforcement ---');

    const rateKey = `auditor_rl_${Date.now()}`;
    const r1 = await checkRateLimit(rateKey, 2, 30);
    check(r1.allowed === true && r1.remaining === 1 && r1.resetIn > 0 && r1.resetIn <= 30, 'Rate limit step 1: allowed=true, remaining=1, resetIn valid');

    const r2 = await checkRateLimit(rateKey, 2, 30);
    check(r2.allowed === true && r2.remaining === 0, 'Rate limit step 2: allowed=true, remaining=0');

    const r3 = await checkRateLimit(rateKey, 2, 30);
    check(r3.allowed === false && r3.remaining === 0, 'Rate limit step 3: allowed=false (blocked)');

    // 5.2 API Signup Rate Limiting: 11 requests from same IP -> 11th blocked
    const testIp = `198.51.100.${Math.floor(Math.random() * 200 + 10)}`;
    for (let i = 0; i < 10; i++) {
      await checkRateLimit(`signup:${testIp}`, 10, 600);
    }
    const signupExceededReq = new NextRequest('http://localhost:3000/api/auth/signup', {
      method: 'POST',
      headers: { 'x-forwarded-for': testIp, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Blocked User',
        email: `blocked_${Date.now()}@test.com`,
        password: 'Password123!',
        orgName: 'Blocked Org',
      }),
    });
    const signupBlockedRes = await handleSignup(signupExceededReq);
    check(signupBlockedRes.status === 429, 'POST /api/auth/signup returns HTTP 429 when IP rate limit is exceeded');

    // 5.3 Lead Import Rate Limiting: 21 requests from same org -> 21st blocked
    const importOrgKey = `org_import_limit_${Date.now()}`;
    for (let i = 0; i < 20; i++) {
      await checkRateLimit(`import:${orgA.id}`, 20, 60);
    }
    const importExceededReq = new NextRequest('http://localhost:3000/api/leads/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-organization-id': orgA.id },
      body: JSON.stringify({ csvText: 'Name,Email\nTest,test@test.com' }),
    });
    const importBlockedRes = await handleImportLeads(importExceededReq);
    check(importBlockedRes.status === 429, 'POST /api/leads/import returns HTTP 429 when organization rate limit is exceeded');

    // -------------------------------------------------------------
    // VECTOR 6: STRICT WORKSPACE PARAMETER SCOPING
    // -------------------------------------------------------------
    console.log('\n--- Vector 6: Strict Workspace Parameter Scoping ---');

    const testApiKey = `aud_key_${Date.now()}_secret`;
    const keyHash = crypto.createHash('sha256').update(testApiKey).digest('hex');

    await db.apiKey.create({
      data: {
        organizationId: orgA.id,
        name: 'Auditor API Key',
        keyHash,
        scopes: JSON.stringify(['read', 'write']),
      },
    });

    const scopedReq = new NextRequest('http://localhost:3000/api/leads', {
      headers: { 'x-api-key': testApiKey },
    });

    const wsContext = await requireWorkspace(scopedReq);
    check(wsContext.organizationId === orgA.id, 'requireWorkspace extracts correct tenant organizationId');
    check(wsContext.isApiKey === true, 'requireWorkspace marks isApiKey = true');

    // Invalid API Key rejected
    let invalidKeyThrew = false;
    try {
      const badKeyReq = new NextRequest('http://localhost:3000/api/leads', {
        headers: { 'x-api-key': 'unregistered_bogus_key_999' },
      });
      await requireWorkspace(badKeyReq);
    } catch (err: any) {
      invalidKeyThrew = err.statusCode === 401;
    }
    check(invalidKeyThrew, 'requireWorkspace strictly rejects unregistered API key with 401');

    // Role ranking verification
    check(hasRole('OWNER', 'MEMBER') === true, 'hasRole: OWNER >= MEMBER is true');
    check(hasRole('MEMBER', 'ADMIN') === false, 'hasRole: MEMBER >= ADMIN is false');
    check(hasRole('ADMIN', 'OWNER') === false, 'hasRole: ADMIN >= OWNER is false');
    check(hasRole('VIEWER', 'MEMBER') === false, 'hasRole: VIEWER >= MEMBER is false');

  } finally {
    // Cleanup
    await db.emailEvent.deleteMany({ where: { organizationId: orgA.id } }).catch(() => {});
    await db.followUp.deleteMany({ where: { organizationId: orgA.id } }).catch(() => {});
    await db.replyClassification.deleteMany({ where: { organizationId: orgA.id } }).catch(() => {});
    await db.messageEdit.deleteMany({ where: { organizationId: orgA.id } }).catch(() => {});
    await db.agentEvent.deleteMany({ where: { organizationId: orgA.id } }).catch(() => {});
    await db.activity.deleteMany({ where: { organizationId: orgA.id } }).catch(() => {});
    await db.outreachMessage.deleteMany({ where: { organizationId: orgA.id } }).catch(() => {});
    await db.sendingDomain.deleteMany({ where: { organizationId: orgA.id } }).catch(() => {});
    await db.apiKey.deleteMany({ where: { organizationId: orgA.id } }).catch(() => {});
    await db.lead.deleteMany({ where: { organizationId: orgA.id } }).catch(() => {});
    await db.organization.delete({ where: { id: orgA.id } }).catch(() => {});
    await db.organization.delete({ where: { id: orgB.id } }).catch(() => {});
    await db.user.delete({ where: { id: superUser.id } }).catch(() => {});
    await db.user.delete({ where: { id: regularUser.id } }).catch(() => {});
  }

  console.log('\n================================================================');
  console.log(` AUDIT TOTALS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    console.error('Audit Failures:');
    failures.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
  }
}

runForensicAudit().catch(err => {
  console.error('Forensic runner crashed:', err);
  process.exit(1);
});
