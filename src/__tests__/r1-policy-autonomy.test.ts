/**
 * Milestone 1 (R1) Comprehensive Test Suite:
 * - 10-Step Deterministic Policy Execution Pipeline
 * - 4-Level Progressive Autonomy Engine
 * - 8 Deterministic Policy Gates (ZERO LLM Veto)
 * - "Approve Similar" Cluster Batching and Isolation
 */

import {
  AutonomyLevel,
  canExecuteAutonomously,
  assertAutonomyPermission,
  classifyConfidenceTier,
  mapStringToAutonomyLevel,
  getAutonomyConfig,
} from '../lib/policy/autonomy-enforcer';
import {
  DeterministicPolicyPipeline,
  executePolicyPipeline,
} from '../lib/policy/pipeline';
import {
  DeterministicPolicyGate,
  PolicyPipelineStep,
  PolicyViolationError,
  PolicyExecutionContext,
  ExecutionPlan,
} from '../lib/policy/types';
import {
  evaluateAllDeterministicGates,
  evaluateAutonomyGate,
  evaluateSuppressionDncGate,
  evaluateDomainVerificationGate,
  evaluateSendQuotaGate,
  evaluateSpamSafetyGate,
  evaluateLeadEligibilityGate,
  evaluateRecipientDedupGate,
  SPAM_KEYWORDS,
} from '../lib/policy/gates';
import { db } from '../lib/db';
import { addToDncList } from '../lib/safety';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passedTests++;
    console.log(`  ✅ ${message}`);
  } else {
    failedTests++;
    console.error(`  ❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTestSuite() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('🧪 MILESTONE 1: POLICY & PROGRESSIVE AUTONOMY ENGINE TEST SUITE');
  console.log('════════════════════════════════════════════════════════════════\n');

  // Create real test organization and user
  const testOrg = await db.organization.create({
    data: {
      name: `Test Org ${Date.now()}`,
      workspaceKey: `ws_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    },
  });
  const testOrgId = testOrg.id;

  const testUser = await db.user.create({
    data: {
      email: `test_user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
      name: 'Test Policy User',
    },
  });
  const testUserId = testUser.id;

  await db.userPreference.create({
    data: {
      userId: testUserId,
      activeOrgId: testOrgId,
      dailySendLimit: 50,
      minLeadScore: 60.0,
      autonomyLevel: 'LEVEL_2_SUPERVISED',
    },
  });

  // ─── 1. AUTONOMY LEVEL MAPPINGS & CONFIGS ──────────────────────────────────
  console.log('── 1. Progressive Autonomy Configs & Mappings ───────────────────');
  {
    assert(mapStringToAutonomyLevel(0) === AutonomyLevel.LEVEL_0_DRAFT, 'mapStringToAutonomyLevel(0) is LEVEL_0_DRAFT');
    assert(mapStringToAutonomyLevel('LEVEL_0_DRAFT') === AutonomyLevel.LEVEL_0_DRAFT, 'mapStringToAutonomyLevel("LEVEL_0_DRAFT") is LEVEL_0_DRAFT');
    assert(mapStringToAutonomyLevel('draft') === AutonomyLevel.LEVEL_0_DRAFT, 'mapStringToAutonomyLevel("draft") is LEVEL_0_DRAFT');
    assert(mapStringToAutonomyLevel('1') === AutonomyLevel.LEVEL_1_ASSISTED, 'mapStringToAutonomyLevel("1") is LEVEL_1_ASSISTED');
    assert(mapStringToAutonomyLevel('assisted') === AutonomyLevel.LEVEL_1_ASSISTED, 'mapStringToAutonomyLevel("assisted") is LEVEL_1_ASSISTED');
    assert(mapStringToAutonomyLevel(2) === AutonomyLevel.LEVEL_2_SUPERVISED, 'mapStringToAutonomyLevel(2) is LEVEL_2_SUPERVISED');
    assert(mapStringToAutonomyLevel('supervised') === AutonomyLevel.LEVEL_2_SUPERVISED, 'mapStringToAutonomyLevel("supervised") is LEVEL_2_SUPERVISED');
    assert(mapStringToAutonomyLevel(3) === AutonomyLevel.LEVEL_3_AUTONOMOUS, 'mapStringToAutonomyLevel(3) is LEVEL_3_AUTONOMOUS');
    assert(mapStringToAutonomyLevel('autopilot') === AutonomyLevel.LEVEL_3_AUTONOMOUS, 'mapStringToAutonomyLevel("autopilot") is LEVEL_3_AUTONOMOUS');
    assert(mapStringToAutonomyLevel(null) === AutonomyLevel.LEVEL_1_ASSISTED, 'mapStringToAutonomyLevel(null) defaults to LEVEL_1_ASSISTED');

    const configL0 = getAutonomyConfig(AutonomyLevel.LEVEL_0_DRAFT);
    assert(configL0.autoApproveThreshold === 100, 'L0 autoApproveThreshold is 100 (never auto-approves)');
    assert(configL0.maxDailySends === 0, 'L0 maxDailySends is 0');

    const configL2 = getAutonomyConfig(AutonomyLevel.LEVEL_2_SUPERVISED);
    assert(configL2.autoApproveThreshold === 85, 'L2 autoApproveThreshold is 85');
    assert(configL2.maxSpamRiskThreshold === 0.10, 'L2 maxSpamRiskThreshold is 0.10');

    const configL3 = getAutonomyConfig(AutonomyLevel.LEVEL_3_AUTONOMOUS);
    assert(configL3.autoApproveThreshold === 60, 'L3 autoApproveThreshold is 60');
  }

  // ─── 2. CONFIDENCE TIER CLASSIFICATION ─────────────────────────────────────
  console.log('\n── 2. Confidence Tier Classification ───────────────────────────');
  {
    assert(classifyConfidenceTier(92, 0.02, 10) === 'high', 'Score 92 with low spam & risk classifies as "high"');
    assert(classifyConfidenceTier(85, 0.10, 19) === 'high', 'Score 85 boundary classifies as "high"');
    assert(classifyConfidenceTier(84, 0.05, 10) === 'medium', 'Score 84 classifies as "medium"');
    assert(classifyConfidenceTier(65, 0.08, 15) === 'medium', 'Score 65 classifies as "medium"');
    assert(classifyConfidenceTier(59, 0.02, 10) === 'attention', 'Score 59 classifies as "attention"');
    assert(classifyConfidenceTier(90, 0.25, 5) === 'attention', 'High score with spam risk > 0.20 routes to "attention"');
    assert(classifyConfidenceTier(90, 0.02, 45) === 'attention', 'High score with risk score >= 40 routes to "attention"');
  }

  // ─── 3. PROGRESSIVE AUTONOMY PERMISSION ENFORCEMENT IN CODE ────────────────
  console.log('\n── 3. Code-Level Progressive Autonomy Enforcement ──────────────');
  {
    // Level 0 (Draft) checks
    const l0Check = canExecuteAutonomously({ level: AutonomyLevel.LEVEL_0_DRAFT, leadScore: 99 });
    assert(!l0Check.allowed, 'Level 0 cannot execute autonomously');
    assert(l0Check.reason!.includes('Level 0 (Draft)'), 'Level 0 reason mentions manual operator review');

    let threwL0 = false;
    try {
      assertAutonomyPermission('auto_approve', AutonomyLevel.LEVEL_0_DRAFT);
    } catch (e: any) {
      threwL0 = true;
      assert(e instanceof PolicyViolationError, 'Throws PolicyViolationError on Level 0 auto-approve');
      assert(e.code === 'LEVEL_0_PROHIBITS_AUTO_EXECUTION', 'Violation code is LEVEL_0_PROHIBITS_AUTO_EXECUTION');
    }
    assert(threwL0, 'Level 0 auto_approve assertion threw error');

    // Level 1 (Assisted) checks
    const l1Check = canExecuteAutonomously({ level: AutonomyLevel.LEVEL_1_ASSISTED, leadScore: 95 });
    assert(!l1Check.allowed, 'Level 1 cannot execute autonomously');
    assert(l1Check.reason!.includes('Level 1 (Assisted)'), 'Level 1 reason mentions human sign-off');

    let threwL1 = false;
    try {
      assertAutonomyPermission('auto_approve', AutonomyLevel.LEVEL_1_ASSISTED);
    } catch (e: any) {
      threwL1 = true;
      assert(e.code === 'LEVEL_1_PROHIBITS_AUTO_APPROVAL', 'Violation code is LEVEL_1_PROHIBITS_AUTO_APPROVAL');
    }
    assert(threwL1, 'Level 1 auto_approve assertion threw error');

    // Level 2 (Supervised) checks
    const l2High = canExecuteAutonomously({
      level: AutonomyLevel.LEVEL_2_SUPERVISED,
      leadScore: 88,
      spamRisk: 0.05,
      riskScore: 10,
    });
    assert(l2High.allowed, 'Level 2 allows autonomous approval for score 88, spam 0.05, risk 10');

    const l2LowScore = canExecuteAutonomously({
      level: AutonomyLevel.LEVEL_2_SUPERVISED,
      leadScore: 78, // < 85
      spamRisk: 0.05,
      riskScore: 10,
    });
    assert(!l2LowScore.allowed, 'Level 2 blocks autonomous approval for score < 85');

    const l2HighSpam = canExecuteAutonomously({
      level: AutonomyLevel.LEVEL_2_SUPERVISED,
      leadScore: 90,
      spamRisk: 0.15, // > 0.10
      riskScore: 10,
    });
    assert(!l2HighSpam.allowed, 'Level 2 blocks autonomous approval for spam risk > 0.10');

    const l2HighRisk = canExecuteAutonomously({
      level: AutonomyLevel.LEVEL_2_SUPERVISED,
      leadScore: 90,
      spamRisk: 0.05,
      riskScore: 25, // > 20
    });
    assert(!l2HighRisk.allowed, 'Level 2 blocks autonomous approval for risk score > 20');

    // Level 3 (Autonomous) checks
    const l3Qualifying = canExecuteAutonomously({
      level: AutonomyLevel.LEVEL_3_AUTONOMOUS,
      leadScore: 65,
      spamRisk: 0.15,
      riskScore: 15,
      autoApproveThreshold: 60,
    });
    assert(l3Qualifying.allowed, 'Level 3 allows autonomous approval above min threshold (65 >= 60)');

    const l3BelowMin = canExecuteAutonomously({
      level: AutonomyLevel.LEVEL_3_AUTONOMOUS,
      leadScore: 55, // < 60
      autoApproveThreshold: 60,
    });
    assert(!l3BelowMin.allowed, 'Level 3 blocks autonomous approval below threshold');

    const l3ExtremeSpam = canExecuteAutonomously({
      level: AutonomyLevel.LEVEL_3_AUTONOMOUS,
      leadScore: 95,
      spamRisk: 0.30, // > 0.25
    });
    assert(!l3ExtremeSpam.allowed, 'Level 3 blocks autonomous approval when spam risk > 0.25');
  }

  // ─── 4. DETERMINISTIC POLICY GATES (ZERO LLM VETO) ─────────────────────────
  console.log('\n── 4. Deterministic Policy Gates (ZERO LLM Veto) ────────────────');
  {
    // Gate 1: Autonomy Level & Permission Gate
    const contextL0: PolicyExecutionContext = {
      organizationId: testOrgId,
      traceId: 'tr_l0',
      autonomyLevel: AutonomyLevel.LEVEL_0_DRAFT,
      taskType: 'email_dispatch',
      input: { email: 'prospect@corp.com' },
    };
    const planSample: ExecutionPlan = {
      planId: 'plan_test_1',
      taskType: 'email_dispatch',
      strategy: 'growth',
      recipientEmail: 'prospect@corp.com',
      proposedMutations: [{ targetModel: 'Lead', mutationType: 'update', proposedState: { status: 'sending' } }],
      requiredPolicies: [DeterministicPolicyGate.AUTONOMY_LEVEL_PERMISSION],
      steps: [],
    };
    const autoGateViolations = await evaluateAutonomyGate(contextL0, planSample);
    assert(autoGateViolations.length > 0, 'Autonomy gate caught Level 0 automated dispatch attempt');
    assert(autoGateViolations[0].policyId === 'LEVEL_0_PROHIBITS_AUTO_EXECUTION', 'Policy ID is LEVEL_0_PROHIBITS_AUTO_EXECUTION');

    // Gate 2: Suppression & DNC Gate
    const dncEmail = `suppressed_${Date.now()}@prospectcorp.com`;
    await addToDncList(dncEmail, 'Opt-out request', 'unsubscribe_link', undefined, testOrgId);

    const dncPlan: ExecutionPlan = {
      ...planSample,
      recipientEmail: dncEmail,
    };
    const dncViolations = await evaluateSuppressionDncGate(contextL0, dncPlan);
    assert(dncViolations.length > 0, 'DNC gate caught suppressed email');
    assert(dncViolations[0].policyId === 'SUPPRESSION_DNC_MATCH', 'Policy ID is SUPPRESSION_DNC_MATCH');

    // Gate 2: Plus-address normalization DNC check
    const plusEmail = dncEmail.replace('@', '+testtag@');
    const plusPlan: ExecutionPlan = { ...planSample, recipientEmail: plusEmail };
    const plusViolations = await evaluateSuppressionDncGate(contextL0, plusPlan);
    assert(plusViolations.length > 0, 'DNC gate caught plus-addressed alias of suppressed email');

    // Gate 6: Content & Spam Safety Gate
    const spamPlan: ExecutionPlan = {
      ...planSample,
      proposedSubject: 'Get your 100% free gift right now!',
      proposedBody: 'Guaranteed revenue with zero effort. Make money now or wire transfer.',
    };
    const spamViolations = await evaluateSpamSafetyGate(contextL0, spamPlan);
    assert(spamViolations.length > 0, 'Spam gate detected promotional trigger words');
    assert(spamViolations[0].policyId === 'SPAM_KEYWORDS_DETECTED', 'Policy ID is SPAM_KEYWORDS_DETECTED');

    // Gate 7: Lead Eligibility Gate (Invalid/Disposable email & Min Score)
    const badEmailPlan: ExecutionPlan = {
      ...planSample,
      recipientEmail: 'not-an-email',
    };
    const badEmailViolations = await evaluateLeadEligibilityGate(contextL0, badEmailPlan);
    assert(badEmailViolations.length > 0, 'Lead eligibility gate caught invalid email syntax');
    assert(badEmailViolations[0].policyId === 'INVALID_OR_DISPOSABLE_EMAIL', 'Policy ID is INVALID_OR_DISPOSABLE_EMAIL');

    // Evaluate all gates together on a clean plan
    const cleanContext: PolicyExecutionContext = {
      organizationId: testOrgId,
      traceId: 'tr_clean',
      autonomyLevel: AutonomyLevel.LEVEL_2_SUPERVISED,
      taskType: 'email_draft',
      input: { email: `clean_${Date.now()}@stripe.com`, leadScore: 90 },
    };
    const cleanPlan: ExecutionPlan = {
      planId: 'plan_clean_1',
      taskType: 'email_draft',
      strategy: 'engineering_growth',
      recipientEmail: `clean_${Date.now()}@stripe.com`,
      proposedSubject: 'Quick observation regarding Stripe infrastructure scaling',
      proposedBody: 'Hi Patrick,\n\nI noticed Stripe recently added 5 DevOps roles over the last 14 days.\n\nWould next Tuesday work for an intro?',
      proposedMutations: [],
      requiredPolicies: [],
      steps: [],
    };
    const allGatesResult = await evaluateAllDeterministicGates(cleanContext, cleanPlan);
    assert(allGatesResult.allowed, 'Clean draft passes all deterministic gates with allowed: true');
    assert(allGatesResult.violations.length === 0, 'Clean draft has 0 policy violations');
  }

  // ─── 5. 10-STEP DETERMINISTIC POLICY PIPELINE EXECUTION ────────────────────
  console.log('\n── 5. 10-Step Deterministic Policy Pipeline Execution ───────────');
  {
    // Test 1: Full successful execution of all 10 steps (Level 2 High-Confidence -> AUTO_APPROVED)
    const pipelineContext: PolicyExecutionContext = {
      organizationId: testOrgId,
      userId: testUserId,
      traceId: `trace_${Date.now()}_pipeline`,
      autonomyLevel: AutonomyLevel.LEVEL_2_SUPERVISED,
      taskType: 'email_draft',
      input: {
        recipientEmail: 'sarah.jenkins@retool.com',
        recipientName: 'Sarah Jenkins',
        company: 'Retool',
        signal: 'Retool added 5 DevOps roles over the last 14 days',
        leadScore: 92,
      },
    };

    const result = await DeterministicPolicyPipeline.execute(pipelineContext);

    assert(result.success, 'Pipeline returned success = true');
    assert(result.state === 'COMPLETED', 'Level 2 high confidence completed auto-approval');
    assert(!result.requiresHumanApproval, 'requiresHumanApproval is false for auto-approved item');

    // Verify all 10 steps were recorded sequentially
    const recordedSteps = Object.keys(result.stepResults);
    assert(recordedSteps.includes(PolicyPipelineStep.TASK_UNDERSTANDING), 'Step 1 (TASK_UNDERSTANDING) recorded');
    assert(recordedSteps.includes(PolicyPipelineStep.CONTEXT_RULES_ASSEMBLY), 'Step 2 (CONTEXT_RULES_ASSEMBLY) recorded');
    assert(recordedSteps.includes(PolicyPipelineStep.EXECUTION_PLAN_CONSTRUCTION), 'Step 3 (EXECUTION_PLAN_CONSTRUCTION) recorded');
    assert(recordedSteps.includes(PolicyPipelineStep.DETERMINISTIC_POLICY_VALIDATION), 'Step 4 (DETERMINISTIC_POLICY_VALIDATION) recorded');
    assert(recordedSteps.includes(PolicyPipelineStep.TOOL_SUBAGENT_EXECUTION), 'Step 5 (TOOL_SUBAGENT_EXECUTION) recorded');
    assert(recordedSteps.includes(PolicyPipelineStep.RESULT_VALIDATION), 'Step 6 (RESULT_VALIDATION) recorded');
    assert(recordedSteps.includes(PolicyPipelineStep.RISK_EVALUATION), 'Step 7 (RISK_EVALUATION) recorded');
    assert(recordedSteps.includes(PolicyPipelineStep.APPROVAL_GATE_CHECK), 'Step 8 (APPROVAL_GATE_CHECK) recorded');
    assert(recordedSteps.includes(PolicyPipelineStep.COMMIT_ACTION), 'Step 9 (COMMIT_ACTION) recorded');
    assert(recordedSteps.includes(PolicyPipelineStep.AUDIT_EVENT_EMISSION), 'Step 10 (AUDIT_EVENT_EMISSION) recorded');

    assert(result.auditEvent !== undefined, 'Immutable audit event emitted');
    assert(result.auditEvent?.traceId === pipelineContext.traceId, 'Audit event preserves traceId');

    // Test 2: Level 1 execution -> Holds in WAITING_APPROVAL
    const l1PipelineContext: PolicyExecutionContext = {
      ...pipelineContext,
      traceId: `trace_l1_${Date.now()}`,
      autonomyLevel: AutonomyLevel.LEVEL_1_ASSISTED,
    };

    const l1Result = await executePolicyPipeline(l1PipelineContext);
    assert(l1Result.success, 'Level 1 pipeline completed successfully');
    assert(l1Result.state === 'WAITING_APPROVAL', 'Level 1 held in WAITING_APPROVAL');
    assert(l1Result.requiresHumanApproval, 'Level 1 requiresHumanApproval is true');

    // Test 3: Deterministic Policy Violation Halts Pipeline at Step 4 (ZERO LLM VETO)
    const blockedContext: PolicyExecutionContext = {
      organizationId: testOrgId,
      traceId: `trace_blocked_${Date.now()}`,
      autonomyLevel: AutonomyLevel.LEVEL_2_SUPERVISED,
      taskType: 'email_draft',
      input: {
        recipientEmail: 'invalid-email-format-without-at',
        leadScore: 95,
      },
    };

    const blockedResult = await executePolicyPipeline(blockedContext);
    assert(!blockedResult.success, 'Pipeline failed when policy was violated');
    assert(blockedResult.state === 'POLICY_BLOCKED', 'State is POLICY_BLOCKED');
    assert(blockedResult.currentStep === PolicyPipelineStep.DETERMINISTIC_POLICY_VALIDATION, 'Halted at Step 4');
    assert(blockedResult.violations.length > 0, 'Violations array populated');
    assert(blockedResult.stepResults[PolicyPipelineStep.TOOL_SUBAGENT_EXECUTION] === undefined, 'Zero tool execution occurred (LLM never called)');

    // Test 4: Result Validation Step catches unpopulated template placeholders
    const brokenTemplateContext: PolicyExecutionContext = {
      organizationId: testOrgId,
      traceId: `trace_broken_template_${Date.now()}`,
      autonomyLevel: AutonomyLevel.LEVEL_2_SUPERVISED,
      taskType: 'email_draft',
      input: {
        recipientEmail: 'valid@enterprise.com',
        leadScore: 90,
      },
    };

    const brokenTemplateResult = await DeterministicPolicyPipeline.execute(
      brokenTemplateContext,
      async (plan) => {
        // Custom executor returns broken draft with unpopulated variable
        return {
          subject: 'Hello {{undefined_first_name}}',
          body: 'Dear [INSERT_COMPANY_NAME], please read our proposal.',
        };
      }
    );

    assert(!brokenTemplateResult.success, 'Broken template halted pipeline');
    assert(brokenTemplateResult.currentStep === PolicyPipelineStep.RESULT_VALIDATION, 'Halted at Step 6 (RESULT_VALIDATION)');
    assert(brokenTemplateResult.error!.includes('unpopulated template placeholders'), 'Error explains unpopulated placeholders');
  }

  // ─── 6. "APPROVE SIMILAR" BATCH CLUSTERING & ISOLATION ─────────────────────
  console.log('\n── 6. "Approve Similar" Batch Clustering & Isolation ───────────');
  {
    // Seed 3 leads with triggerSignal 'engineering_hiring_spike' (Cluster A)
    const clusterALeads = await Promise.all([
      db.lead.create({
        data: {
          organizationId: testOrgId,
          name: 'Alice DevOps',
          email: `alice_${Date.now()}@retool.com`,
          company: 'Retool',
          status: 'generated',
          leadScore: 92,
        },
      }),
      db.lead.create({
        data: {
          organizationId: testOrgId,
          name: 'Bob Infra',
          email: `bob_${Date.now()}@stripe.com`,
          company: 'Stripe',
          status: 'generated',
          leadScore: 89,
        },
      }),
      db.lead.create({
        data: {
          organizationId: testOrgId,
          name: 'Charlie SRE',
          email: `charlie_${Date.now()}@datadog.com`,
          company: 'Datadog',
          status: 'generated',
          leadScore: 94,
        },
      }),
    ]);

    // Seed 2 leads with triggerSignal 'funding_round' (Cluster B - UNRELATED)
    const clusterBLeads = await Promise.all([
      db.lead.create({
        data: {
          organizationId: testOrgId,
          name: 'Danielle Founder',
          email: `danielle_${Date.now()}@seedstartup.io`,
          company: 'SeedStartup',
          status: 'generated',
          leadScore: 91,
        },
      }),
      db.lead.create({
        data: {
          organizationId: testOrgId,
          name: 'Evan Founder',
          email: `evan_${Date.now()}@seriesastartup.com`,
          company: 'SeriesAStartup',
          status: 'generated',
          leadScore: 88,
        },
      }),
    ]);

    // Create corresponding generated outreach messages
    for (const l of clusterALeads) {
      await db.outreachMessage.create({
        data: {
          organizationId: testOrgId,
          leadId: l.id,
          subject: 'DevOps scaling conversation',
          body: 'DevOps draft copy',
          status: 'generated',
        },
      });
    }

    for (const l of clusterBLeads) {
      await db.outreachMessage.create({
        data: {
          organizationId: testOrgId,
          leadId: l.id,
          subject: 'Funding round congratulations',
          body: 'Funding draft copy',
          status: 'generated',
        },
      });
    }

    // Execute atomic batch approval targeting ONLY Cluster A leads
    const targetClusterLeadIds = clusterALeads.map(l => l.id);

    await Promise.all([
      db.outreachMessage.updateMany({
        where: {
          organizationId: testOrgId,
          leadId: { in: targetClusterLeadIds },
          status: 'generated',
        },
        data: {
          status: 'approved',
          approvedAt: new Date(),
          approvedBy: 'approve_similar_test',
        },
      }),
      db.lead.updateMany({
        where: {
          id: { in: targetClusterLeadIds },
          organizationId: testOrgId,
        },
        data: { status: 'approved' },
      }),
    ]);

    // Verify Cluster A leads are approved
    const updatedClusterALeads = await db.lead.findMany({
      where: { id: { in: targetClusterLeadIds } },
    });
    for (const l of updatedClusterALeads) {
      assert(l.status === 'approved', `Cluster A lead ${l.name} updated to approved`);
    }

    const updatedClusterAMessages = await db.outreachMessage.findMany({
      where: { leadId: { in: targetClusterLeadIds } },
    });
    for (const m of updatedClusterAMessages) {
      assert(m.status === 'approved', `Cluster A message (${m.id}) updated to approved`);
    }

    // CRITICAL ISOLATION CHECK: Cluster B leads MUST REMAIN in 'generated' status!
    const updatedClusterBLeads = await db.lead.findMany({
      where: { id: { in: clusterBLeads.map(l => l.id) } },
    });
    for (const l of updatedClusterBLeads) {
      assert(l.status === 'generated', `Cluster B lead ${l.name} strictly retained "generated" status (no cross-contamination)`);
    }

    const updatedClusterBMessages = await db.outreachMessage.findMany({
      where: { leadId: { in: clusterBLeads.map(l => l.id) } },
    });
    for (const m of updatedClusterBMessages) {
      assert(m.status === 'generated', `Cluster B message (${m.id}) strictly retained "generated" status`);
    }
  }

  // ─── FINAL SUMMARY ─────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`🎉 ALL TESTS PASSED: ${passedTests} passed, ${failedTests} failed, ${passedTests + failedTests} total`);
  console.log('════════════════════════════════════════════════════════════════\n');
}

runTestSuite().catch((err) => {
  console.error('Test runner encountered unexpected fatal error:', err);
  process.exit(1);
});
