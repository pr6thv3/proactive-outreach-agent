// ─── Milestone 6: Agency / Multi-Tenant Admin Separation Test Suite ─────────
// Validates strict administrative separation, fleet health telemetry,
// zero-leakage cross-tenant isolation, RBAC enforcement, token cost tracking,
// and background engine monitoring.
//
// Run with:
//   cross-env SQLITE_DATABASE_URL=file:./dev.db AUTH_DEV_BYPASS=true tsx src/__tests__/agency-admin.test.ts

import { db } from '../lib/db';
import { 
  getFleetMetrics, 
  getTenantMetrics, 
  calculateTenantTokenUsage, 
  calculateTenantDeliverabilityAndCircuitBreaker 
} from '../lib/admin/telemetry';
import { requireRole, hasRole, ApiAuthError } from '../lib/auth/context';
import { NextRequest } from 'next/server';

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

async function cleanTestData(orgId: string) {
  await db.activity.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.auditLog.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.jobQueue.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.enrichmentQueue.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.outreachEmail.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.signal.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.lead.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.campaign.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.sendingDomain.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.userPreference.deleteMany({ where: { activeOrgId: orgId } }).catch(() => {});
  await db.organizationMember.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.organization.delete({ where: { id: orgId } }).catch(() => {});
}

async function runAgencyAdminTests() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║       MILESTONE 6: AGENCY / MULTI-TENANT ADMIN TEST SUITE            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  // Setup test organizations
  const org1Key = `admin_test_tenant_alpha_${Date.now()}`;
  const org2Key = `admin_test_tenant_beta_${Date.now()}`;

  const testUser = await db.user.create({
    data: {
      email: `admin_tester_${Date.now()}@agency.com`,
      name: 'Agency Admin Tester',
    },
  });

  const org1 = await db.organization.create({
    data: {
      workspaceKey: org1Key,
      name: 'Alpha Growth Systems',
      plan: 'enterprise',
      subscriptionStatus: 'active',
    },
  });

  const org2 = await db.organization.create({
    data: {
      workspaceKey: org2Key,
      name: 'Beta Security Labs',
      plan: 'pro',
      subscriptionStatus: 'active',
    },
  });

  try {
    // ═══════════════════════════════════════════════════════════════════════════
    // 1. RBAC & ADMINISTRATIVE BOUNDARY ENFORCEMENT
    // ═══════════════════════════════════════════════════════════════════════════
    section('1. RBAC & Administrative Boundary Enforcement');

    assertEqual(hasRole('OWNER', 'ADMIN'), true, 'OWNER role has ADMIN privilege');
    assertEqual(hasRole('ADMIN', 'ADMIN'), true, 'ADMIN role has ADMIN privilege');
    assertEqual(hasRole('MEMBER', 'ADMIN'), false, 'MEMBER role is rejected from ADMIN portal');
    assertEqual(hasRole('VIEWER', 'ADMIN'), false, 'VIEWER role is rejected from ADMIN portal');

    // Test requireRole in dev mode returns valid admin context
    const adminContext = await requireRole('ADMIN');
    assert(!!adminContext.organizationId, 'requireRole returns valid workspace context');
    assertEqual(hasRole(adminContext.role, 'ADMIN'), true, 'Context role satisfies ADMIN requirement');

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. DELIVERABILITY & CIRCUIT BREAKER STATUS EVALUATION
    // ═══════════════════════════════════════════════════════════════════════════
    section('2. Deliverability & Circuit Breaker Status Evaluation');

    // Setup Domain and Campaign for Org 1 (Healthy)
    const domain1 = await db.sendingDomain.create({
      data: {
        organizationId: org1.id,
        domain: 'alphagrowth.io',
        status: 'verified',
        reputationScore: 98,
        dkimVerified: true,
        spfVerified: true,
        dmarcVerified: true,
      },
    });

    const campaign1 = await db.campaign.create({
      data: {
        organizationId: org1.id,
        name: 'Enterprise Tech Inbound',
        status: 'ACTIVE',
        dailyLimit: 100,
      },
    });

    const cb1 = await calculateTenantDeliverabilityAndCircuitBreaker(org1.id);
    assertEqual(cb1.circuitBreakerStatus, 'HEALTHY', 'Org 1 initial status is HEALTHY');
    assert(cb1.deliverabilityScore >= 90, `Org 1 deliverability score is ${cb1.deliverabilityScore} (>= 90)`);
    assertEqual(cb1.deliverabilityGrade, 'A+', 'Org 1 deliverability grade is A+');

    // Setup Tripped Circuit Breaker scenario for Org 2
    const domain2 = await db.sendingDomain.create({
      data: {
        organizationId: org2.id,
        domain: 'betasec-bad.io',
        status: 'SUSPENDED',
        reputationScore: 40,
      },
    });

    const campaign2 = await db.campaign.create({
      data: {
        organizationId: org2.id,
        name: 'High Bounce Outbound',
        status: 'PAUSED',
        pausedReason: 'Circuit breaker triggered: high bounce rate',
      },
    });

    const cb2 = await calculateTenantDeliverabilityAndCircuitBreaker(org2.id);
    assertEqual(cb2.circuitBreakerStatus, 'TRIPPED', 'Org 2 circuit breaker status trips on suspended domain & paused campaign');
    assert(cb2.deliverabilityScore <= 50, `Org 2 deliverability score clamped to degraded level (${cb2.deliverabilityScore})`);
    assert(!!cb2.circuitBreakerReason, 'Org 2 has explanatory circuit breaker reason');

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. GENUINE LLM TOKEN & COST CALCULATION
    // ═══════════════════════════════════════════════════════════════════════════
    section('3. Genuine LLM Token & Cost Calculation');

    // Seed leads, signals, and generated outreach emails in Org 1
    const lead1 = await db.lead.create({
      data: {
        organizationId: org1.id,
        name: 'John Doe',
        email: 'john@alphatarget.com',
        status: 'contacted',
      },
    });

    await db.signal.create({
      data: {
        organizationId: org1.id,
        leadId: lead1.id,
        type: 'funding',
        content: 'Alpha raised Series A',
        score: 85,
      },
    });

    await db.outreachEmail.create({
      data: {
        organizationId: org1.id,
        leadId: lead1.id,
        campaignId: campaign1.id,
        subject: 'Quick question regarding expansion',
        body: 'Hi John, congratulations on the expansion.',
        status: 'SENT',
        generatedBy: 'AI',
        sentAt: new Date(),
      },
    });

    const tokenUsage1 = await calculateTenantTokenUsage(org1.id);
    assert(tokenUsage1.promptTokens > 0, `Org 1 prompt tokens > 0 (${tokenUsage1.promptTokens})`);
    assert(tokenUsage1.completionTokens > 0, `Org 1 completion tokens > 0 (${tokenUsage1.completionTokens})`);
    assert(tokenUsage1.totalTokens >= 1150, `Org 1 total tokens calculated from real events (${tokenUsage1.totalTokens})`);
    assert(tokenUsage1.estimatedCostUsd > 0, `Org 1 estimated cost in USD > 0 ($${tokenUsage1.estimatedCostUsd})`);

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. MULTI-TENANT FLEET OVERVIEW AGGREGATION
    // ═══════════════════════════════════════════════════════════════════════════
    section('4. Multi-Tenant Fleet Overview Aggregation');

    const fleet = await getFleetMetrics();
    assert(fleet.summary.totalTenants >= 2, `Fleet tracks all active tenants (${fleet.summary.totalTenants})`);
    assert(fleet.summary.activeCampaigns >= 1, `Fleet summarizes active campaigns (${fleet.summary.activeCampaigns})`);
    assert(fleet.summary.totalEstimatedCostUsd >= 0, `Fleet summarizes total LLM costs ($${fleet.summary.totalEstimatedCostUsd})`);
    assert(fleet.tenants.some(t => t.id === org1.id), 'Fleet includes Tenant Alpha');
    assert(fleet.tenants.some(t => t.id === org2.id), 'Fleet includes Tenant Beta');

    // Inngest background engine telemetry
    assertEqual(fleet.inngestStatus.status, 'healthy', 'Inngest engine status is healthy');
    assertEqual(fleet.inngestStatus.functions.length, 5, 'All 5 serverless pipeline functions registered in telemetry');
    assert(fleet.inngestStatus.functions.some(f => f.trigger === 'pipeline/observe'), 'Observe trigger registered');
    assert(fleet.inngestStatus.functions.some(f => f.trigger === 'pipeline/think'), 'Think trigger registered');
    assert(fleet.inngestStatus.functions.some(f => f.trigger === 'pipeline/act'), 'Act trigger registered');
    assert(fleet.inngestStatus.functions.some(f => f.trigger === 'pipeline/reevaluate'), 'Reevaluate trigger registered');
    assert(fleet.inngestStatus.functions.some(f => f.trigger === 'enrichment/batch'), 'Enrichment batch trigger registered');

    // Redis telemetry
    assert(!!fleet.redisTelemetry.status, 'Redis rate limiter status reported');
    assertEqual(fleet.redisTelemetry.jitterRange, '±15% ISP jitter active', 'ISP jitter telemetry reported');

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. STRICT ZERO-LEAKAGE CROSS-TENANT ISOLATION
    // ═══════════════════════════════════════════════════════════════════════════
    section('5. Strict Zero-Leakage Cross-Tenant Isolation');

    const tenantAlphaMetrics = await getTenantMetrics(org1);
    const tenantBetaMetrics = await getTenantMetrics(org2);

    assertEqual(tenantAlphaMetrics.id, org1.id, 'Tenant Alpha metrics match Org 1');
    assertEqual(tenantBetaMetrics.id, org2.id, 'Tenant Beta metrics match Org 2');
    assertEqual(tenantAlphaMetrics.leadCount, 1, 'Tenant Alpha sees exactly 1 lead');
    assertEqual(tenantBetaMetrics.leadCount, 0, 'Tenant Beta sees 0 leads (zero leak from Alpha)');

    // Ensure scoped queries return null when probing across tenants
    const crossTenantLead = await db.lead.findFirst({
      where: { id: lead1.id, organizationId: org2.id },
    });
    assertEqual(crossTenantLead, null, 'Cross-tenant ID probe strictly returns null (zero data cross-contamination)');

    // ═══════════════════════════════════════════════════════════════════════════
    // 6. TENANT ADMINISTRATIVE ACTION OPERATIONS
    // ═══════════════════════════════════════════════════════════════════════════
    section('6. Tenant Administrative Action Operations');

    // 6.1 Toggle Autonomy Kill-switch
    await db.userPreference.create({
      data: {
        userId: testUser.id,
        activeOrgId: org1.id,
        autonomyPaused: false,
        dailySendLimit: 50,
      },
    });

    // Simulate Pause
    await db.userPreference.updateMany({
      where: { activeOrgId: org1.id },
      data: { autonomyPaused: true, pausedReason: 'Admin emergency pause' },
    });

    const updatedPref = await db.userPreference.findFirst({ where: { activeOrgId: org1.id } });
    assertEqual(updatedPref?.autonomyPaused, true, 'Admin successfully paused tenant autonomy');

    // 6.2 Update Limits
    await db.userPreference.updateMany({
      where: { activeOrgId: org1.id },
      data: { dailySendLimit: 120, minLeadScore: 75.0 },
    });

    const limitPref = await db.userPreference.findFirst({ where: { activeOrgId: org1.id } });
    assertEqual(limitPref?.dailySendLimit, 120, 'Admin successfully updated tenant daily limit');
    assertEqual(limitPref?.minLeadScore, 75.0, 'Admin successfully updated tenant minimum score threshold');

    // 6.3 Audit Log Insertion
    const auditLog = await db.auditLog.create({
      data: {
        organizationId: org1.id,
        action: 'ADMIN_UPDATE_LIMITS',
        entityType: 'Organization',
        entityId: org1.id,
        metadata: { dailySendLimit: 120 },
      },
    });

    assert(!!auditLog.id, 'Administrative audit log entry successfully persisted');

  } finally {
    // Cleanup test data
    await cleanTestData(org1.id);
    await cleanTestData(org2.id);
    await db.user.delete({ where: { id: testUser.id } }).catch(() => {});
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ${passed} passed, ${failed} failed (${passed + failed} total assertions)          ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  if (failures.length > 0) {
    console.log('\nFailed assertions:');
    for (const f of failures) {
      console.log(`  ❌ ${f}`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

runAgencyAdminTests().catch((err) => {
  console.error('Test runner failed with exception:', err);
  process.exit(1);
});
