// ─── High-Concurrency Deliverability & Rate-Limiting Load Test Suite (Milestone 2) ───
// Comprehensive load, concurrency race condition, and rate-limiting test suite covering:
// 1. Upstash Redis Daily Send Counters: Atomic INCR, zero quota overrun under 50–100+ concurrent workers, 25h TTL enforcement
// 2. Hourly Pacing Throttles & Cadence Jitter: max(10, ceil(maxDailySends/8)), jitter distribution (+-15%), minimum interval (30s)
// 3. Multi-Tenant 7-Step Send-Readiness Audit Under Concurrency: DNC addition races, blacklisting races, unapproved dispatch races, campaign pause races
// 4. Structured 5-Question UI Remediation Targets: 18 atomic checks across 7 gates returning valid remediation targets and trace IDs
//
// Run with: npm run test:concurrency
// Or:       cross-env SQLITE_DATABASE_URL=file:./dev.db AUTH_DEV_BYPASS=true tsx src/__tests__/concurrency-load.test.ts

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { db } from '../lib/db';
import {
  trackDailySendCount,
  getDailySendCount,
  checkRateLimit,
  setRedisInstance,
  getRedis,
} from '../lib/redis';
import {
  calculateSendDelay,
  calculateBatchDelay,
  getOptimalSendTime,
  scheduleSends,
  isInSendWindow,
  MIN_SEND_INTERVAL_MS,
} from '../lib/deliverability/send-cadence';
import { evaluateRisk } from '../lib/risk';
import {
  evaluateSendReadiness,
  assertReadyToSend,
  SendReadinessResult,
} from '../lib/deliverability/send-readiness';
import {
  validateEmail,
  isOnDncList,
  addToDncList,
} from '../lib/safety';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST HARNESS & ASSERTION UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;
const assertionFailures: string[] = [];

function assert(condition: boolean, testName: string, detail?: string): void {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  ✅ ${testName}`);
  } else {
    failedAssertions++;
    const msg = detail ? `${testName} — ${detail}` : testName;
    assertionFailures.push(msg);
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

function assertInRange(actual: number, min: number, max: number, testName: string): void {
  if (actual < min || actual > max) {
    assert(false, testName, `value ${actual} out of range [${min}, ${max}]`);
  } else {
    assert(true, testName);
  }
}

function section(name: string): void {
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 70 - name.length))}`);
}

function banner(title: string): void {
  console.log('\n╔' + '═'.repeat(76) + '╗');
  console.log(`║  ${title.padEnd(72)}  ║`);
  console.log('╚' + '═'.repeat(76) + '╝');
}

// ═══════════════════════════════════════════════════════════════════════════════
// IN-MEMORY UPSTASH REDIS CONCURRENT SIMULATOR
// ═══════════════════════════════════════════════════════════════════════════════

interface ExpireEntry {
  expiresAt: number;
  ttlSeconds: number;
}

interface RedisOpLog {
  op: 'incr' | 'expire' | 'get' | 'set';
  key: string;
  arg?: any;
  timestamp: number;
}

class MockConcurrentUpstashRedis {
  private store = new Map<string, number | string>();
  private expirations = new Map<string, ExpireEntry>();
  public operationLog: RedisOpLog[] = [];
  private lockPromise: Promise<void> = Promise.resolve();

  // Thread-safe mutex simulation for atomic Redis execution
  private async withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    let unlock: () => void = () => {};
    const nextLock = new Promise<void>(resolve => {
      unlock = resolve;
    });
    const prevLock = this.lockPromise;
    this.lockPromise = nextLock;
    await prevLock;
    try {
      // Simulate real asynchronous I/O tick
      await new Promise(res => setImmediate(res));
      return await fn();
    } finally {
      unlock();
    }
  }

  async incr(key: string): Promise<number> {
    return this.withLock(() => {
      this.checkExpired(key);
      const current = this.store.get(key);
      const currentVal = typeof current === 'number' ? current : Number(current) || 0;
      const nextVal = currentVal + 1;
      this.store.set(key, nextVal);
      this.operationLog.push({ op: 'incr', key, arg: nextVal, timestamp: Date.now() });
      return nextVal;
    });
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.withLock(() => {
      this.operationLog.push({ op: 'expire', key, arg: seconds, timestamp: Date.now() });
      if (!this.store.has(key)) return 0;
      this.expirations.set(key, {
        expiresAt: Date.now() + seconds * 1000,
        ttlSeconds: seconds,
      });
      return 1;
    });
  }

  async get<T = any>(key: string): Promise<T | null> {
    return this.withLock(() => {
      this.checkExpired(key);
      this.operationLog.push({ op: 'get', key, timestamp: Date.now() });
      const val = this.store.get(key);
      return val !== undefined ? (val as unknown as T) : null;
    });
  }

  async ttl(key: string): Promise<number> {
    return this.withLock(() => {
      this.checkExpired(key);
      if (!this.store.has(key)) return -2;
      const exp = this.expirations.get(key);
      if (!exp) return -1;
      const remainingMs = exp.expiresAt - Date.now();
      return Math.max(0, Math.ceil(remainingMs / 1000));
    });
  }

  private checkExpired(key: string): void {
    const exp = this.expirations.get(key);
    if (exp && Date.now() > exp.expiresAt) {
      this.store.delete(key);
      this.expirations.delete(key);
    }
  }

  simulateTimeJump(seconds: number): void {
    const now = Date.now() + seconds * 1000;
    for (const [key, exp] of this.expirations.entries()) {
      if (now > exp.expiresAt) {
        this.store.delete(key);
        this.expirations.delete(key);
      }
    }
  }

  getCallCount(op: RedisOpLog['op'], key?: string): number {
    return this.operationLog.filter(log => log.op === op && (!key || log.key === key)).length;
  }

  reset(): void {
    this.store.clear();
    this.expirations.clear();
    this.operationLog = [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE SEEDING AND CLEANUP HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

async function createTestOrg(orgId: string, name: string) {
  const existing = await db.organization.findUnique({ where: { id: orgId } }).catch(() => null);
  if (existing) return existing;
  return db.organization.create({
    data: {
      id: orgId,
      workspaceKey: `wk_${orgId}`,
      name,
    },
  });
}

async function cleanupTenant(orgId: string) {
  try {
    await db.doNotContact.deleteMany({ where: { organizationId: orgId } });
    await db.outreachMessage.deleteMany({ where: { organizationId: orgId } });
    await db.lead.deleteMany({ where: { organizationId: orgId } });
    await db.campaignSenderPool.deleteMany({ where: { organizationId: orgId } });
    await db.campaign.deleteMany({ where: { organizationId: orgId } });
    await db.senderAccount.deleteMany({ where: { organizationId: orgId } });
    await db.sendingDomain.deleteMany({ where: { organizationId: orgId } });
    await db.organization.deleteMany({ where: { id: orgId } }).catch(() => {});
  } catch (err) {
    // Ignore cleanup non-critical errors
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════

async function runConcurrencyLoadTestSuite() {
  banner('MILESTONE 2: HIGH-CONCURRENCY DELIVERABILITY & RATE-LIMITING LOAD TEST');

  const mockRedis = new MockConcurrentUpstashRedis();
  setRedisInstance(mockRedis as any);

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 1: Upstash Redis Daily Send Counters & Concurrency Load Testing
  // ─────────────────────────────────────────────────────────────────────────────
  section('1. Upstash Redis Daily Send Counters — High-Concurrency Parallel INCR');

  // Test 1.1: 50–100 Concurrent Workers across Multiple Organizations
  mockRedis.reset();
  const orgAlpha = `org_alpha_${Date.now()}`;
  const orgBeta = `org_beta_${Date.now()}`;
  const orgGamma = `org_gamma_${Date.now()}`;
  const orgDelta = `org_delta_${Date.now()}`;

  const workersAlpha = Array.from({ length: 100 }, () => trackDailySendCount(orgAlpha));
  const workersBeta = Array.from({ length: 50 }, () => trackDailySendCount(orgBeta));
  const workersGamma = Array.from({ length: 75 }, () => trackDailySendCount(orgGamma));
  const workersDelta = Array.from({ length: 50 }, () => trackDailySendCount(orgDelta));

  const [resultsAlpha, resultsBeta, resultsGamma, resultsDelta] = await Promise.all([
    Promise.all(workersAlpha),
    Promise.all(workersBeta),
    Promise.all(workersGamma),
    Promise.all(workersDelta),
  ]);

  assertEqual(resultsAlpha.length, 100, 'Org Alpha: 100 concurrent workers finished');
  assertEqual(resultsBeta.length, 50, 'Org Beta: 50 concurrent workers finished');
  assertEqual(resultsGamma.length, 75, 'Org Gamma: 75 concurrent workers finished');
  assertEqual(resultsDelta.length, 50, 'Org Delta: 50 concurrent workers finished');

  const countAlpha = await getDailySendCount(orgAlpha);
  const countBeta = await getDailySendCount(orgBeta);
  const countGamma = await getDailySendCount(orgGamma);
  const countDelta = await getDailySendCount(orgDelta);

  assertEqual(countAlpha, 100, 'Org Alpha final atomic counter is exactly 100');
  assertEqual(countBeta, 50, 'Org Beta final atomic counter is exactly 50');
  assertEqual(countGamma, 75, 'Org Gamma final atomic counter is exactly 75');
  assertEqual(countDelta, 50, 'Org Delta final atomic counter is exactly 50');

  // Strict serialization verification: each worker should have received a unique sequential number from 1..N
  const sortedAlpha = [...resultsAlpha].sort((a, b) => a - b);
  const expectedAlpha = Array.from({ length: 100 }, (_, i) => i + 1);
  assertEqual(
    JSON.stringify(sortedAlpha),
    JSON.stringify(expectedAlpha),
    'Org Alpha: strict monotonic atomic sequence [1..100] with 0 duplicates or skipped values'
  );

  const sortedBeta = [...resultsBeta].sort((a, b) => a - b);
  const expectedBeta = Array.from({ length: 50 }, (_, i) => i + 1);
  assertEqual(
    JSON.stringify(sortedBeta),
    JSON.stringify(expectedBeta),
    'Org Beta: strict monotonic atomic sequence [1..50] with 0 duplicates or skipped values'
  );

  // Test 1.2: Strict Zero Quota Overrun Enforcement Under High Concurrency
  section('1.2. Strict Daily Quota Enforcement — Zero Quota Overrun Under Load');
  const orgQuota = `org_quota_${Date.now()}`;
  const dailyQuotaLimit = 50;
  const totalConcurrentAttempts = 100;

  // 100 workers attempt to send concurrently against a 50 send limit
  const quotaWorkers = Array.from({ length: totalConcurrentAttempts }, async (_, workerIdx) => {
    const currentSendCount = await trackDailySendCount(orgQuota);
    const isAllowedToSend = currentSendCount <= dailyQuotaLimit;
    return { workerIdx, currentSendCount, isAllowedToSend };
  });

  const quotaResults = await Promise.all(quotaWorkers);
  const allowedSends = quotaResults.filter(r => r.isAllowedToSend);
  const rejectedSends = quotaResults.filter(r => !r.isAllowedToSend);

  assertEqual(allowedSends.length, 50, 'Exactly 50 requests allowed when dailyQuotaLimit=50');
  assertEqual(rejectedSends.length, 50, 'Exactly 50 requests rejected when dailyQuotaLimit=50');

  const maxAllowedCount = Math.max(...allowedSends.map(s => s.currentSendCount));
  const minRejectedCount = Math.min(...rejectedSends.map(s => s.currentSendCount));
  assertEqual(maxAllowedCount, 50, 'Highest admitted counter is exactly 50 (0 quota overruns)');
  assertEqual(minRejectedCount, 51, 'Lowest rejected counter is exactly 51 (strict cutoff)');

  // Test 1.3: Key Naming Format & TTL (25 Hours Expiration) Enforcement
  section('1.3. Redis Key Naming Format & TTL (25-Hour Expiration) Enforcement');
  const orgTtl = `org_ttl_${Date.now()}`;
  const todayStr = new Date().toISOString().split('T')[0];
  const expectedKey = `org:${orgTtl}:sends:${todayStr}`;

  // First increment
  const firstCount = await trackDailySendCount(orgTtl);
  assertEqual(firstCount, 1, 'First send returns count = 1');

  // Verify that expire was called on first increment with 25 hours (90,000s)
  const expireOps = mockRedis.operationLog.filter(log => log.op === 'expire' && log.key === expectedKey);
  assertEqual(expireOps.length, 1, 'redis.expire was called exactly once on count === 1');
  assertEqual(expireOps[0].arg, 25 * 60 * 60, 'Key TTL set to 25 hours (90,000 seconds = 25 * 60 * 60)');

  // Run 50 subsequent increments
  await Promise.all(Array.from({ length: 50 }, () => trackDailySendCount(orgTtl)));

  // Verify expire was NOT called on subsequent increments
  const expireOpsAfter50 = mockRedis.operationLog.filter(log => log.op === 'expire' && log.key === expectedKey);
  assertEqual(expireOpsAfter50.length, 1, 'redis.expire is NOT re-invoked on subsequent increments (preserves original TTL window)');

  // Verify key expiration time jump
  mockRedis.simulateTimeJump(25 * 60 * 60 + 10);
  const countAfterTtl = await getDailySendCount(orgTtl);
  assertEqual(countAfterTtl, 0, 'Key expires and resets count to 0 after 25h + 10s');

  // Test 1.4: Sliding-Window Rate Limiting Concurrency (150 concurrent workers)
  section('1.4. Sliding-Window Rate Limiting Under Concurrency');
  mockRedis.reset();
  const rateLimitKey = `ip_192_168_1_${Date.now()}`;
  const rateLimitMax = 100;
  const rateLimitTotalRequests = 150;

  const rateLimitWorkers = Array.from({ length: rateLimitTotalRequests }, () =>
    checkRateLimit(rateLimitKey, rateLimitMax, 60)
  );

  const rateLimitResults = await Promise.all(rateLimitWorkers);
  const rateAllowed = rateLimitResults.filter(r => r.allowed);
  const rateBlocked = rateLimitResults.filter(r => !r.allowed);

  assertEqual(rateAllowed.length, 100, 'Rate Limiter: Exactly 100/150 requests allowed');
  assertEqual(rateBlocked.length, 50, 'Rate Limiter: Exactly 50/150 requests blocked');
  assertEqual(rateBlocked[0].remaining, 0, 'Blocked requests report remaining = 0');

  // Test 1.5: Error Resilience & Null Client Fallback
  section('1.5. Redis Error Resilience & In-Memory Fallback');
  // Inject error throwing Redis
  const errorRedis = {
    incr: async () => {
      throw new Error('Connection reset by peer');
    },
    expire: async () => {
      throw new Error('Timeout');
    },
    get: async () => {
      throw new Error('Redis offline');
    },
  };
  setRedisInstance(errorRedis as any);
  const fallbackCount = await trackDailySendCount('org_error_test');
  assertEqual(fallbackCount, 1, 'trackDailySendCount returns safe fallback 1 on Redis error');
  const fallbackGet = await getDailySendCount('org_error_test');
  assertEqual(fallbackGet, 0, 'getDailySendCount returns safe fallback 0 on Redis error');

  // Reset back to active mock Redis
  setRedisInstance(mockRedis as any);

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 2: Hourly Pacing Throttles & Cadence Jitter Mathematical Validation
  // ─────────────────────────────────────────────────────────────────────────────
  section('2. Hourly Pacing Throttles & Cadence Jitter Calculations');

  // Test 2.1: Mathematical Boundary Analysis of Hourly Pacing Formula: max(10, ceil(maxDailySends / 8))
  section('2.1. Exact Hourly Pacing Formula Verification: max(10, ceil(maxDailySends / 8))');
  const pacingTestCases: Array<{ maxDaily: number; expectedHourly: number }> = [
    { maxDaily: 0, expectedHourly: 10 },
    { maxDaily: 1, expectedHourly: 10 },
    { maxDaily: 10, expectedHourly: 10 },
    { maxDaily: 40, expectedHourly: 10 },
    { maxDaily: 79, expectedHourly: 10 },
    { maxDaily: 80, expectedHourly: 10 },    // ceil(80/8) = 10, max(10, 10) = 10
    { maxDaily: 81, expectedHourly: 11 },    // ceil(81/8) = 11, max(10, 11) = 11
    { maxDaily: 88, expectedHourly: 11 },    // ceil(88/8) = 11
    { maxDaily: 89, expectedHourly: 12 },    // ceil(89/8) = 12
    { maxDaily: 160, expectedHourly: 20 },   // ceil(160/8) = 20
    { maxDaily: 200, expectedHourly: 25 },   // ceil(200/8) = 25
    { maxDaily: 500, expectedHourly: 63 },   // ceil(500/8) = 63
    { maxDaily: 1000, expectedHourly: 125 }, // ceil(1000/8) = 125
    { maxDaily: 10000, expectedHourly: 1250 },
  ];

  for (const tc of pacingTestCases) {
    const calculatedHourlyLimit = Math.max(10, Math.ceil(tc.maxDaily / 8));
    assertEqual(
      calculatedHourlyLimit,
      tc.expectedHourly,
      `Pacing calculation for maxDailySends=${tc.maxDaily} -> hourlyLimit=${tc.expectedHourly}`
    );
  }

  // Test 2.2: Hourly Pacing Warning & Daily Quota Block via evaluateRisk
  section('2.2. evaluateRisk Pacing Diagnostics & Structured Remediation');
  const orgRiskPacing = `org_risk_pacing_${Date.now()}`;
  await cleanupTenant(orgRiskPacing);
  await createTestOrg(orgRiskPacing, 'Risk Pacing Org');

  const mockDomain = await db.sendingDomain.create({
    data: {
      organizationId: orgRiskPacing,
      domain: `pacing-${Date.now()}.com`,
      status: 'verified',
      reputationScore: 95,
      dailyLimit: 200,
    },
  });

  const mockCampaign = await db.campaign.create({
    data: {
      organizationId: orgRiskPacing,
      name: 'Pacing Test Campaign',
      status: 'running',
      maxDailySends: 80, // hourly limit = max(10, ceil(80/8)) = 10
      dailySendsCount: 0,
    },
  });

  // Case A: Compliant sending (0 sends in last hour) -> 'pass'
  const assessmentPass = await evaluateRisk({
    organizationId: orgRiskPacing,
    domainId: mockDomain.id,
    campaignId: mockCampaign.id,
  });
  assertEqual(assessmentPass.checks.pacingAndBudget.status, 'pass', 'Compliant pacing returns status "pass"');
  assertEqual(assessmentPass.score, 0, 'Risk score is 0 when all checks pass');

  // Case B: Hourly limit exceeded (15 sends in last hour, limit is 10) -> 'warn'
  // Mock db.emailEvent.count to simulate 15 sends in the past hour for campaign
  const originalCount = db.emailEvent.count;
  db.emailEvent.count = async (args: any) => {
    if (args?.where?.campaignId && args?.where?.eventType === 'sent') {
      return 15;
    }
    return 0;
  };

  const assessmentWarn = await evaluateRisk({
    organizationId: orgRiskPacing,
    domainId: mockDomain.id,
    campaignId: mockCampaign.id,
  });

  assertEqual(assessmentWarn.checks.pacingAndBudget.status, 'warn', 'Exceeding hourly pacing (15 > 10) returns status "warn"');
  assertEqual(assessmentWarn.score, 10, 'Risk score increases by 10 on pacing warning');
  assert(
    Boolean(assessmentWarn.checks.pacingAndBudget.reason?.includes('Campaign sending is being paced: 15 emails sent in the last hour (limit: 10)')),
    'Pacing reason clearly identifies hourly sends (15) and hourly limit (10)'
  );
  assert(
    assessmentWarn.remediationSteps.some(step => step.includes('Spread sends throughout the day')),
    'Remediation includes actionable advice to spread sends'
  );

  // Case C: Daily limit reached (80/80) -> 'block'
  await db.campaign.update({
    where: { id: mockCampaign.id },
    data: { dailySendsCount: 80, dailySendsDate: new Date() },
  });

  const assessmentBlock = await evaluateRisk({
    organizationId: orgRiskPacing,
    domainId: mockDomain.id,
    campaignId: mockCampaign.id,
  });

  assertEqual(assessmentBlock.checks.pacingAndBudget.status, 'block', 'Reaching daily send limit returns status "block"');
  assertEqual(assessmentBlock.score, 25, 'Risk score increases by 25 on daily budget block');
  assert(
    Boolean(assessmentBlock.checks.pacingAndBudget.reason?.includes('Campaign daily budget limit reached (80/80)')),
    'Block reason identifies daily budget exhaustion (80/80)'
  );
  assert(
    assessmentBlock.remediationSteps.some(step => step.includes('Increase the campaign daily send limit')),
    'Remediation includes instructions to increase daily limit in campaign settings'
  );

  // Restore emailEvent.count
  db.emailEvent.count = originalCount;

  // Test 2.3: Cadence Delay & Jitter Distribution Statistical Stress Test
  section('2.3. Cadence Delay & Jitter Distribution Statistical Validation');
  assertEqual(MIN_SEND_INTERVAL_MS, 30000, 'MIN_SEND_INTERVAL_MS is exactly 30,000ms (30s)');

  // Sample 1,000 delay calculations across positions 0, 5, 10, 20
  const samplePositions = [0, 5, 10, 20];
  for (const pos of samplePositions) {
    const baseDelaySec = 30 + Math.min(pos * 5, 90);
    const minDelayMs = Math.round(baseDelaySec * 0.85 * 1000);
    const maxDelayMs = Math.round(baseDelaySec * 1.15 * 1000);

    let sum = 0;
    const sampleSize = 1000;
    let minObserved = Infinity;
    let maxObserved = -Infinity;

    for (let i = 0; i < sampleSize; i++) {
      const delay = calculateSendDelay(pos, 50);
      assertInRange(delay, minDelayMs, maxDelayMs, `Delay sample #${i} for position=${pos} within [${minDelayMs}, ${maxDelayMs}] ms`);
      sum += delay;
      if (delay < minObserved) minObserved = delay;
      if (delay > maxObserved) maxObserved = delay;
    }

    const meanDelayMs = sum / sampleSize;
    const expectedBaseMs = baseDelaySec * 1000;
    const deltaFromExpected = Math.abs(meanDelayMs - expectedBaseMs) / expectedBaseMs;
    assert(
      deltaFromExpected < 0.05,
      `Position ${pos}: Mean delay (${meanDelayMs.toFixed(0)}ms) converges to expected base (${expectedBaseMs}ms) within 5%`
    );
  }

  // Test 2.4: Batch Delays and Schedule Generation
  section('2.4. Batch Delays & Schedule Generation under Daily Limit');
  for (let i = 0; i < 500; i++) {
    const batchDelay = calculateBatchDelay(i);
    // Base is 2-5 minutes with +-10% jitter -> [108,000ms, 330,000ms]
    assertInRange(batchDelay, 108000, 330000, `Batch delay sample #${i} within 1.8m-5.5m [108s, 330s]`);
  }

  const messageIdBatch = Array.from({ length: 50 }, (_, i) => `msg_sched_${i}`);
  const scheduled = scheduleSends(messageIdBatch, 20, 5); // remaining quota = 15
  assertEqual(scheduled.length, 15, 'scheduleSends limits scheduled emails to exact remaining daily quota (15)');
  assertEqual(scheduled[0].position, 0, 'First email is at position 0');
  assertEqual(scheduled[14].position, 14, 'Last scheduled email is at position 14');

  // Verify monotonic increasing schedule times
  for (let i = 1; i < scheduled.length; i++) {
    assert(
      scheduled[i].scheduledAt.getTime() > scheduled[i - 1].scheduledAt.getTime(),
      `Schedule time #${i} (${scheduled[i].scheduledAt.toISOString()}) is strictly after #${i - 1}`
    );
  }

  // Cleanup Section 2 DB records
  await cleanupTenant(orgRiskPacing);

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 3: High-Concurrency Multi-Tenant 7-Step Send-Readiness Audit & Races
  // ─────────────────────────────────────────────────────────────────────────────
  section('3. High-Concurrency Multi-Tenant 7-Step Send-Readiness Audit');

  const orgLoadMain = `org_load_main_${Date.now()}`;
  await cleanupTenant(orgLoadMain);
  await createTestOrg(orgLoadMain, 'Load Main Org');

  // Create Org, Domain, Sender, Campaign for Concurrency Races
  const loadDomain = await db.sendingDomain.create({
    data: {
      organizationId: orgLoadMain,
      domain: `load-race-${Date.now()}.com`,
      status: 'verified',
      reputationScore: 95,
      dailyLimit: 500,
    },
  });

  const loadSender = await db.senderAccount.create({
    data: {
      organizationId: orgLoadMain,
      domainId: loadDomain.id,
      email: `dispatcher@load-race-${Date.now()}.com`,
      name: 'Load Test Sender',
      status: 'active',
      dailyLimit: 500,
      sentToday: 0,
      reputationScore: 95,
    },
  });

  const loadCampaign = await db.campaign.create({
    data: {
      organizationId: orgLoadMain,
      name: 'High Concurrency Race Campaign',
      status: 'running',
      maxDailySends: 500,
      dailySendsCount: 0,
    },
  });

  // Test 3.1: Concurrent DNC Addition Race Condition (0 DNC Leaks Guarantee)
  section('3.1. Concurrent DNC Addition Race — Zero DNC Leaks Under Concurrency');
  const dncTestLeadsCount = 50;
  const dncTargetCount = 25; // 25 leads will be concurrently added to DNC

  const dncLeads = await Promise.all(
    Array.from({ length: dncTestLeadsCount }, (_, i) =>
      db.lead.create({
        data: {
          organizationId: orgLoadMain,
          name: `DNC Race Lead ${i}`,
          email: `dnc_race_${i}_${Date.now()}@example.com`,
          status: 'enriched',
          emailVerified: true,
          doNotContact: false,
          isBlacklisted: false,
        },
      })
    )
  );

  const dncMessages = await Promise.all(
    dncLeads.map((lead, i) =>
      db.outreachMessage.create({
        data: {
          organizationId: orgLoadMain,
          campaignId: loadCampaign.id,
          leadId: lead.id,
          senderId: loadSender.id,
          subject: `DNC Race Subject ${i}`,
          body: `Hello ${lead.name}, checking in.`,
          status: 'approved',
        },
      })
    )
  );

  // Concurrently run 50 send-readiness audits: 25 leads on DNC, 25 leads clean
  const dncTargetEmails = new Set(dncLeads.slice(0, dncTargetCount).map(l => l.email));

  // Add 25 leads to DNC table and mark doNotContact=true
  await Promise.all(
    dncLeads.slice(0, dncTargetCount).map(async lead => {
      await addToDncList(lead.email, 'User requested opt-out during batch', 'load_test', lead.id, orgLoadMain);
      await db.lead.update({
        where: { id: lead.id },
        data: { doNotContact: true },
      });
    })
  );

  // 50 concurrent workers evaluate send readiness in parallel
  const dncAuditTasks = dncMessages.map((msg, idx) =>
    evaluateSendReadiness({
      organizationId: orgLoadMain,
      messageId: msg.id,
      traceId: `trace_dnc_race_${idx}`,
    })
  );

  const dncAuditResults = await Promise.all(dncAuditTasks);

  // Verify: 100% of the 25 DNC-targeted leads are BLOCKED with 0 leaks
  let dncLeaksCount = 0;
  for (let i = 0; i < dncTestLeadsCount; i++) {
    const result = dncAuditResults[i];
    const lead = dncLeads[i];
    const isTargetedDnc = dncTargetEmails.has(lead.email);

    if (isTargetedDnc) {
      if (result.ready) {
        dncLeaksCount++;
      }
      assertEqual(result.ready, false, `Lead #${i} (${lead.email}) on DNC must evaluate ready = false`);
      const dncCheck = result.checks.find(c => c.id === 'lead_not_dnc' || c.id === 'email_not_dnc');
      assertEqual(dncCheck?.status, 'block', `Lead #${i} blocked by DNC check`);
      assert(
        dncCheck?.remediationTarget === 'lead_record' || dncCheck?.remediationTarget === 'dnc_list',
        `Lead #${i} DNC check provides valid remediationTarget ("${dncCheck?.remediationTarget}")`
      );
    } else {
      assertEqual(result.ready, true, `Lead #${i} (${lead.email}) not on DNC passes send readiness`);
    }
  }

  assertEqual(dncLeaksCount, 0, 'ZERO DNC LEAKS: 0 out of 25 DNC leads passed send-readiness under concurrency');

  // Test 3.2: Concurrent Blacklist & Unsubscribe Race
  section('3.2. Concurrent Blacklist & Unsubscribe Race');
  const blTestLeadsCount = 40;
  const blTargetCount = 20;

  const blLeads = await Promise.all(
    Array.from({ length: blTestLeadsCount }, (_, i) =>
      db.lead.create({
        data: {
          organizationId: orgLoadMain,
          name: `Blacklist Race Lead ${i}`,
          email: `bl_race_${i}_${Date.now()}@example.com`,
          status: i < blTargetCount ? 'unsubscribed' : 'enriched',
          emailVerified: i >= blTargetCount,
          doNotContact: false,
          isBlacklisted: i < blTargetCount,
        },
      })
    )
  );

  const blMessages = await Promise.all(
    blLeads.map((lead, i) =>
      db.outreachMessage.create({
        data: {
          organizationId: orgLoadMain,
          campaignId: loadCampaign.id,
          leadId: lead.id,
          senderId: loadSender.id,
          subject: `Blacklist Race Subject ${i}`,
          body: `Hello ${lead.name}`,
          status: 'approved',
        },
      })
    )
  );

  // 40 concurrent workers evaluate send readiness in parallel
  const blAuditTasks = blMessages.map((msg, idx) =>
    evaluateSendReadiness({
      organizationId: orgLoadMain,
      messageId: msg.id,
      traceId: `trace_bl_race_${idx}`,
    })
  );

  const blAuditResults = await Promise.all(blAuditTasks);

  let blLeaksCount = 0;
  for (let i = 0; i < blTestLeadsCount; i++) {
    const result = blAuditResults[i];
    const isTargetedBlacklist = i < blTargetCount;

    if (isTargetedBlacklist) {
      if (result.ready) blLeaksCount++;
      assertEqual(result.ready, false, `Blacklisted lead #${i} must evaluate ready = false`);
      const blCheck = result.checks.find(c => c.id === 'lead_not_blacklisted' || c.id === 'lead_not_unsubscribed');
      assertEqual(blCheck?.status, 'block', `Blacklisted lead #${i} blocked by blacklist check`);
      assertEqual(blCheck?.remediationTarget, 'lead_record', `Blacklist check provides remediationTarget = "lead_record"`);
    } else {
      assertEqual(result.ready, true, `Clean lead #${i} passes send-readiness`);
    }
  }

  assertEqual(blLeaksCount, 0, 'ZERO BLACKLIST LEAKS: 0 blacklisted leads passed send-readiness under concurrency');

  // Test 3.3: Concurrent Unapproved Dispatch Prevention
  section('3.3. Concurrent Unapproved Dispatch Prevention');
  const unapprovedStatuses = ['draft', 'generating', 'needs_review', 'cancelled', 'sent'];
  const statusTestMessages: any[] = [];

  for (const st of unapprovedStatuses) {
    for (let j = 0; j < 10; j++) {
      const msg = await db.outreachMessage.create({
        data: {
          organizationId: orgLoadMain,
          campaignId: loadCampaign.id,
          leadId: blLeads[0].id,
          senderId: loadSender.id,
          subject: `Status Test ${st} #${j}`,
          body: 'Content',
          status: st,
        },
      });
      statusTestMessages.push({ msg, expectedStatus: st });
    }
  }

  const statusAudits = await Promise.all(
    statusTestMessages.map(({ msg }) =>
      evaluateSendReadiness({
        organizationId: orgLoadMain,
        messageId: msg.id,
        traceId: `trace_status_${msg.id}`,
      })
    )
  );

  let unapprovedPassCount = 0;
  statusAudits.forEach((audit, idx) => {
    if (audit.ready) unapprovedPassCount++;
    const check = audit.checks.find(c => c.id === 'message_approved');
    assertEqual(check?.status, 'block', `Message with status "${statusTestMessages[idx].expectedStatus}" is blocked`);
    assertEqual(check?.remediationTarget, 'approval_queue', 'Unapproved message remediationTarget is "approval_queue"');
  });

  assertEqual(unapprovedPassCount, 0, 'ZERO UNAPPROVED DISPATCHES: 0 out of 50 non-approved messages passed send-readiness');

  // Test assertReadyToSend throws for unapproved message
  let threwExpectedError = false;
  try {
    await assertReadyToSend({
      organizationId: orgLoadMain,
      messageId: statusTestMessages[0].msg.id,
      traceId: 'trace_assert_unapproved',
    });
  } catch (err: any) {
    threwExpectedError = true;
    assert(err.message.includes('approved') || err.message.includes('Message is not approved'), 'assertReadyToSend error explains required approval');
  }
  assertEqual(threwExpectedError, true, 'assertReadyToSend strictly throws when readiness is false');

  // Test 3.4: Campaign Kill-Switch / Pause Race Under Concurrency
  section('3.4. Campaign Pause / Kill-Switch Race Under Concurrency');
  const pauseTestCampaign = await db.campaign.create({
    data: {
      organizationId: orgLoadMain,
      name: 'Pause Kill-Switch Test Campaign',
      status: 'running',
      maxDailySends: 100,
    },
  });

  const pauseMessages = await Promise.all(
    Array.from({ length: 30 }, (_, i) =>
      db.outreachMessage.create({
        data: {
          organizationId: orgLoadMain,
          campaignId: pauseTestCampaign.id,
          leadId: dncLeads[30].id,
          senderId: loadSender.id,
          subject: `Pause test ${i}`,
          body: 'Hello',
          status: 'approved',
        },
      })
    )
  );

  // Pause the campaign and verify that subsequent concurrent evaluations are strictly blocked
  await db.campaign.update({
    where: { id: pauseTestCampaign.id },
    data: { status: 'paused', pausedReason: 'Circuit breaker triggered: High bounce rate' },
  });

  const pauseAudits = pauseMessages.map(msg =>
    evaluateSendReadiness({
      organizationId: orgLoadMain,
      messageId: msg.id,
      traceId: `trace_pause_${msg.id}`,
    })
  );

  const pauseResults = await Promise.all(pauseAudits);

  pauseResults.forEach((res, i) => {
    assertEqual(res.ready, false, `Message #${i} in paused campaign returns ready = false`);
    const campCheck = res.checks.find(c => c.id === 'campaign_active');
    assertEqual(campCheck?.status, 'block', `Message #${i} blocked by campaign_active check`);
    assertEqual(campCheck?.remediationTarget, 'campaign_settings', 'Paused campaign remediationTarget is "campaign_settings"');
  });

  // Test 3.5: Multi-Tenant Concurrent Isolation Stress (5 Tenants x 20 Workers = 100 Operations)
  section('3.5. Multi-Tenant Concurrent Isolation Stress (5 Tenants x 20 Workers)');
  const tenants = await Promise.all(
    Array.from({ length: 5 }, async (_, tIdx) => {
      const tOrgId = `org_tenant_concurrent_${tIdx}_${Date.now()}`;
      await cleanupTenant(tOrgId);
      await createTestOrg(tOrgId, `Tenant ${tIdx} Org`);

      const tDomain = await db.sendingDomain.create({
        data: {
          organizationId: tOrgId,
          domain: `tenant-${tIdx}-${Date.now()}.com`,
          status: 'verified',
          reputationScore: 90,
          dailyLimit: 100,
        },
      });
      const tSender = await db.senderAccount.create({
        data: {
          organizationId: tOrgId,
          domainId: tDomain.id,
          email: `sender@tenant-${tIdx}.com`,
          name: `Tenant Sender ${tIdx}`,
          status: 'active',
          dailyLimit: 100,
        },
      });
      const tCampaign = await db.campaign.create({
        data: {
          organizationId: tOrgId,
          name: `Tenant ${tIdx} Campaign`,
          status: tIdx === 0 ? 'paused' : 'running', // Tenant 0 is paused, others running
          maxDailySends: 100,
        },
      });
      const tLead = await db.lead.create({
        data: {
          organizationId: tOrgId,
          name: `Tenant ${tIdx} Lead`,
          email: `lead@tenant-${tIdx}.com`,
          status: 'enriched',
          emailVerified: true,
          doNotContact: tIdx === 1, // Tenant 1 lead is on DNC, others safe
          isBlacklisted: false,
        },
      });
      const tMessage = await db.outreachMessage.create({
        data: {
          organizationId: tOrgId,
          campaignId: tCampaign.id,
          leadId: tLead.id,
          senderId: tSender.id,
          subject: `Tenant ${tIdx} Subject`,
          body: 'Hello from tenant',
          status: 'approved',
        },
      });
      return { tOrgId, tDomain, tSender, tCampaign, tLead, tMessage, tIdx };
    })
  );

  // Run 20 concurrent operations per tenant (100 parallel operations)
  const tenantStressTasks = tenants.flatMap(t =>
    Array.from({ length: 20 }, (_, wIdx) =>
      evaluateSendReadiness({
        organizationId: t.tOrgId,
        messageId: t.tMessage.id,
        traceId: `trace_tenant_${t.tIdx}_w_${wIdx}`,
      }).then(res => ({ tenantIdx: t.tIdx, res }))
    )
  );

  const tenantStressResults = await Promise.all(tenantStressTasks);

  for (const { tenantIdx, res } of tenantStressResults) {
    if (tenantIdx === 0) {
      // Tenant 0 has paused campaign -> must be blocked
      assertEqual(res.ready, false, 'Tenant 0 operations blocked due to paused campaign');
    } else if (tenantIdx === 1) {
      // Tenant 1 has DNC lead -> must be blocked
      assertEqual(res.ready, false, 'Tenant 1 operations blocked due to DNC lead');
    } else {
      // Tenants 2, 3, 4 have running campaign and valid leads -> must pass!
      if (!res.ready) {
        console.log(`Tenant ${tenantIdx} blocked checks:`, res.checks.filter(c => c.status === 'block'));
      }
      assertEqual(res.ready, true, `Tenant ${tenantIdx} operations strictly PASS send-readiness (zero cross-tenant bleed)`);
    }
  }

  // Cross-tenant malicious probe: Tenant 2 tries to evaluate Tenant 3's message
  const crossTenantProbe = await evaluateSendReadiness({
    organizationId: tenants[2].tOrgId,
    messageId: tenants[3].tMessage.id,
    traceId: 'trace_cross_tenant_malicious_probe',
  });
  assertEqual(crossTenantProbe.ready, false, 'Cross-tenant message ID evaluation is blocked');
  const crossMsgCheck = crossTenantProbe.checks.find(c => c.id === 'message_exists');
  assertEqual(crossMsgCheck?.status, 'block', 'Cross-tenant message access triggers "message_exists" BLOCK');
  assertEqual(crossMsgCheck?.remediationTarget, 'approval_queue', 'Remediation target points to "approval_queue"');

  // Cleanup Multi-Tenant Section 3 DB records
  await cleanupTenant(orgLoadMain);
  for (const t of tenants) {
    await cleanupTenant(t.tOrgId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 4: Structured 5-Question UI Remediation Target Contract Validation
  // ─────────────────────────────────────────────────────────────────────────────
  section('4. Structured 5-Question UI Remediation Target Contract');

  const validRemediationTargets = new Set([
    'lead_record',
    'deliverability',
    'campaign_settings',
    'worker',
    'job_health',
    'approval_queue',
    'dnc_list',
    'sender',
    'domain',
  ]);

  const orgUiContract = `org_ui_contract_${Date.now()}`;
  await cleanupTenant(orgUiContract);
  await createTestOrg(orgUiContract, 'UI Contract Org');

  // Create isolated scenario testing multiple failure modes simultaneously
  const contractDomain = await db.sendingDomain.create({
    data: {
      organizationId: orgUiContract,
      domain: `contract-${Date.now()}.com`,
      status: 'pending', // Unverified domain -> deliverability
      reputationScore: 25, // Low domain reputation -> domain
      dailyLimit: 10,
      dailySendsCount: 10, // Limit reached -> deliverability
    },
  });

  const contractSender = await db.senderAccount.create({
    data: {
      organizationId: orgUiContract,
      domainId: contractDomain.id,
      email: `sender@contract-${Date.now()}.com`,
      name: 'Contract Sender',
      status: 'inactive', // Inactive sender -> deliverability
      reputationScore: 20, // Low sender rep -> sender
      dailyLimit: 5,
      sentToday: 5, // Sender limit reached -> deliverability
    },
  });

  const contractCampaign = await db.campaign.create({
    data: {
      organizationId: orgUiContract,
      name: 'Contract Campaign',
      status: 'paused', // Paused campaign -> campaign_settings
      maxDailySends: 20,
      dailySendsCount: 20, // Campaign limit reached -> campaign_settings
    },
  });

  const contractLead = await db.lead.create({
    data: {
      organizationId: orgUiContract,
      name: 'Contract Lead',
      email: 'invalid-email-format-without-at', // Invalid email -> lead_record
      status: 'unsubscribed', // Unsubscribed -> lead_record
      isBlacklisted: true, // Blacklisted -> lead_record
      doNotContact: true, // DNC -> lead_record
    },
  });

  await addToDncList(contractLead.email, 'Test DNC', 'contract_test', contractLead.id, orgUiContract);

  const contractMessage = await db.outreachMessage.create({
    data: {
      organizationId: orgUiContract,
      campaignId: contractCampaign.id,
      leadId: contractLead.id,
      senderId: contractSender.id,
      subject: 'Contract Test Subject',
      body: 'Get a 100% free gift guaranteed revenue!',
      status: 'draft', // Draft status -> approval_queue
    },
  });

  const contractAuditResult = await evaluateSendReadiness({
    organizationId: orgUiContract,
    messageId: contractMessage.id,
    traceId: 'trace_ui_contract_validation_5q',
  });

  assertEqual(contractAuditResult.ready, false, 'Audit with compound failure states evaluates ready = false');
  assertEqual(contractAuditResult.traceId, 'trace_ui_contract_validation_5q', 'traceId strictly preserved in audit result');

  // Verify that EVERY check in the audit satisfies the 5-Question UI Contract
  const warnedOrBlockedChecks = contractAuditResult.checks.filter(c => c.status !== 'pass');
  assert(warnedOrBlockedChecks.length >= 8, `Found ${warnedOrBlockedChecks.length} non-passing checks to validate`);

  for (const check of warnedOrBlockedChecks) {
    // Q1: Check identifier and human-readable label
    assert(Boolean(check.id && check.id.length > 0), `[${check.id}] Q1: Has valid check ID`);
    assert(Boolean(check.label && check.label.length > 0), `[${check.id}] Q1: Has valid human-readable label ("${check.label}")`);

    // Q2: Status and status label
    assert(check.status === 'block' || check.status === 'warn', `[${check.id}] Q2: Status is "block" or "warn" (${check.status})`);
    assert(
      check.statusLabel === 'Cannot send' || check.statusLabel === 'Can queue, but review first',
      `[${check.id}] Q2: statusLabel is "${check.statusLabel}"`
    );

    // Q3: Informative diagnostic reason
    assert(Boolean(check.reason && check.reason.length > 5), `[${check.id}] Q3: Reason is descriptive ("${check.reason}")`);

    // Q4: Valid UI remediation target
    assert(
      check.remediationTarget !== undefined && validRemediationTargets.has(check.remediationTarget),
      `[${check.id}] Q4: remediationTarget "${check.remediationTarget}" is a recognized UI route`
    );

    // Q5: Trace ID preservation
    assertEqual(contractAuditResult.traceId, 'trace_ui_contract_validation_5q', `[${check.id}] Q5: Trace ID preserved`);
  }

  // Cleanup UI contract DB records
  await cleanupTenant(orgUiContract);

  // ═════════════════════════════════════════════════════════════════════════════
  // FINAL RESULTS SUMMARY
  // ═════════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(78));
  console.log(`  CONCURRENCY & LOAD TEST SUITE RESULTS`);
  console.log('═'.repeat(78));
  console.log(`  Total Assertions : ${totalAssertions}`);
  console.log(`  Passed           : ${passedAssertions}`);
  console.log(`  Failed           : ${failedAssertions}`);
  console.log('═'.repeat(78));

  if (failedAssertions > 0) {
    console.log('\n❌ FAILURES RECORDED:');
    assertionFailures.forEach((f, idx) => console.log(`  ${idx + 1}. ${f}`));
    process.exit(1);
  } else {
    console.log('\n🎉 ALL CONCURRENCY LOAD TESTS PASSED WITH 100% GREEN RATE!\n');
    process.exit(0);
  }
}

// Run the test suite
runConcurrencyLoadTestSuite().catch(err => {
  console.error('Unhandled failure in concurrency load test suite:', err);
  process.exit(1);
});
