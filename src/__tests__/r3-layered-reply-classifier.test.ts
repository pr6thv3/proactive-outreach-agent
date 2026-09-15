// ─── TEST SUITE: R3 LAYERED REPLY CLASSIFICATION ─────────────────
// Validates Milestone 3 requirements:
// 1. Layered 14-category reply intent taxonomy
// 2. High-risk safety routing (GDPR/privacy, legal, security warnings)
// 3. Referral extraction with email parsing
// 4. Fallback of ambiguous messages to human triage
// ─────────────────────────────────────────────────────────────────

import assert from 'assert';
import { LayeredReplyClassifier } from '../lib/agents/reeval/layered-classifier';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  ❌ ${name}:`, err.message);
  }
}

console.log('\n════════════════════════════════════════════════════════════════');
console.log('🧪 MILESTONE 3: LAYERED 14-CATEGORY REPLY CLASSIFIER SUITE');
console.log('════════════════════════════════════════════════════════════════\n');

test('1. PRIVACY_REQUEST (GDPR/CCPA): Triggers DNC suppression and human escalation', () => {
  const res = LayeredReplyClassifier.classify('Please delete my data under GDPR right to be forgotten immediately.');
  assert.strictEqual(res.category, 'PRIVACY_REQUEST');
  assert.strictEqual(res.dncSuppressionRequired, true);
  assert.strictEqual(res.requiresHumanEscalation, true);
  assert.strictEqual(res.nextAction, 'legal_escalation');
});

test('2. LEGAL_REQUEST: Flags cease-and-desist warnings to legal team', () => {
  const res = LayeredReplyClassifier.classify('I have instructed our legal counsel to file a cease and desist if you email again.');
  assert.strictEqual(res.category, 'LEGAL_REQUEST');
  assert.strictEqual(res.dncSuppressionRequired, true);
  assert.strictEqual(res.requiresHumanEscalation, true);
});

test('3. SECURITY_WARNING: Gateway phishing alert flagged for domain review', () => {
  const res = LayeredReplyClassifier.classify('External Sender Security Warning: This email was flagged by Proofpoint as suspicious.');
  assert.strictEqual(res.category, 'SECURITY_WARNING');
  assert.strictEqual(res.requiresHumanEscalation, true);
  assert.strictEqual(res.nextAction, 'security_alert');
});

test('4. UNSUBSCRIBE: Triggers automatic permanent DNC without human delay', () => {
  const res = LayeredReplyClassifier.classify('Please remove me from your list and unsubscribe.');
  assert.strictEqual(res.category, 'UNSUBSCRIBE');
  assert.strictEqual(res.dncSuppressionRequired, true);
  assert.strictEqual(res.requiresHumanEscalation, false);
});

test('5. MEETING_REQUEST: Detects calendar intent', () => {
  const res = LayeredReplyClassifier.classify('I would love to chat. Can you send over a calendar link to book a time?');
  assert.strictEqual(res.category, 'MEETING_REQUEST');
  assert.strictEqual(res.nextAction, 'book_meeting');
  assert.strictEqual(res.requiresHumanEscalation, true);
});

test('6. REFERRAL: Extracts colleague email address for enrollment', () => {
  const res = LayeredReplyClassifier.classify('I am not the right person for this. Please reach out to Sarah Chen at sarah.chen@enterprise.io');
  assert.strictEqual(res.category, 'REFERRAL');
  assert.strictEqual(res.extractedReferralEmail, 'sarah.chen@enterprise.io');
  assert.strictEqual(res.nextAction, 'escalate_warm');
});

test('7. OUT_OF_OFFICE: Triggers 7-day sequence snooze without wasting touchpoints', () => {
  const res = LayeredReplyClassifier.classify('I am currently out of the office on annual leave with limited access to email.');
  assert.strictEqual(res.category, 'OUT_OF_OFFICE');
  assert.strictEqual(res.nextAction, 'snooze_sequence');
  assert.strictEqual(res.requiresHumanEscalation, false);
});

test('8. BOUNCE: Flags undeliverable notice for suppression', () => {
  const res = LayeredReplyClassifier.classify('Delivery Status Notification (Failure): 550 5.1.1 User unknown mailbox unavailable');
  assert.strictEqual(res.category, 'BOUNCE');
  assert.strictEqual(res.nextAction, 'mark_bounced');
  assert.strictEqual(res.dncSuppressionRequired, true);
});

test('9. POSITIVE: Detects warm lead interest', () => {
  const res = LayeredReplyClassifier.classify('This sounds interesting, can you share a deck and tell me more about pricing?');
  assert.strictEqual(res.category, 'POSITIVE');
  assert.strictEqual(res.nextAction, 'escalate_warm');
});

test('10. QUESTION: Routes product inquiries for reply draft', () => {
  const res = LayeredReplyClassifier.classify('Does your platform support native HubSpot integration?');
  assert.strictEqual(res.category, 'QUESTION');
  assert.strictEqual(res.nextAction, 'auto_reply');
});

test('11. NEGATIVE: Halts sequence without global DNC blacklist', () => {
  const res = LayeredReplyClassifier.classify('No thanks, we are happy with our current vendor.');
  assert.strictEqual(res.category, 'NEGATIVE');
  assert.strictEqual(res.nextAction, 'stop_sequence');
  assert.strictEqual(res.dncSuppressionRequired, false);
});

test('12. UNCLEAR: Ambiguous responses route to human SDR task queue', () => {
  const res = LayeredReplyClassifier.classify('Maybe later in Q4, or ping after the conference.');
  assert.strictEqual(res.category, 'UNCLEAR');
  assert.strictEqual(res.nextAction, 'human_review');
  assert.strictEqual(res.requiresHumanEscalation, true);
  assert.ok(res.confidence < 0.6);
});

console.log('\n════════════════════════════════════════════════════════════════');
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('════════════════════════════════════════════════════════════════\n');

if (failed > 0) process.exit(1);
