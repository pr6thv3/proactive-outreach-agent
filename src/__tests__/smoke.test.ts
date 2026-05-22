// ─── Smoke Tests for Outreach Platform ────────────────
// Self-contained test runner — no framework needed
// Validates business logic patterns work correctly without DB connection
// Run with: npx tsx src/__tests__/smoke.test.ts

// ═══════════════════════════════════════════════════════
// MINI FRAMEWORK
// ═══════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════
// INLINE BUSINESS LOGIC (reimplemented from source)
// ═══════════════════════════════════════════════════════

// From src/lib/safety.ts — EMAIL_REGEX
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// From src/lib/safety.ts — validateEmail
function validateEmail(email: string): { valid: boolean; reason?: string } {
  if (!email || typeof email !== 'string') {
    return { valid: false, reason: 'Email is required' };
  }
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length > 254) {
    return { valid: false, reason: 'Email too long' };
  }
  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, reason: 'Invalid email format' };
  }
  return { valid: true };
}

// From src/lib/safety.ts — parseCsv
function parseCsv(csvText: string): {
  leads: Array<{ name: string; email: string; company?: string; title?: string }>;
  errors: Array<{ row: number; reason: string }>;
} {
  const leads: Array<{ name: string; email: string; company?: string; title?: string }> = [];
  const errors: Array<{ row: number; reason: string }> = [];

  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    errors.push({ row: 0, reason: 'CSV must have a header row and at least one data row' });
    return { leads, errors };
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  const emailIdx = headers.findIndex(h => h === 'email' || h === 'e-mail' || h === 'email_address');
  const nameIdx = headers.findIndex(h => h === 'name' || h === 'full_name' || h === 'first_name' || h === 'contact_name');
  const companyIdx = headers.findIndex(h => h === 'company' || h === 'organization' || h === 'company_name');
  const titleIdx = headers.findIndex(h => h === 'title' || h === 'job_title' || h === 'role' || h === 'position');

  if (emailIdx === -1) {
    errors.push({ row: 0, reason: 'CSV must have an "email" column' });
    return { leads, errors };
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
    const email = cols[emailIdx]?.trim().toLowerCase();
    if (!email) {
      errors.push({ row: i + 1, reason: 'Missing email' });
      continue;
    }
    const validation = validateEmail(email);
    if (!validation.valid) {
      errors.push({ row: i + 1, reason: `Invalid email: ${validation.reason}` });
      continue;
    }
    const name = nameIdx >= 0 ? cols[nameIdx]?.trim() : '';
    if (!name) {
      errors.push({ row: i + 1, reason: 'Missing name' });
      continue;
    }
    leads.push({
      name,
      email,
      company: companyIdx >= 0 ? cols[companyIdx]?.trim() || undefined : undefined,
      title: titleIdx >= 0 ? cols[titleIdx]?.trim() || undefined : undefined,
    });
  }
  return { leads, errors };
}

// From src/lib/deliverability/bounce-handler.ts — classifyBounce
function classifyBounce(reason: string): 'hard' | 'soft' | 'feedback' | 'unknown' {
  const r = reason.toLowerCase();

  const hardIndicators = [
    'user not found', 'no such user', 'invalid recipient', 'recipient invalid',
    'mailbox unavailable', 'domain not found', 'no such domain', 'invalid domain',
    'recipient rejected', 'address rejected', 'smtp 550', '550 5.1.1',
    '550 5.2.1', 'permanent failure', 'permanent error',
  ];
  const softIndicators = [
    'mailbox full', 'quota exceeded', 'temporarily unavailable',
    'try again later', 'smtp 450', 'smtp 451', 'smtp 452',
    'deferred', 'temporary failure', 'rate limit', 'too many recipients',
    'greylisted', 'challenge response',
  ];
  const feedbackIndicators = [
    'complaint', 'spam report', 'abuse report', 'this is spam',
    'feedback report', 'report abuse',
  ];

  if (feedbackIndicators.some(i => r.includes(i))) return 'feedback';
  if (hardIndicators.some(i => r.includes(i))) return 'hard';
  if (softIndicators.some(i => r.includes(i))) return 'soft';

  if (r.includes('5.') && !r.includes('4.')) return 'hard';
  if (r.includes('4.')) return 'soft';

  return 'unknown';
}

// From src/lib/agents/think/scoring-engine.ts — priority tier logic
function getPriorityTier(leadScore: number): 'hot' | 'warm' | 'cold' {
  return leadScore >= 70 ? 'hot' : leadScore >= 40 ? 'warm' : 'cold';
}

// From src/lib/agents/observe/signal-intelligence.ts — urgency decay rates
const URGENCY_DECAY: Record<string, { rate: number; ttl_days: number }> = {
  funding_round:            { rate: 0.03, ttl_days: 30 },
  hiring_spike:             { rate: 0.02, ttl_days: 45 },
  engineering_hiring_spike: { rate: 0.025, ttl_days: 35 },
  traffic_drop:             { rate: 0.04, ttl_days: 21 },
  product_launch:           { rate: 0.05, ttl_days: 14 },
  rebranding:               { rate: 0.03, ttl_days: 30 },
  seo_decline:              { rate: 0.02, ttl_days: 45 },
  tech_stack_migration:     { rate: 0.015, ttl_days: 60 },
  competitor_pressure:      { rate: 0.03, ttl_days: 30 },
  ai_adoption_signal:       { rate: 0.02, ttl_days: 45 },
  job_change:               { rate: 0.06, ttl_days: 10 },
  expansion:                { rate: 0.02, ttl_days: 45 },
  pain_point:               { rate: 0.01, ttl_days: 90 },
  growth:                   { rate: 0.02, ttl_days: 45 },
  tech_stack:               { rate: 0.01, ttl_days: 90 },
  personalization_hook:     { rate: 0.005, ttl_days: 180 },
};

// clamp helper from signal-intelligence.ts
function clamp(v: number): number { return Math.min(1, Math.max(0, v || 0.5)); }

// Orchestrator approval/send logic (from orchestrator/index.ts)
function canApprove(status: string): boolean {
  return status === 'generated' || status === 'draft';
}

function canSend(status: string): boolean {
  return status === 'approved';
}

// ═══════════════════════════════════════════════════════
// TEST SUITE 1: CSV PARSING
// ═══════════════════════════════════════════════════════
section('1. CSV Parsing');

(() => {
  // Valid CSV
  const validCsv = `name,email,company,title\nAlice Johnson,alice@techcorp.io,TechCorp,VP Engineering\nBob Smith,bob@growthco.com,GrowthCo,CTO`;
  const validResult = parseCsv(validCsv);
  assertEqual(validResult.leads.length, 2, 'Valid CSV produces 2 leads');
  assertEqual(validResult.errors.length, 0, 'Valid CSV has no errors');
  assertEqual(validResult.leads[0].name, 'Alice Johnson', 'First lead name parsed');
  assertEqual(validResult.leads[0].email, 'alice@techcorp.io', 'First lead email parsed');
  assertEqual(validResult.leads[1].company, 'GrowthCo', 'Company field parsed');

  // Missing email column
  const noEmailCsv = `name,company,title\nAlice,TechCorp,VP`;
  const noEmailResult = parseCsv(noEmailCsv);
  assertEqual(noEmailResult.leads.length, 0, 'Missing email column: no leads');
  assert(noEmailResult.errors.some(e => e.reason.includes('email')), 'Missing email column: error mentions email');

  // Invalid email format
  const invalidEmailCsv = `name,email\nAlice,not-an-email\nBob,bob@good.com`;
  const invalidEmailResult = parseCsv(invalidEmailCsv);
  assertEqual(invalidEmailResult.leads.length, 1, 'Invalid email: only 1 valid lead');
  assertEqual(invalidEmailResult.errors.length, 1, 'Invalid email: 1 error for bad row');
  assert(invalidEmailResult.errors[0].reason.includes('Invalid email'), 'Error mentions invalid email');

  // Missing name
  const noNameCsv = `name,email\n,alice@techcorp.io\nBob,bob@good.com`;
  const noNameResult = parseCsv(noNameCsv);
  assertEqual(noNameResult.leads.length, 1, 'Missing name: only 1 valid lead');
  assert(noNameResult.errors.some(e => e.reason.includes('Missing name')), 'Error mentions missing name');

  // Empty CSV
  const emptyCsv = `name,email`;
  const emptyResult = parseCsv(emptyCsv);
  assertEqual(emptyResult.leads.length, 0, 'Header-only CSV: no leads');

  // Alternate header names
  const altHeadersCsv = `full_name,email_address,organization,job_title\nAlice,alice@corp.io,Corp,VP`;
  const altResult = parseCsv(altHeadersCsv);
  assertEqual(altResult.leads.length, 1, 'Alternate header names work');
  assertEqual(altResult.leads[0].name, 'Alice', 'Alternate name header parsed');
  assertEqual(altResult.leads[0].company, 'Corp', 'Alternate company header parsed');
})();

// ═══════════════════════════════════════════════════════
// TEST SUITE 2: EMAIL VALIDATION
// ═══════════════════════════════════════════════════════
section('2. Email Validation');

(() => {
  // Valid emails
  assert(validateEmail('user@example.com').valid, 'Standard email is valid');
  assert(validateEmail('user.name@company.co.uk').valid, 'Multi-part domain email is valid');
  assert(validateEmail('user+tag@gmail.com').valid, 'Plus-tagged email is valid');
  assert(validateEmail('USER@COMPANY.COM').valid, 'Uppercase email is valid (normalizes)');

  // Invalid formats
  assert(!validateEmail('plaintext').valid, 'No @ sign is invalid');
  assert(!validateEmail('@domain.com').valid, 'No local part is invalid');
  assert(!validateEmail('user@').valid, 'No domain is invalid');
  assert(!validateEmail('user@domain').valid, 'No TLD is invalid');
  assert(!validateEmail('user@.com').valid, 'Domain starting with dot is invalid');
  assert(!validateEmail('user name@domain.com').valid, 'Space in local part is invalid');

  // Too long email
  const longLocal = 'a'.repeat(250);
  const tooLong = validateEmail(`${longLocal}@example.com`);
  assert(!tooLong.valid, 'Email > 254 chars is invalid');
  assertEqual(tooLong.reason, 'Email too long', 'Reason is "Email too long"');

  // Empty strings
  assert(!validateEmail('').valid, 'Empty string is invalid');
  assert(!validateEmail('   ').valid, 'Whitespace-only is invalid');
  // @ts-expect-error testing null input
  assert(!validateEmail(null).valid, 'null input is invalid');
  // @ts-expect-error testing undefined input
  assert(!validateEmail(undefined).valid, 'undefined input is invalid');
})();

// ═══════════════════════════════════════════════════════
// TEST SUITE 3: DNC / BLACKLIST CHECKS
// ═══════════════════════════════════════════════════════
section('3. DNC / Blacklist Safety Logic');

(() => {
  // isLeadSafeToContact checks these conditions:
  // 1. lead.isBlacklisted → unsafe
  // 2. lead.doNotContact → unsafe
  // 3. isOnDncList(email) → unsafe (DB check, but pattern is clear)
  // 4. lead.status === 'unsubscribed' → unsafe
  // 5. !validateEmail(email).valid → unsafe
  //
  // We test the logical pattern here

  // Simulate the safety check logic
  interface MockLead {
    isBlacklisted: boolean;
    doNotContact: boolean;
    status: string;
    email: string;
    onDncList: boolean;
  }

  function isLeadSafe(lead: MockLead): { safe: boolean; reasons: string[] } {
    const reasons: string[] = [];
    if (lead.isBlacklisted) reasons.push('Lead is blacklisted');
    if (lead.doNotContact) reasons.push('Lead is marked do-not-contact');
    if (lead.onDncList) reasons.push('Email is on Do-Not-Contact list');
    if (lead.status === 'unsubscribed') reasons.push('Lead has unsubscribed');
    const emailCheck = validateEmail(lead.email);
    if (!emailCheck.valid) reasons.push(`Invalid email: ${emailCheck.reason}`);
    return { safe: reasons.length === 0, reasons };
  }

  // Safe lead
  const safeResult = isLeadSafe({
    isBlacklisted: false,
    doNotContact: false,
    status: 'new',
    email: 'good@company.com',
    onDncList: false,
  });
  assert(safeResult.safe, 'Clean lead is safe to contact');
  assertEqual(safeResult.reasons.length, 0, 'Clean lead has no reasons');

  // Blacklisted
  const blacklisted = isLeadSafe({
    isBlacklisted: true,
    doNotContact: false,
    status: 'new',
    email: 'good@company.com',
    onDncList: false,
  });
  assert(!blacklisted.safe, 'Blacklisted lead is not safe');
  assert(blacklisted.reasons.some(r => r.includes('blacklisted')), 'Reason mentions blacklisted');

  // DNC
  const dnc = isLeadSafe({
    isBlacklisted: false,
    doNotContact: true,
    status: 'new',
    email: 'good@company.com',
    onDncList: false,
  });
  assert(!dnc.safe, 'DNC lead is not safe');
  assert(dnc.reasons.some(r => r.includes('do-not-contact')), 'Reason mentions do-not-contact');

  // On DNC list
  const onDnc = isLeadSafe({
    isBlacklisted: false,
    doNotContact: false,
    status: 'new',
    email: 'good@company.com',
    onDncList: true,
  });
  assert(!onDnc.safe, 'DNC-list email is not safe');
  assert(onDnc.reasons.some(r => r.includes('Do-Not-Contact list')), 'Reason mentions DNC list');

  // Unsubscribed
  const unsub = isLeadSafe({
    isBlacklisted: false,
    doNotContact: false,
    status: 'unsubscribed',
    email: 'good@company.com',
    onDncList: false,
  });
  assert(!unsub.safe, 'Unsubscribed lead is not safe');

  // Invalid email on lead
  const badEmail = isLeadSafe({
    isBlacklisted: false,
    doNotContact: false,
    status: 'new',
    email: 'not-an-email',
    onDncList: false,
  });
  assert(!badEmail.safe, 'Invalid email makes lead unsafe');

  // Multiple issues
  const multiple = isLeadSafe({
    isBlacklisted: true,
    doNotContact: true,
    status: 'unsubscribed',
    email: 'bad',
    onDncList: true,
  });
  assert(!multiple.safe, 'Lead with multiple issues is unsafe');
  assertEqual(multiple.reasons.length, 5, 'All 5 issues are reported (blacklisted + DNC + unsubscribed + DNC list + bad email)');
})();

// ═══════════════════════════════════════════════════════
// TEST SUITE 4: SIGNAL INTELLIGENCE SCORING
// ═══════════════════════════════════════════════════════
section('4. Signal Intelligence Scoring');

(() => {
  // Urgency values should be in 0-1 range
  const allSignalTypes = Object.keys(URGENCY_DECAY);
  assert(allSignalTypes.length >= 10, `Found ${allSignalTypes.length} signal types (expected >= 10)`);

  // Decay rates should be positive and <= 1
  for (const [type, config] of Object.entries(URGENCY_DECAY)) {
    assert(config.rate > 0 && config.rate <= 1, `${type}: decay rate ${config.rate} in (0,1]`);
    assert(config.ttl_days > 0 && config.ttl_days <= 365, `${type}: TTL ${config.ttl_days} in (0,365]`);
  }

  // Urgency clamping
  assertEqual(clamp(0.5), 0.5, 'clamp(0.5) = 0.5');
  assertEqual(clamp(1.5), 1, 'clamp(1.5) = 1');
  assertEqual(clamp(-0.5), 0, 'clamp(-0.5) = 0');
  assertEqual(clamp(0), 0.5, 'clamp(0) defaults to 0.5 (treats 0 as missing)');
  assertEqual(clamp(1), 1, 'clamp(1) = 1');
  // NaN is a valid number type in TS but produces NaN at runtime
  assertEqual(clamp(NaN), 0.5, 'clamp(NaN) defaults to 0.5');

  // Decay makes sense: product_launch decays faster than pain_point
  assert(
    URGENCY_DECAY.product_launch.rate > URGENCY_DECAY.pain_point.rate,
    'product_launch decays faster than pain_point'
  );
  assert(
    URGENCY_DECAY.product_launch.ttl_days < URGENCY_DECAY.pain_point.ttl_days,
    'product_launch has shorter TTL than pain_point'
  );

  // job_change decays fastest
  assert(
    URGENCY_DECAY.job_change.rate >= URGENCY_DECAY.funding_round.rate,
    'job_change decays at least as fast as funding_round'
  );

  // personalization_hook is longest-lived
  assert(
    URGENCY_DECAY.personalization_hook.rate <= URGENCY_DECAY.pain_point.rate,
    'personalization_hook decays slowest (or equal to pain_point)'
  );
  assert(
    URGENCY_DECAY.personalization_hook.ttl_days >= URGENCY_DECAY.pain_point.ttl_days,
    'personalization_hook has longest TTL'
  );

  // Simulated urgency after decay
  const daysSince = 10;
  const fundingUrgency = 0.91;
  const decayedUrgency = Math.max(0.05, fundingUrgency - URGENCY_DECAY.funding_round.rate * daysSince);
  assert(decayedUrgency > 0 && decayedUrgency <= 1, `Decayed urgency ${decayedUrgency.toFixed(3)} is in (0,1]`);
  assert(decayedUrgency < fundingUrgency, 'Decayed urgency is less than original');
})();

// ═══════════════════════════════════════════════════════
// TEST SUITE 5: SCORING ENGINE PRIORITY TIERS
// ═══════════════════════════════════════════════════════
section('5. Scoring Engine Priority Tiers');

(() => {
  // Hot: >= 70
  assertEqual(getPriorityTier(100), 'hot', 'Score 100 = hot');
  assertEqual(getPriorityTier(70), 'hot', 'Score 70 = hot (boundary)');
  assertEqual(getPriorityTier(85), 'hot', 'Score 85 = hot');

  // Warm: >= 40 and < 70
  assertEqual(getPriorityTier(69), 'warm', 'Score 69 = warm');
  assertEqual(getPriorityTier(40), 'warm', 'Score 40 = warm (boundary)');
  assertEqual(getPriorityTier(55), 'warm', 'Score 55 = warm');

  // Cold: < 40
  assertEqual(getPriorityTier(39), 'cold', 'Score 39 = cold');
  assertEqual(getPriorityTier(0), 'cold', 'Score 0 = cold');
  assertEqual(getPriorityTier(1), 'cold', 'Score 1 = cold');

  // Edge cases
  assertEqual(getPriorityTier(69.999), 'warm', 'Score 69.999 = warm');
  assertEqual(getPriorityTier(39.999), 'cold', 'Score 39.999 = cold');
})();

// ═══════════════════════════════════════════════════════
// TEST SUITE 6: APPROVAL-BEFORE-SEND SAFETY
// ═══════════════════════════════════════════════════════
section('6. Approval-Before-Send Safety');

(() => {
  // Approval gate: only 'generated' or 'draft' can be approved
  assert(canApprove('generated'), 'generated status can be approved');
  assert(canApprove('draft'), 'draft status can be approved');
  assert(!canApprove('approved'), 'approved status CANNOT be re-approved');
  assert(!canApprove('sent'), 'sent status CANNOT be approved');
  assert(!canApprove('bounced'), 'bounced status CANNOT be approved');
  assert(!canApprove('replied'), 'replied status CANNOT be approved');

  // Send gate: only 'approved' can be sent
  assert(canSend('approved'), 'approved status can be sent');
  assert(!canSend('generated'), 'generated status CANNOT be sent');
  assert(!canSend('draft'), 'draft status CANNOT be sent');
  assert(!canSend('sent'), 'sent status CANNOT be re-sent');
  assert(!canSend('bounced'), 'bounced status CANNOT be sent');

  // Simulate the full workflow: generated → approved → sent
  let status = 'generated';
  assert(canApprove(status), `Status "${status}" can be approved`);
  assert(!canSend(status), `Status "${status}" CANNOT be sent yet`);

  status = 'approved'; // After approval
  assert(!canApprove(status), `Status "${status}" CANNOT be re-approved`);
  assert(canSend(status), `Status "${status}" can be sent`);

  status = 'sent'; // After send
  assert(!canApprove(status), `Status "${status}" CANNOT be approved`);
  assert(!canSend(status), `Status "${status}" CANNOT be re-sent`);

  // Try approving a bounced message
  const bouncedStatus = 'bounced';
  assert(!canApprove(bouncedStatus), 'Bounced messages CANNOT be approved');
  assert(!canSend(bouncedStatus), 'Bounced messages CANNOT be sent');
})();

// ═══════════════════════════════════════════════════════
// TEST SUITE 7: UNSUBSCRIBE / BOUNCE CLASSIFICATION
// ═══════════════════════════════════════════════════════
section('7. Unsubscribe / Bounce Classification');

(() => {
  // Hard bounces — permanent failures
  assertEqual(classifyBounce('user not found'), 'hard', '"user not found" = hard bounce');
  assertEqual(classifyBounce('no such user'), 'hard', '"no such user" = hard bounce');
  assertEqual(classifyBounce('invalid recipient'), 'hard', '"invalid recipient" = hard bounce');
  assertEqual(classifyBounce('mailbox unavailable'), 'hard', '"mailbox unavailable" = hard bounce');
  assertEqual(classifyBounce('domain not found'), 'hard', '"domain not found" = hard bounce');
  assertEqual(classifyBounce('smtp 550'), 'hard', '"smtp 550" = hard bounce');
  assertEqual(classifyBounce('550 5.1.1'), 'hard', '"550 5.1.1" = hard bounce');
  assertEqual(classifyBounce('permanent failure'), 'hard', '"permanent failure" = hard bounce');
  assertEqual(classifyBounce('address rejected'), 'hard', '"address rejected" = hard bounce');

  // Soft bounces — temporary failures
  assertEqual(classifyBounce('mailbox full'), 'soft', '"mailbox full" = soft bounce');
  assertEqual(classifyBounce('quota exceeded'), 'soft', '"quota exceeded" = soft bounce');
  assertEqual(classifyBounce('temporarily unavailable'), 'soft', '"temporarily unavailable" = soft bounce');
  assertEqual(classifyBounce('try again later'), 'soft', '"try again later" = soft bounce');
  assertEqual(classifyBounce('smtp 450'), 'soft', '"smtp 450" = soft bounce');
  assertEqual(classifyBounce('smtp 451'), 'soft', '"smtp 451" = soft bounce');
  assertEqual(classifyBounce('deferred'), 'soft', '"deferred" = soft bounce');
  assertEqual(classifyBounce('rate limit'), 'soft', '"rate limit" = soft bounce');
  assertEqual(classifyBounce('greylisted'), 'soft', '"greylisted" = soft bounce');

  // Feedback / complaints
  assertEqual(classifyBounce('complaint'), 'feedback', '"complaint" = feedback');
  assertEqual(classifyBounce('spam report'), 'feedback', '"spam report" = feedback');
  assertEqual(classifyBounce('abuse report'), 'feedback', '"abuse report" = feedback');
  assertEqual(classifyBounce('this is spam'), 'feedback', '"this is spam" = feedback');
  assertEqual(classifyBounce('feedback report'), 'feedback', '"feedback report" = feedback');

  // Unknown / edge cases
  assertEqual(classifyBounce('something weird happened'), 'unknown', 'Unrecognized reason = unknown');
  assertEqual(classifyBounce(''), 'unknown', 'Empty reason = unknown');

  // Case insensitive
  assertEqual(classifyBounce('USER NOT FOUND'), 'hard', 'Classification is case-insensitive');
  assertEqual(classifyBounce('MAILBOX FULL'), 'soft', 'Classification is case-insensitive (soft)');
  assertEqual(classifyBounce('SPAM REPORT'), 'feedback', 'Classification is case-insensitive (feedback)');

  // Feedback takes priority over hard/soft
  assertEqual(classifyBounce('complaint about user not found'), 'feedback',
    'Feedback keyword takes priority over hard bounce keyword');

  // Hard takes priority over soft (when no feedback)
  assertEqual(classifyBounce('user not found mailbox full'), 'hard',
    'Hard bounce keyword takes priority over soft');

  // SMTP code fallback
  assertEqual(classifyBounce('5.0.0 some error'), 'hard', '5.x SMTP code = hard');
  assertEqual(classifyBounce('4.0.0 some error'), 'soft', '4.x SMTP code = soft');
})();

// ═══════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(64));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('═'.repeat(64));

if (failures.length > 0) {
  console.log('\nFailed tests:');
  for (const f of failures) {
    console.log(`  ❌ ${f}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
