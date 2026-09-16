/**
 * Milestone 3 Test Suite: Exception-Driven UX, Autonomy Modes & Empirical ROI (R1, R4)
 * Validates:
 * 1. Human Autonomy Operating Modes ("Review Everything", "Review Exceptions", "Auto-Run")
 * 2. Operating Mode Mapping Utilities & Operational Boundary Enforcements
 * 3. Exception Service & High-Priority Action Badges with Guided Resolution Steps
 * 4. Configurable Empirical ROI Engine (4 Customer Baseline Parameters, 3 Transparent Tiers, 0 Padding)
 * 5. 4 Pipeline Efficiency & Unit Economics Metrics (Qualified Reply Rate, Meetings Booked, Hours/Meeting, Cost/Meeting)
 * 6. API Status & Onboarding Routes Handling and Persisting Autonomy Modes
 */

import assert from 'assert';
import { NextRequest } from 'next/server';
import { db as dbClient } from '../lib/db';
const db = dbClient as any;

import { AutonomyLevel } from '../lib/policy/types';
import {
  HumanAutonomyMode,
  mapAutonomyLevelToMode,
  mapModeToAutonomyLevel,
  getHumanModeDetails,
  getAllHumanModes,
  evaluateAutonomyPermission,
} from '../lib/policy/autonomy-mode';
import {
  ActionBadgeType,
  generateActionBadge,
  getGuidedResolutionSteps,
  ExceptionService,
} from '../lib/policy/exception-service';
import {
  CustomerRoiConfig,
  DEFAULT_CUSTOMER_ROI_CONFIG,
  ConfigurableRoiCalculator,
  RoiCalculator,
} from '../lib/admin/roi-calculator';
import { GET as getAutonomyStatus, PATCH as patchAutonomyStatus } from '../app/api/autonomy/status/route';
import { POST as postOnboardingComplete } from '../app/api/onboarding/complete/route';

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

async function runM3TestSuite() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('🧪 MILESTONE 3: EXCEPTION-DRIVEN UX, AUTONOMY MODES & ROI SUITE');
  console.log('════════════════════════════════════════════════════════════════\n');

  // ─────────────────────────────────────────────────────────────────
  // 1. HUMAN AUTONOMY OPERATING MODES & MAPPING UTILITIES (R1)
  // ─────────────────────────────────────────────────────────────────
  console.log('── 1. Human Autonomy Operating Modes (R1) ──────────────────────');

  await test('Maps AutonomyLevel enum values to plain-English operating modes', () => {
    assert.strictEqual(mapAutonomyLevelToMode(AutonomyLevel.LEVEL_0_DRAFT), 'Review Everything');
    assert.strictEqual(mapAutonomyLevelToMode(AutonomyLevel.LEVEL_1_ASSISTED), 'Review Everything');
    assert.strictEqual(mapAutonomyLevelToMode(AutonomyLevel.LEVEL_2_SUPERVISED), 'Review Exceptions');
    assert.strictEqual(mapAutonomyLevelToMode(AutonomyLevel.LEVEL_3_AUTONOMOUS), 'Auto-Run');
  });

  await test('Maps numeric and string level inputs to operating modes gracefully', () => {
    assert.strictEqual(mapAutonomyLevelToMode(0), 'Review Everything');
    assert.strictEqual(mapAutonomyLevelToMode(1), 'Review Everything');
    assert.strictEqual(mapAutonomyLevelToMode(2), 'Review Exceptions');
    assert.strictEqual(mapAutonomyLevelToMode(3), 'Auto-Run');
    assert.strictEqual(mapAutonomyLevelToMode('LEVEL_0_DRAFT'), 'Review Everything');
    assert.strictEqual(mapAutonomyLevelToMode('LEVEL_2_SUPERVISED'), 'Review Exceptions');
    assert.strictEqual(mapAutonomyLevelToMode('LEVEL_3_AUTONOMOUS'), 'Auto-Run');
    assert.strictEqual(mapAutonomyLevelToMode('Review Everything'), 'Review Everything');
    assert.strictEqual(mapAutonomyLevelToMode('Review Exceptions'), 'Review Exceptions');
    assert.strictEqual(mapAutonomyLevelToMode('Auto-Run'), 'Auto-Run');
    assert.strictEqual(mapAutonomyLevelToMode(null), 'Review Everything');
    assert.strictEqual(mapAutonomyLevelToMode(undefined), 'Review Everything');
  });

  await test('Maps plain-English operating modes back to code-level AutonomyLevel', () => {
    assert.strictEqual(mapModeToAutonomyLevel('Review Everything'), AutonomyLevel.LEVEL_1_ASSISTED);
    assert.strictEqual(mapModeToAutonomyLevel('Review Exceptions'), AutonomyLevel.LEVEL_2_SUPERVISED);
    assert.strictEqual(mapModeToAutonomyLevel('Auto-Run'), AutonomyLevel.LEVEL_3_AUTONOMOUS);
    assert.strictEqual(mapModeToAutonomyLevel('REVIEW_EVERYTHING'), AutonomyLevel.LEVEL_1_ASSISTED);
    assert.strictEqual(mapModeToAutonomyLevel('REVIEW_EXCEPTIONS'), AutonomyLevel.LEVEL_2_SUPERVISED);
    assert.strictEqual(mapModeToAutonomyLevel('AUTO_RUN'), AutonomyLevel.LEVEL_3_AUTONOMOUS);
    assert.strictEqual(mapModeToAutonomyLevel('LEVEL_0_DRAFT'), AutonomyLevel.LEVEL_0_DRAFT);
  });

  await test('Provides complete metadata and boundaries for all 3 modes', () => {
    const allModes = getAllHumanModes();
    assert.strictEqual(allModes.length, 3);

    const reviewEverything = getHumanModeDetails('Review Everything');
    assert.strictEqual(reviewEverything.label, 'Review Everything');
    assert.strictEqual(reviewEverything.boundaries.autoApproveThreshold, 100);
    assert.strictEqual(reviewEverything.boundaries.requiresOperatorSignoff, true);

    const reviewExceptions = getHumanModeDetails('Review Exceptions');
    assert.strictEqual(reviewExceptions.label, 'Review Exceptions');
    assert.strictEqual(reviewExceptions.boundaries.autoApproveThreshold, 85);
    assert.strictEqual(reviewExceptions.boundaries.requiresOperatorSignoff, false);

    const autoRun = getHumanModeDetails('Auto-Run');
    assert.strictEqual(autoRun.label, 'Auto-Run');
    assert.strictEqual(autoRun.boundaries.autoApproveThreshold, 60);
    assert.strictEqual(autoRun.boundaries.maxSpamRiskThreshold, 0.25);
  });

  await test('evaluateAutonomyPermission enforces deterministic boundaries by mode', () => {
    // Review Everything strictly blocks all automated dispatches
    const res1 = evaluateAutonomyPermission({
      mode: 'Review Everything',
      leadScore: 95,
      spamRisk: 0.02,
    });
    assert.strictEqual(res1.allowed, false);
    assert.strictEqual(res1.requiresHumanReview, true);
    assert.ok(res1.reason?.includes('Review Everything mode requires mandatory operator sign-off'));

    // Review Exceptions: Score >= 85 and low spam risk auto-approves
    const res2 = evaluateAutonomyPermission({
      mode: 'Review Exceptions',
      leadScore: 90,
      spamRisk: 0.05,
    });
    assert.strictEqual(res2.allowed, true);
    assert.strictEqual(res2.requiresHumanReview, false);

    // Review Exceptions: Score < 85 routes to Exception Queue
    const res3 = evaluateAutonomyPermission({
      mode: 'Review Exceptions',
      leadScore: 82,
      spamRisk: 0.05,
    });
    assert.strictEqual(res3.allowed, false);
    assert.strictEqual(res3.requiresHumanReview, true);
    assert.ok(res3.reason?.includes('Routing to Exception Queue'));

    // Review Exceptions: Spam risk > 10% routes to Exception Queue
    const res4 = evaluateAutonomyPermission({
      mode: 'Review Exceptions',
      leadScore: 92,
      spamRisk: 0.12,
    });
    assert.strictEqual(res4.allowed, false);
    assert.strictEqual(res4.requiresHumanReview, true);
    assert.ok(res4.reason?.includes('Spam risk'));

    // Auto-Run: Score >= 60 and spam risk <= 25% passes
    const res5 = evaluateAutonomyPermission({
      mode: 'Auto-Run',
      leadScore: 70,
      spamRisk: 0.15,
    });
    assert.strictEqual(res5.allowed, true);
    assert.strictEqual(res5.requiresHumanReview, false);

    // Auto-Run: Score < 60 fails
    const res6 = evaluateAutonomyPermission({
      mode: 'Auto-Run',
      leadScore: 50,
      spamRisk: 0.10,
    });
    assert.strictEqual(res6.allowed, false);
    assert.strictEqual(res6.requiresHumanReview, true);

    // Auto-Run: Critical spam risk > 25% fails
    const res7 = evaluateAutonomyPermission({
      mode: 'Auto-Run',
      leadScore: 80,
      spamRisk: 0.30,
    });
    assert.strictEqual(res7.allowed, false);
    assert.strictEqual(res7.requiresHumanReview, true);
  });

  // ─────────────────────────────────────────────────────────────────
  // 2. EXCEPTION SERVICE & ACTION BADGES (R1)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n── 2. Exception Service & Action Badges (R1) ───────────────────');

  await test('Generates valid action badges with guided resolution for all badge types', () => {
    const badgeTypes: ActionBadgeType[] = [
      'CIRCUIT_BREAKER_TRIPPED',
      'LEGAL_ESCALATION',
      'EMERGENCY_STOP_ACTIVE',
      'UNVERIFIED_SENDER_DOMAIN',
      'RISK_GATE_HOLD',
      'LOW_CONFIDENCE_REVIEW',
      'SPAM_RISK_ELEVATED',
      'SECONDARY_INTENT_REFERRAL',
      'RATE_LIMIT_NEAR_CEILING',
    ];

    for (const type of badgeTypes) {
      const badge = generateActionBadge(type);
      assert.strictEqual(badge.type, type);
      assert.ok(badge.label.length > 0, `Badge ${type} must have label`);
      assert.ok(badge.guidedResolution.length > 0, `Badge ${type} must have guided resolution`);
      assert.ok(['CRITICAL', 'HIGH', 'MEDIUM', 'INFO'].includes(badge.severity));
      assert.ok(badge.actionLabel.length > 0, `Badge ${type} must have action label`);

      const steps = getGuidedResolutionSteps(type);
      assert.ok(Array.isArray(steps) && steps.length >= 3, `Badge ${type} must provide at least 3 guided steps`);
    }
  });

  await test('CRITICAL action badges correctly flagged for safety and regulatory events', () => {
    const cbBadge = generateActionBadge('CIRCUIT_BREAKER_TRIPPED');
    assert.strictEqual(cbBadge.severity, 'CRITICAL');
    assert.ok(cbBadge.guidedResolution.includes('Reset Circuit Breaker'));

    const legalBadge = generateActionBadge('LEGAL_ESCALATION');
    assert.strictEqual(legalBadge.severity, 'CRITICAL');
    assert.ok(legalBadge.guidedResolution.includes('DNC suppression'));

    const estopBadge = generateActionBadge('EMERGENCY_STOP_ACTIVE');
    assert.strictEqual(estopBadge.severity, 'CRITICAL');
  });

  await test('ExceptionService.getActiveExceptions reports zero state cleanly when 0 exceptions', async () => {
    const testOrgId = `org_clean_${Date.now()}`;
    const report = await ExceptionService.getActiveExceptions(testOrgId);

    assert.strictEqual(typeof report.count, 'number');
    assert.strictEqual(typeof report.criticalCount, 'number');
    assert.strictEqual(typeof report.hasBlockers, 'boolean');
    assert.ok(Array.isArray(report.exceptions));
    assert.ok(report.zeroStateHeadline.includes('All 7 Policy Gates Passing'));
  });

  // ─────────────────────────────────────────────────────────────────
  // 3. CONFIGURABLE EMPIRICAL ROI ENGINE (R4)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n── 3. Configurable Empirical ROI Engine (R4) ───────────────────');

  await test('Empty workspace with 0 activity strictly returns 0 savings with zero synthetic padding', () => {
    const zeroResult = ConfigurableRoiCalculator.calculate({
      verifiedSends: 0,
      qualifiedReplies: 0,
      meetingsBooked: 0,
      leadsResearched: 0,
    });

    // Tier 1: Measured Savings
    assert.strictEqual(zeroResult.measuredSavings.verifiedSends, 0);
    assert.strictEqual(zeroResult.measuredSavings.qualifiedReplies, 0);
    assert.strictEqual(zeroResult.measuredSavings.meetingsBooked, 0);
    assert.strictEqual(zeroResult.measuredSavings.totalAutomationCostUsd, 0);

    // Tier 2: Estimated Savings
    assert.strictEqual(zeroResult.estimatedSavings.hoursSaved, 0);
    assert.strictEqual(zeroResult.estimatedSavings.grossSavingsUsd, 0);
    assert.strictEqual(zeroResult.estimatedSavings.totalAutomationCostUsd, 0);
    assert.strictEqual(zeroResult.estimatedSavings.netSavingsUsd, 0);
    assert.strictEqual(zeroResult.estimatedSavings.roiPercentage, 0);
    assert.strictEqual(zeroResult.estimatedSavings.paybackDays, 0);

    // Pipeline Efficiency Metrics
    assert.strictEqual(zeroResult.pipelineEfficiency.qualifiedReplyRate, 0);
    assert.strictEqual(zeroResult.pipelineEfficiency.meetingsBooked, 0);
    assert.strictEqual(zeroResult.pipelineEfficiency.hoursSavedPerMeeting, 0);
    assert.strictEqual(zeroResult.pipelineEfficiency.costPerQualifiedMeeting, 0);
  });

  await test('Calculates empirical savings across the 4 customer baseline parameters', () => {
    const customConfig: CustomerRoiConfig = {
      researchMinutesPerLead: 20,
      copyMinutesPerLead: 10,
      replyMinutes: 15,
      hourlyLaborRate: 60,
    };

    const activity = {
      verifiedSends: 300,
      qualifiedReplies: 24,
      meetingsBooked: 6,
    };

    const result = ConfigurableRoiCalculator.calculate(activity, customConfig);

    // Expected minutes saved:
    // Sends: 300 * (20 + 10) = 9000 min
    // Replies: 24 * 15 = 360 min
    // Total min: 9360 min = 156 hours
    assert.strictEqual(result.estimatedSavings.hoursSaved, 156);

    // Gross labor value: 156 hrs * $60/hr = $9,360
    assert.strictEqual(result.estimatedSavings.grossSavingsUsd, 9360);

    // Total automation cost: 300 * $0.004 = $1.20
    assert.strictEqual(result.estimatedSavings.totalAutomationCostUsd, 1.2);

    // Net value: $9360 - $1.20 = $9,358.80
    assert.strictEqual(result.estimatedSavings.netSavingsUsd, 9358.8);

    // Positive ROI %
    assert.ok(result.estimatedSavings.roiPercentage > 10000);

    // Customer assumptions preserved
    assert.deepStrictEqual(result.customerAssumptions, customConfig);
  });

  await test('Computes all 4 pipeline efficiency metrics accurately', () => {
    const activity = {
      verifiedSends: 500,
      qualifiedReplies: 40,
      meetingsBooked: 8,
    };

    const result = ConfigurableRoiCalculator.calculate(activity);

    // 1. Qualified Reply Rate: 40 / 500 = 0.08 (8%)
    assert.strictEqual(result.pipelineEfficiency.qualifiedReplyRate, 0.08);

    // 2. Meetings Booked: 8
    assert.strictEqual(result.pipelineEfficiency.meetingsBooked, 8);

    // 3. Hours Saved / Meeting: netHoursSaved / 8
    const expectedHoursPerMeeting = Number((result.estimatedSavings.hoursSaved / 8).toFixed(2));
    assert.strictEqual(result.pipelineEfficiency.hoursSavedPerMeeting, expectedHoursPerMeeting);

    // 4. Cost / Qualified Meeting: totalAutomationCostUsd / 8
    const expectedCostPerMeeting = Number((result.estimatedSavings.totalAutomationCostUsd / 8).toFixed(2));
    assert.strictEqual(result.pipelineEfficiency.costPerQualifiedMeeting, expectedCostPerMeeting);
  });

  await test('Clamps negative customer inputs to zero preventing corrupted math', () => {
    const negativeConfig = {
      researchMinutesPerLead: -15,
      copyMinutesPerLead: -10,
      replyMinutes: -5,
      hourlyLaborRate: -50,
    };

    const result = ConfigurableRoiCalculator.calculate(
      { verifiedSends: 100, qualifiedReplies: 10, meetingsBooked: 2 },
      negativeConfig
    );

    assert.strictEqual(result.customerAssumptions.researchMinutesPerLead, 0);
    assert.strictEqual(result.customerAssumptions.copyMinutesPerLead, 0);
    assert.strictEqual(result.customerAssumptions.replyMinutes, 0);
    assert.strictEqual(result.customerAssumptions.hourlyLaborRate, 0);
    assert.strictEqual(result.estimatedSavings.hoursSaved, 0);
    assert.strictEqual(result.estimatedSavings.grossSavingsUsd, 0);
  });

  await test('RoiCalculator.calculateRoi returns 3 transparent tiers and pipeline efficiency aliases', async () => {
    const report = await RoiCalculator.calculateRoi('org_test', {
      hourlyLaborRate: 50,
      researchMinutesPerLead: 15,
      copyMinutesPerLead: 5,
    });

    assert.ok(report.measuredSavings, 'Must include measuredSavings tier');
    assert.ok(report.estimatedSavings, 'Must include estimatedSavings tier');
    assert.ok(report.customerAssumptions, 'Must include customerAssumptions tier');
    assert.ok(report.pipelineEfficiency, 'Must include pipelineEfficiency tier');

    assert.strictEqual(typeof report.qualified_reply_rate, 'number');
    assert.strictEqual(typeof report.meetings_booked, 'number');
    assert.strictEqual(typeof report.hours_saved_per_meeting, 'number');
    assert.strictEqual(typeof report.cost_per_qualified_meeting, 'number');

    // Legacy compatibility fields
    assert.ok(report.manualHoursAvoided > 0);
    assert.ok(report.netHoursSaved > 0);
    assert.ok(report.grossLaborSavingsUsd > 0);
  });

  // ─────────────────────────────────────────────────────────────────
  // 4. API STATUS & ONBOARDING ROUTE CONTRACTS
  // ─────────────────────────────────────────────────────────────────
  console.log('\n── 4. API Route Autonomy Mode Persistence ──────────────────────');

  await test('PATCH /api/autonomy/status updates and returns autonomyMode', async () => {
    const req = new NextRequest('http://localhost:3000/api/autonomy/status', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'usr_m3_test',
        'x-org-id': 'org_m3_test',
      },
      body: JSON.stringify({
        autonomyMode: 'Review Exceptions',
        minLeadScore: 75,
      }),
    });

    const res = await patchAutonomyStatus(req);
    const json = await res.json();

    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.autonomyMode, 'Review Exceptions');
    assert.ok(
      json.data.autonomyLevel === 'LEVEL_2_SUPERVISED' ||
      json.data.autonomyLevel === AutonomyLevel.LEVEL_2_SUPERVISED
    );
    assert.strictEqual(json.data.minLeadScore, 75);
    assert.ok(json.data.autonomyModeDetails);
  });

  await test('GET /api/autonomy/status returns autonomyMode and human mode details', async () => {
    const req = new NextRequest('http://localhost:3000/api/autonomy/status', {
      method: 'GET',
      headers: {
        'x-user-id': 'usr_m3_test',
        'x-org-id': 'org_m3_test',
      },
    });

    const res = await getAutonomyStatus(req);
    const json = await res.json();

    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.autonomyMode, 'Review Exceptions');
    assert.ok(
      json.data.autonomyLevel === 'LEVEL_2_SUPERVISED' ||
      json.data.autonomyLevel === AutonomyLevel.LEVEL_2_SUPERVISED
    );
    assert.strictEqual(json.data.autonomyModeDetails.label, 'Review Exceptions');
  });

  await test('POST /api/onboarding/complete persists autonomyMode to user preference', async () => {
    const req = new NextRequest('http://localhost:3000/api/onboarding/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'usr_m3_onboard',
        'x-org-id': 'org_m3_onboard',
      },
      body: JSON.stringify({
        autonomyMode: 'Auto-Run',
        dailySendLimit: 75,
        minLeadScore: 65,
      }),
    });

    const res = await postOnboardingComplete(req);
    const json = await res.json();

    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.onboardingComplete, true);
    assert.strictEqual(json.data.autonomyMode, 'Auto-Run');
    assert.ok(
      json.data.autonomyLevel === 'LEVEL_3_AUTONOMOUS' ||
      json.data.autonomyLevel === AutonomyLevel.LEVEL_3_AUTONOMOUS
    );
  });

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('════════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runM3TestSuite();
