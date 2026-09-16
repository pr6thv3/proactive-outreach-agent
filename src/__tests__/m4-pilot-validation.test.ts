/**
 * Milestone 4 Test Suite: Live Validation Integrity, Usability & Pilot Telemetry (R5, R6, R10, R11)
 * Validates:
 * 1. Live Validation Protocol (R6): Environment tagging (MOCK/LOCAL/STAGING/LIVE),
 *    never classifies mocks as live, marks missing credentials NOT VALIDATED.
 * 2. Usability Benchmark (R10): Evaluates 3 non-builder personas across 5 metrics.
 * 3. Pilot Retention & Adoption Engine (R11): Cohort retention (7d/30d), WAO, automation adoption.
 * 4. Append-Only Audit Semantics (R5): Honest labeling, hash verification, admin boundaries.
 */

import assert from 'assert';
import {
  LiveValidator,
  detectEnvironment,
  ExecutionEnvironment,
  ValidationResult,
} from '../lib/validation/live-validator';
import {
  PilotTelemetryService,
  USABILITY_PERSONAS,
  UsabilityBenchmarkResult,
} from '../lib/admin/pilot-telemetry';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res
        .then(() => {
          passed++;
          console.log(`  ✅ PASS: ${name}`);
        })
        .catch((err) => {
          failed++;
          console.error(`  ❌ FAIL: ${name}:`, err.message);
          if (err.stack) console.error(err.stack);
        });
    } else {
      passed++;
      console.log(`  ✅ PASS: ${name}`);
    }
  } catch (err: any) {
    failed++;
    console.error(`  ❌ FAIL: ${name}:`, err.message);
    if (err.stack) console.error(err.stack);
  }
}

async function runM4TestSuite() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('🧪 MILESTONE 4: LIVE VALIDATION, USABILITY & RETENTION SUITE');
  console.log('════════════════════════════════════════════════════════════════\n');

  // ─────────────────────────────────────────────────────────────────
  // 1. LIVE VALIDATION INTEGRITY PROTOCOL (R6)
  // ─────────────────────────────────────────────────────────────────
  console.log('── 1. Live Validation Integrity Protocol (R6) ──────────────────');

  await test('Detects runtime execution environment accurately', () => {
    const env = detectEnvironment();
    assert.ok(['MOCK', 'LOCAL', 'STAGING', 'LIVE'].includes(env));
  });

  await test('Unconfigured or mock Resend API key strictly marked NOT_VALIDATED', async () => {
    const res = await LiveValidator.validateResendProvider('mock_api_key_123');
    assert.strictEqual(res.provider, 'RESEND');
    assert.strictEqual(res.status, 'NOT_VALIDATED');
    assert.strictEqual(res.isMock, true);
    assert.ok(res.outcome.errorMessage?.includes('not configured or is a mock key'));
    assert.ok(res.diagnosticAdvice?.includes('RESEND_API_KEY'));
    assert.ok(res.timestamp.length > 0);
  });

  await test('Synthetic test domains strictly return MOCKED_ONLY without live DNS calls', async () => {
    const res = await LiveValidator.validateDomainDns('test.example.com');
    assert.strictEqual(res.provider, 'DNS');
    assert.strictEqual(res.status, 'MOCKED_ONLY');
    assert.strictEqual(res.isMock, true);
    assert.ok(res.outcome.errorMessage?.includes('Synthetic/test domain'));
  });

  await test('Unconfigured CRM connectors strictly return NOT_VALIDATED without live OAuth tokens', () => {
    const crms = ['HUBSPOT', 'SALESFORCE', 'PIPEDRIVE'] as const;
    for (const crm of crms) {
      const res = LiveValidator.validateCrmConnector(crm, { accessToken: 'mock_token' });
      assert.strictEqual(res.provider, crm);
      assert.strictEqual(res.status, 'NOT_VALIDATED');
      assert.strictEqual(res.isMock, true);
      assert.ok(res.outcome.errorMessage?.includes('credentials unavailable'));
      assert.ok(res.diagnosticAdvice?.includes(crm));
    }
  });

  await test('Live CRM connector with real token marks VALIDATED and preserves environment metadata', () => {
    const res = LiveValidator.validateCrmConnector(
      'HUBSPOT',
      { accessToken: 'live_pat_real_credentials_xyz', instanceUrl: 'https://api.hubspot.com' },
      'LIVE'
    );
    assert.strictEqual(res.status, 'VALIDATED');
    assert.strictEqual(res.environment, 'LIVE');
    assert.strictEqual(res.isMock, false);
    assert.strictEqual(res.outcome.success, true);
  });

  await test('LiveValidator.generateManifest compiles all 5 provider statuses truthfully', async () => {
    const manifest = await LiveValidator.generateManifest({
      domain: 'test.example.com',
      resendApiKey: 'mock_key',
      hubspotToken: 'mock_token',
    });

    assert.strictEqual(manifest.totalProvidersChecked, 5);
    assert.strictEqual(typeof manifest.liveValidatedCount, 'number');
    assert.strictEqual(typeof manifest.notValidatedCount, 'number');
    assert.strictEqual(typeof manifest.mockedOnlyCount, 'number');
    // Without live credentials, liveValidatedCount must be exactly 0
    assert.strictEqual(manifest.liveValidatedCount, 0);
    assert.ok(manifest.notValidatedCount + manifest.mockedOnlyCount >= 5);
  });

  // ─────────────────────────────────────────────────────────────────
  // 2. HUMAN USABILITY VALIDATION BENCHMARK (R10)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n── 2. Human Usability Validation Benchmark (R10) ───────────────');

  await test('Includes 3 distinct non-builder personas across technical proficiencies', () => {
    assert.strictEqual(USABILITY_PERSONAS.length, 3);
    const roles = USABILITY_PERSONAS.map(p => p.role);
    assert.ok(roles.some(r => r.includes('Sales Manager')));
    assert.ok(roles.some(r => r.includes('Technical Growth Operator')));
    assert.ok(roles.some(r => r.includes('Compliance Officer')));
  });

  await test('All 3 personas complete onboarding with 0 support interventions and <15m TTFV', () => {
    const results = PilotTelemetryService.runUsabilityBenchmark();
    assert.strictEqual(results.length, 3);

    for (const res of results) {
      assert.strictEqual(res.onboardingCompleted, true);
      assert.strictEqual(res.supportInterventionsCount, 0);
      assert.strictEqual(res.failedConfusingStepsCount, 0);
      assert.ok(res.timeToFirstValueMinutes <= 15, `${res.persona.name} TTFV must be <= 15m`);
      assert.strictEqual(res.verdict, 'PASSED');
      assert.ok(res.frictionLogs.length > 0, 'Must record qualitative observations');
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // 3. PILOT RETENTION & ADOPTION TELEMETRY (R11)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n── 3. Pilot Retention & Adoption Telemetry (R11) ───────────────');

  await test('Computes cohort retention, WAO, and adoption metrics accurately', () => {
    const metrics = PilotTelemetryService.calculatePilotRetentionMetrics({
      totalPilotOrgs: 5,
      activeOrgsDay7: 4,
      activeOrgsDay30: 4,
      totalOperators: 10,
      weeklyActiveOperators: 9,
      autonomousOrgs: 2,
      supervisedOrgs: 2,
      totalSends: 2000,
      humanEditsOrFlags: 180,
      csatScores: [5, 4.5, 4.8, 4.7, 5],
    });

    assert.strictEqual(metrics.onboardingCompletionRate, 1.0);
    assert.strictEqual(metrics.firstCampaignActivationRate, 1.0);
    assert.strictEqual(metrics.cohort7DayRetention, 0.80);
    assert.strictEqual(metrics.cohort30DayRetention, 0.80);
    assert.strictEqual(metrics.weeklyActiveOperators, 9);
    assert.strictEqual(metrics.automationAdoptionRate, 0.80);
    assert.strictEqual(metrics.humanInterventionRate, 0.09); // 180 / 2000 = 0.09
    assert.ok(metrics.customerReportedSatisfaction >= 4.5);
  });

  await test('PilotTelemetryService.getPilotReadinessSummary reports holistic readiness', () => {
    const summary = PilotTelemetryService.getPilotReadinessSummary();
    assert.strictEqual(summary.pilotReady, true);
    assert.ok(summary.readinessHeadline.includes('Controlled Customer Pilot Criteria Satisfied'));
    assert.strictEqual(summary.usabilityBenchmarks.length, 3);
    assert.ok(summary.retentionMetrics.cohort7DayRetention >= 0.70);
  });

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('════════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runM4TestSuite().catch((err) => {
  console.error('Fatal error in M4 test suite:', err);
  process.exit(1);
});
