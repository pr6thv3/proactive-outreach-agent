// ─── MILESTONE 2 (R2, R8) TEST SUITE ──────────────────────────────────
// Multi-Intent Reply Triage, Versioned Policy Precedence Engine (v1.0.0),
// 7-Dimension Conjunct Policy Gate Engine, and Live Inbound Webhook Wiring.
// ─────────────────────────────────────────────────────────────────────

import assert from 'assert';
import crypto from 'crypto';
import { db } from '../lib/db';
import {
  triageInboundReply,
  MultiIntentClassificationResult,
} from '../lib/policy/multi-intent-triage';
import {
  POLICY_PRECEDENCE_VERSION,
  PRECEDENCE_TABLE_V1,
  resolveMultiIntentPrecedence,
  requiresImmediateSuppression,
  requiresHumanEscalation,
  getPrecedenceRule,
  CanonicalIntent,
} from '../lib/policy/reply-precedence';
import {
  evaluateConjunctDispatchGate,
  evaluateAutonomyPermission,
  validateRecipientEmail,
  ConjunctGatingParams,
} from '../lib/policy/conjunct-gates';
import { POST as handleInboundWebhook } from '../app/api/webhooks/inbound/route';
import { classifyReply } from '../lib/agents/reeval/reply-classifier';
import { NextRequest } from 'next/server';

let passed = 0;
let failed = 0;

function section(title: string) {
  console.log(`\n── ${title} ──────────────────────────────────────────`);
}

async function runTest(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  ❌ ${name}:`, err.message);
  }
}

async function runAllTests() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('🧪 MILESTONE 2: MULTI-INTENT TRIAGE & CONJUNCT POLICY GATES');
  console.log('════════════════════════════════════════════════════════════════');

  // ════════════════════════════════════════════════════════════════════
  // 1. MULTI-INTENT REPLY TRIAGE & COMPOUND PARSING
  // ════════════════════════════════════════════════════════════════════
  section('1. Multi-Intent Reply Triage & Compound Parsing');

  await runTest('1.1: Compound Positive Interest + GDPR Right-to-be-Forgotten', () => {
    const text = "Sounds like a great tool and I'd love a demo next Tuesday! However, please remove my personal email immediately and delete all my data under GDPR Article 17.";
    const triage = triageInboundReply(text);

    assert.strictEqual(triage.primary_intent, 'PRIVACY_REQUEST', 'Primary intent must be statutory privacy');
    assert.strictEqual(triage.policy_version, 'v1.0.0', 'Must specify policy version v1.0.0');
    assert.strictEqual(triage.selected_policy, 'POLICY_SAFETY_LEGAL_PRIVACY_ESCALATION');
    assert.strictEqual(triage.required_action, 'IMMEDIATE_DNC_SUPPRESSION_AND_ESCALATION');

    // Secondary intents must preserve conversational opportunities and opt-out
    assert(triage.secondary_intents.includes('MEETING_REQUEST'), 'Should detect MEETING_REQUEST in secondary intents');
    assert(triage.secondary_intents.includes('POSITIVE'), 'Should detect POSITIVE in secondary intents');
    assert(triage.secondary_intents.includes('UNSUBSCRIBE'), 'Should detect UNSUBSCRIBE in secondary intents');

    // Risk flags
    assert(triage.risk_flags.includes('PRIVACY_GDPR_CCPA'), 'Should include PRIVACY_GDPR_CCPA risk flag');
    assert(triage.risk_flags.includes('EXPLICIT_DNC'), 'Should include EXPLICIT_DNC risk flag');
    assert(triage.confidence >= 0.95, 'High confidence for explicit statutory request');
    assert(triage.reasoning.includes('overrides'), 'Reasoning must document safety override');
  });

  await runTest('1.2: Compound Meeting Request + Legal Litigation Threat', () => {
    const text = "We could have set up a call, but stop harassing our team immediately or our attorney will file a formal lawsuit in district court.";
    const triage = triageInboundReply(text);

    assert.strictEqual(triage.primary_intent, 'LEGAL_REQUEST', 'Primary intent must be legal threat');
    assert(triage.risk_flags.includes('LEGAL_LITIGATION'), 'Must flag LEGAL_LITIGATION');
    assert(triage.secondary_intents.includes('MEETING_REQUEST'), 'Secondary must retain meeting request');
    assert.strictEqual(triage.required_action, 'IMMEDIATE_DNC_SUPPRESSION_AND_ESCALATION');
  });

  await runTest('1.3: Explicit Unsubscribe Overriding Compliment', () => {
    const text = "Great pitch, looks fantastic, but please unsubscribe me from your mailing list and do not contact me again.";
    const triage = triageInboundReply(text);

    assert.strictEqual(triage.primary_intent, 'UNSUBSCRIBE', 'Unsubscribe must override compliment');
    assert(triage.secondary_intents.includes('POSITIVE'), 'Secondary must include positive compliment');
    assert(triage.risk_flags.includes('EXPLICIT_DNC'), 'Must flag EXPLICIT_DNC');
    assert.strictEqual(triage.required_action, 'IMMEDIATE_DNC_SUPPRESSION');
    assert.strictEqual(triage.selected_policy, 'POLICY_OPT_OUT_SUPPRESSION');
  });

  await runTest('1.4: Referral with Colleague Email Extraction', () => {
    const text = "I am not the right person for this initiative. Please reach out to Dave Miller at dmiller@initech.corp who handles our outbound infrastructure.";
    const triage = triageInboundReply(text, { from: 'director@initech.corp' });

    assert.strictEqual(triage.primary_intent, 'REFERRAL');
    assert.strictEqual(triage.extractedReferralEmail, 'dmiller@initech.corp');
    assert.strictEqual(triage.required_action, 'EXTRACT_REFERRAL_AND_STAGE_DRAFT');
    assert.strictEqual(triage.selected_policy, 'POLICY_REFERRAL_COLLEAGUE_STAGE');
  });

  await runTest('1.5: Out of Office with Return Date Extraction', () => {
    const text = "Thank you for your message. I am currently out of the office on annual vacation returning on October 24th with no access to email.";
    const triage = triageInboundReply(text);

    assert.strictEqual(triage.primary_intent, 'OUT_OF_OFFICE');
    assert.strictEqual(triage.required_action, 'PAUSE_SEQUENCE_UNTIL_RETURN_DATE');
    assert.strictEqual(triage.selected_policy, 'POLICY_OUT_OF_OFFICE_RESCHEDULE');
    assert(triage.returnDate && triage.returnDate.toLowerCase().includes('october 24'), 'Must extract return date');
  });

  await runTest('1.6: Security Gateway Warning Banner', () => {
    const text = "[EXTERNAL SENDER WARNING] This message was flagged by our corporate security gateway as suspicious phishing.";
    const triage = triageInboundReply(text);

    assert.strictEqual(triage.primary_intent, 'SECURITY_WARNING');
    assert(triage.risk_flags.includes('SECURITY_GATEWAY_ALERT'));
    assert.strictEqual(triage.required_action, 'IMMEDIATE_DNC_SUPPRESSION_AND_ESCALATION');
  });

  await runTest('1.7: Ambiguous / Low-Confidence Message Fallback', () => {
    const text = "Hmm maybe.";
    const triage = triageInboundReply(text);

    assert.strictEqual(triage.primary_intent, 'UNCLEAR');
    assert.strictEqual(triage.required_action, 'QUEUE_FOR_HUMAN_TRIAGE');
    assert.strictEqual(triage.selected_policy, 'POLICY_LOW_CONFIDENCE_HUMAN_TRIAGE');
    assert(triage.confidence <= 0.5, 'Confidence must be low for ambiguous text');
  });

  // ════════════════════════════════════════════════════════════════════
  // 2. DETERMINISTIC VERSIONED PRECEDENCE ENGINE (v1.0.0)
  // ════════════════════════════════════════════════════════════════════
  section('2. Deterministic Versioned Policy Precedence Engine (v1.0.0)');

  await runTest('2.1: Precedence Table v1.0.0 Structure & Completeness', () => {
    assert.strictEqual(POLICY_PRECEDENCE_VERSION, 'v1.0.0');
    assert(PRECEDENCE_TABLE_V1.length >= 13, 'Table must cover all canonical intents');

    // Verify priorities are strictly descending
    for (let i = 0; i < PRECEDENCE_TABLE_V1.length - 1; i++) {
      assert(
        PRECEDENCE_TABLE_V1[i].priority >= PRECEDENCE_TABLE_V1[i + 1].priority,
        `Priority inversion between ${PRECEDENCE_TABLE_V1[i].intent} and ${PRECEDENCE_TABLE_V1[i + 1].intent}`
      );
    }

    // Top tier safety priorities must be >= 90
    assert(getPrecedenceRule('PRIVACY_REQUEST').priority === 100);
    assert(getPrecedenceRule('LEGAL_REQUEST').priority === 95);
    assert(getPrecedenceRule('SECURITY_WARNING').priority === 90);
    assert(getPrecedenceRule('UNSUBSCRIBE').priority === 80);
    assert(getPrecedenceRule('BOUNCE').priority === 75);
    assert(getPrecedenceRule('MEETING_REQUEST').priority === 40);
    assert(getPrecedenceRule('POSITIVE').priority === 35);
    assert(getPrecedenceRule('QUESTION').priority === 30);
    assert(getPrecedenceRule('OUT_OF_OFFICE').priority === 20);
    assert(getPrecedenceRule('NEGATIVE').priority === 10);
    assert(getPrecedenceRule('UNCLEAR').priority === 0);
  });

  await runTest('2.2: Deterministic Pairwise Conflict Resolution', () => {
    // Statutory Privacy vs Meeting Request
    const res1 = resolveMultiIntentPrecedence(['MEETING_REQUEST', 'PRIVACY_REQUEST']);
    assert.strictEqual(res1.primary_intent, 'PRIVACY_REQUEST');
    assert.strictEqual(res1.overridesApplied, true);

    // Legal Threat vs Positive Interest
    const res2 = resolveMultiIntentPrecedence(['POSITIVE', 'LEGAL_REQUEST']);
    assert.strictEqual(res2.primary_intent, 'LEGAL_REQUEST');
    assert.strictEqual(res2.overridesApplied, true);

    // Unsubscribe vs Referral
    const res3 = resolveMultiIntentPrecedence(['REFERRAL', 'UNSUBSCRIBE']);
    assert.strictEqual(res3.primary_intent, 'UNSUBSCRIBE');
    assert.strictEqual(res3.overridesApplied, true);

    // Meeting Request vs Question (No safety override applied, commercial ordering)
    const res4 = resolveMultiIntentPrecedence(['QUESTION', 'MEETING_REQUEST']);
    assert.strictEqual(res4.primary_intent, 'MEETING_REQUEST');
    assert.strictEqual(res4.overridesApplied, false);
  });

  await runTest('2.3: Immediate Suppression and Escalation Predicates', () => {
    assert.strictEqual(requiresImmediateSuppression('PRIVACY_REQUEST'), true);
    assert.strictEqual(requiresImmediateSuppression('LEGAL_REQUEST'), true);
    assert.strictEqual(requiresImmediateSuppression('UNSUBSCRIBE'), true);
    assert.strictEqual(requiresImmediateSuppression('BOUNCE'), true);
    assert.strictEqual(requiresImmediateSuppression('MEETING_REQUEST'), false);
    assert.strictEqual(requiresImmediateSuppression('POSITIVE'), false);
    assert.strictEqual(requiresImmediateSuppression('POSITIVE', ['UNSUBSCRIBE']), true);

    assert.strictEqual(requiresHumanEscalation('PRIVACY_REQUEST'), true);
    assert.strictEqual(requiresHumanEscalation('LEGAL_REQUEST'), true);
    assert.strictEqual(requiresHumanEscalation('SECURITY_WARNING'), true);
    assert.strictEqual(requiresHumanEscalation('UNCLEAR'), true);
    assert.strictEqual(requiresHumanEscalation('POSITIVE', ['PRIVACY_GDPR_CCPA']), true);
    assert.strictEqual(requiresHumanEscalation('POSITIVE', []), false);
  });

  // ════════════════════════════════════════════════════════════════════
  // 3. 7-DIMENSION CONJUNCT POLICY GATE ENGINE
  // ════════════════════════════════════════════════════════════════════
  section('3. 7-Dimension Conjunct Policy Gate Engine');

  const baselineValidParams: ConjunctGatingParams = {
    autonomyMode: 'Auto-Run',
    leadScore: 92,
    riskScore: 0.05,
    campaignStatus: 'ACTIVE',
    dailySendsCount: 15,
    maxDailySends: 100,
    recipientEmail: 'verified.prospect@acme.org',
    isRecipientSuppressed: false,
    senderDomain: 'outreach.proactivereach.com',
    isSenderDomainVerified: true,
    contentSpamScore: 0.04,
    bodyText: 'Hello Prospect, here is our platform overview. To opt out, click unsubscribe here.',
    domainBounceRate: 0.012,
    domainComplaintRate: 0.0002,
    circuitBreakerBounceThreshold: 0.03,
    circuitBreakerComplaintThreshold: 0.001,
    modelConfidence: 0.94,
    minConfidenceThreshold: 0.75,
  };

  await runTest('3.1: All 7 Dimensions Pass -> Authorized is strictly TRUE', async () => {
    const result = await evaluateConjunctDispatchGate(baselineValidParams);

    assert.strictEqual(result.authorized, true, 'All 7 dimensions valid must yield authorized: true');
    assert.strictEqual(result.failureReasons.length, 0, 'Zero failure reasons when all pass');
    assert.strictEqual(result.dimensions.autonomyPermission.allowed, true);
    assert.strictEqual(result.dimensions.campaignPolicy.allowed, true);
    assert.strictEqual(result.dimensions.recipientPolicy.allowed, true);
    assert.strictEqual(result.dimensions.senderPolicy.allowed, true);
    assert.strictEqual(result.dimensions.contentPolicy.allowed, true);
    assert.strictEqual(result.dimensions.deliverabilityPolicy.allowed, true);
    assert.strictEqual(result.dimensions.confidencePolicy.allowed, true);
  });

  await runTest('3.2: Dimension 1 Fail (Autonomy Permission: Review Everything)', async () => {
    const params = { ...baselineValidParams, autonomyMode: 'Review Everything', modelConfidence: 1.0 };
    const result = await evaluateConjunctDispatchGate(params);

    assert.strictEqual(result.authorized, false, 'Review Everything must block autonomous dispatch');
    assert.strictEqual(result.dimensions.autonomyPermission.allowed, false);
    assert(result.failureReasons.some(r => r.includes('AutonomyPermission')));
  });

  await runTest('3.3: Dimension 2 Fail (Campaign Policy: Quota Exceeded & Paused)', async () => {
    const params1 = { ...baselineValidParams, campaignStatus: 'PAUSED', modelConfidence: 1.0 };
    const result1 = await evaluateConjunctDispatchGate(params1);
    assert.strictEqual(result1.authorized, false);
    assert(result1.failureReasons.some(r => r.includes('CampaignPolicy: Campaign is not in ACTIVE status')));

    const params2 = { ...baselineValidParams, dailySendsCount: 100, maxDailySends: 100, modelConfidence: 1.0 };
    const result2 = await evaluateConjunctDispatchGate(params2);
    assert.strictEqual(result2.authorized, false);
    assert(result2.failureReasons.some(r => r.includes('Daily send limit (100) reached')));
  });

  await runTest('3.4: Dimension 3 Fail (Recipient Policy: Suppressed or Disposable Email)', async () => {
    // Test suppression on DNC
    const params1 = { ...baselineValidParams, isRecipientSuppressed: true, modelConfidence: 1.0 };
    const result1 = await evaluateConjunctDispatchGate(params1);
    assert.strictEqual(result1.authorized, false);
    assert(result1.failureReasons.some(r => r.includes('RecipientPolicy: Recipient is suppressed')));

    // Test disposable email
    const params2 = { ...baselineValidParams, recipientEmail: 'throwaway@mailinator.com', modelConfidence: 1.0 };
    const result2 = await evaluateConjunctDispatchGate(params2);
    assert.strictEqual(result2.authorized, false);
    assert(result2.failureReasons.some(r => r.includes('RecipientPolicy: Recipient email address is invalid or disposable')));
  });

  await runTest('3.5: Dimension 4 Fail (Sender Policy: Unverified Domain)', async () => {
    const params = { ...baselineValidParams, isSenderDomainVerified: false, modelConfidence: 1.0 };
    const result = await evaluateConjunctDispatchGate(params);

    assert.strictEqual(result.authorized, false);
    assert.strictEqual(result.dimensions.senderPolicy.allowed, false);
    assert(result.failureReasons.some(r => r.includes('SenderPolicy')));
  });

  await runTest('3.6: Dimension 5 Fail (Content Policy: Missing Unsubscribe Footer)', async () => {
    const params = {
      ...baselineValidParams,
      bodyText: 'Hey there, please buy our software right now! No opt out included.',
      modelConfidence: 1.0,
    };
    const result = await evaluateConjunctDispatchGate(params);

    assert.strictEqual(result.authorized, false);
    assert.strictEqual(result.dimensions.contentPolicy.allowed, false);
    assert(result.failureReasons.some(r => r.includes('ContentPolicy: Message body is missing mandatory unsubscribe footer')));
  });

  await runTest('3.7: Dimension 6 Fail (Deliverability Policy: Circuit Breaker Bounce Spike)', async () => {
    const params = {
      ...baselineValidParams,
      domainBounceRate: 0.038, // 3.8% > 3.0%
      modelConfidence: 1.0,
    };
    const result = await evaluateConjunctDispatchGate(params);

    assert.strictEqual(result.authorized, false);
    assert.strictEqual(result.dimensions.deliverabilityPolicy.allowed, false);
    assert(result.failureReasons.some(r => r.includes('DeliverabilityPolicy: Domain bounce rate')));
  });

  await runTest('3.8: Dimension 7 Fail (Confidence Policy: Score Below Threshold)', async () => {
    const params = {
      ...baselineValidParams,
      modelConfidence: 0.62, // Below 0.75 min threshold
    };
    const result = await evaluateConjunctDispatchGate(params);

    assert.strictEqual(result.authorized, false);
    assert.strictEqual(result.dimensions.confidencePolicy.allowed, false);
    assert(result.failureReasons.some(r => r.includes('ConfidencePolicy: Model confidence score')));
  });

  await runTest('3.9: Axiom Verification: Confidence Score Alone NEVER Authorizes Dispatch', async () => {
    // When 6 dimensions pass and confidence is 1.0, but 1 dimension fails (e.g. sender unverified)
    const testCases: ConjunctGatingParams[] = [
      { ...baselineValidParams, modelConfidence: 1.0, isSenderDomainVerified: false },
      { ...baselineValidParams, modelConfidence: 1.0, isRecipientSuppressed: true },
      { ...baselineValidParams, modelConfidence: 1.0, campaignStatus: 'PAUSED' },
      { ...baselineValidParams, modelConfidence: 1.0, autonomyMode: 'Review Everything' },
      { ...baselineValidParams, modelConfidence: 1.0, domainBounceRate: 0.05 },
      { ...baselineValidParams, modelConfidence: 1.0, bodyText: 'Missing unsub footer' },
    ];

    for (const testCase of testCases) {
      const res = await evaluateConjunctDispatchGate(testCase);
      assert.strictEqual(
        res.authorized,
        false,
        'Confidence 1.0 must NEVER bypass any of the other 6 policy dimensions'
      );
    }
  });

  // ════════════════════════════════════════════════════════════════════
  // 4. LIVE INBOUND WEBHOOK END-TO-END PROCESSING & PERSISTENCE
  // ════════════════════════════════════════════════════════════════════
  section('4. Live Inbound Webhook End-to-End Processing & Persistence');

  await runTest('4.1: Live Inbound Webhook Ingests Compound Reply & Persists Precedence Metadata', async () => {
    const testOrgId = `org_m2_webhook_${Date.now()}`;
    const testLeadEmail = `lead_gdpr_${Date.now()}@testcompany.org`;

    // 1. Seed database records
    const org = await db.organization.create({
      data: {
        id: testOrgId,
        name: 'M2 Test Organization',
        slug: `m2-test-${Date.now()}`,
      },
    });

    const lead = await db.lead.create({
      data: {
        organizationId: org.id,
        email: testLeadEmail,
        name: 'GDPR Inbound Prospect',
        company: 'Regulatory Corp',
        status: 'contacted',
      },
    });

    const sendingDomain = await db.sendingDomain.create({
      data: {
        organizationId: org.id,
        domain: `test-${Date.now()}.sendoutbound.com`,
        status: 'verified',
      },
    });

    const message = await db.outreachMessage.create({
      data: {
        organizationId: org.id,
        leadId: lead.id,
        subject: 'Quick question regarding architecture',
        body: 'Hey prospect, want to chat?',
        status: 'delivered',
      },
    });

    const originalSecret = process.env.RESEND_WEBHOOK_SECRET;
    const testSecret = originalSecret && !originalSecret.startsWith('whsec_xxxx')
      ? originalSecret
      : 'whsec_' + Buffer.from('test_svix_secret_123456789012').toString('base64');
    process.env.RESEND_WEBHOOK_SECRET = testSecret;

    try {
      // 2. Simulate Inbound Webhook Payload with compound text
      const replyBody = "This looks really cool and I would love a demo! However, please stop emailing me and delete all my information under GDPR Article 17.";
      const webhookPayload = {
        data: {
          from: testLeadEmail,
          to: [`alex@${sendingDomain.domain}`],
          subject: 'Re: Quick question regarding architecture',
          text: replyBody,
          headers: {
            'x-message-id': message.id,
          },
        },
      };

      const rawJson = JSON.stringify(webhookPayload);

      // Cryptographic Svix signature generation
      const msgId = `msg_svix_${Date.now()}`;
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signedPayload = `${msgId}.${timestamp}.${rawJson}`;
      const cleanSecret = testSecret.startsWith('whsec_') ? testSecret.slice(6) : testSecret;
      const secretBytes = Buffer.from(cleanSecret, 'base64').length > 0
        ? Buffer.from(cleanSecret, 'base64')
        : Buffer.from(testSecret);
      const signature = crypto
        .createHmac('sha256', secretBytes)
        .update(signedPayload)
        .digest('base64');

      const request = new NextRequest('http://localhost:3000/api/webhooks/inbound', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'svix-id': msgId,
          'svix-timestamp': timestamp,
          'svix-signature': `v1,${signature}`,
        },
        body: rawJson,
      });

      const response = await handleInboundWebhook(request);
      assert.strictEqual(response.status, 200, 'Webhook must return HTTP 200');

      const json = await response.json();
      assert.strictEqual(json.data.received, true);
      assert.strictEqual(json.data.matched, true);
      assert.strictEqual(json.data.classification.primary_intent, 'PRIVACY_REQUEST');
      assert.strictEqual(json.data.classification.policy_version, 'v1.0.0');

      // 3. Verify Database: ReplyClassification persisted with rich metadata
      const classification = await db.replyClassification.findFirst({
        where: {
          organizationId: org.id,
          messageId: message.id,
        },
      });

      assert(classification, 'ReplyClassification record must be created');
      assert.strictEqual(classification.category, 'privacy_request');
      assert.strictEqual(classification.nextAction, 'IMMEDIATE_DNC_SUPPRESSION_AND_ESCALATION');

      const meta = classification.metadata as any;
      assert(meta, 'Metadata must be stored');
      assert.strictEqual(meta.policy_version, 'v1.0.0');
      assert.strictEqual(meta.selected_policy, 'POLICY_SAFETY_LEGAL_PRIVACY_ESCALATION');
      assert(meta.secondary_intents.includes('MEETING_REQUEST'));
      assert(meta.risk_flags.includes('PRIVACY_GDPR_CCPA'));

      // 4. Verify Database: Lead is immediately suppressed
      const updatedLead = await db.lead.findUnique({
        where: { id: lead.id },
      });
      assert(updatedLead);
      assert.strictEqual(updatedLead.status, 'unsubscribed');
      assert.strictEqual(updatedLead.doNotContact, true);
      assert.strictEqual(updatedLead.isBlacklisted, true);

      // 5. Verify Database: DoNotContact record added
      const dnc = await db.doNotContact.findFirst({
        where: {
          organizationId: org.id,
          email: testLeadEmail,
        },
      });
      assert(dnc, 'Email must be in DoNotContact table');

      // 6. Verify Database: EscalationTask created for Compliance
      const escalationTask = await db.escalationTask.findFirst({
        where: {
          organizationId: org.id,
          type: 'PRIVACY_REQUEST',
        },
      });
      assert(escalationTask, 'Durable EscalationTask must be created for privacy request');
      assert.strictEqual(escalationTask.status, 'OPEN');

    } finally {
      // Cleanup
      await db.replyClassification.deleteMany({ where: { organizationId: org.id } }).catch(() => {});
      await db.escalationTask.deleteMany({ where: { organizationId: org.id } }).catch(() => {});
      await db.doNotContact.deleteMany({ where: { organizationId: org.id } }).catch(() => {});
      await db.outreachMessage.deleteMany({ where: { organizationId: org.id } }).catch(() => {});
      await db.lead.deleteMany({ where: { organizationId: org.id } }).catch(() => {});
      await db.sendingDomain.deleteMany({ where: { organizationId: org.id } }).catch(() => {});
      await db.organization.deleteMany({ where: { id: org.id } }).catch(() => {});
    }
  });

  // ════════════════════════════════════════════════════════════════════
  // 5. RE-EVAL AGENT & CLASSIFIER INTEGRATION
  // ════════════════════════════════════════════════════════════════════
  section('5. Re-eval Agent & Classifier Integration');

  await runTest('5.1: classifyReply incorporates multi-intent triage and precedence metadata', async () => {
    const text = "Please cease all communication and delete our contact information under CCPA.";
    const result = await classifyReply({ replyText: text });

    assert.strictEqual(result.suppressed, true);
    assert.strictEqual(result.primary_intent, 'PRIVACY_REQUEST');
    assert.strictEqual(result.policy_version, 'v1.0.0');
    assert.strictEqual(result.selected_policy, 'POLICY_SAFETY_LEGAL_PRIVACY_ESCALATION');
    assert.strictEqual(result.required_action, 'IMMEDIATE_DNC_SUPPRESSION_AND_ESCALATION');
  });

  // ════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════════════
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`M2 TEST SUITE SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('════════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
