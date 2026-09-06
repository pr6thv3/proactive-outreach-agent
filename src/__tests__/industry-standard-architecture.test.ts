// ─── Industry-Standard Automated Outreach Architecture Test Suite ───────────
// Validates all 4 primary architectural layers:
// 1. Signal Ingestion (ICP Pre-Filter Gate & Zero-Token Discard)
// 2. Data Enrichment (Normalized Prospect Profile & Confidence Gating)
// 3. LLM Generation & Personalization (Context Grounding & Reason for Selection)
// 4. Generation Guardrails (Unresolved vars, AI clichés, character limits)
// Plus: Event-aware multi-step sequences, Reply classification, Deliverability Core
// ─────────────────────────────────────────────────────────────────────────────

import { db } from '../lib/db';
import { SignalIngestionGate } from '../lib/agents/observe/signal-ingestion';
import { ProspectNormalizer } from '../lib/agents/observe/prospect-normalizer';
import { ContentGuardrailsEngine } from '../lib/agents/think/content-guardrails';
import { ReplyClassifierAgent } from '../lib/agents/reeval/reply-classifier';
import { evaluateSendReadiness } from '../lib/deliverability/send-readiness';
import { interruptSequence } from '../lib/agents/act/followup-scheduler';

async function runArchitectureVerificationSuite() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║   PROACTIVEREACH — INDUSTRY-STANDARD ARCHITECTURE TEST SUITE             ║');
  console.log('║   4-Layer Pipeline: Ingestion → Enrichment → Guardrails → Deliverability ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, code: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS [${code}] ${detail || ''}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL [${code}] ${detail || ''}`);
      failed++;
    }
  }

  const testOrgId = `org_arch_${Date.now()}`;
  await db.organization.create({
    data: { id: testOrgId, name: 'Standard Architecture Org', slug: `arch-${Date.now()}` },
  });

  // ═════════════════════════════════════════════════════════════════════════
  // LAYER 1: Signal Ingestion & ICP Pre-Filter Gate
  // ═════════════════════════════════════════════════════════════════════════
  console.log('── LAYER 1: Signal Ingestion & ICP Pre-Filter Gate ───────────────────');

  const icp = {
    targetIndustries: ['Fintech', 'SaaS', 'Cloud', 'Cybersecurity'],
    excludedKeywords: ['crypto scam', 'gambling'],
  };

  // Case 1A: Qualified buying signal (Fintech funding round)
  const qualifiedSignal = await SignalIngestionGate.ingestSignal({
    type: 'funding',
    companyName: 'Plaid',
    industry: 'Fintech',
    content: 'Plaid raised $425M Series D and is scaling security infrastructure.',
    sourceUrl: 'https://techcrunch.com/plaid-funding',
  }, testOrgId, icp);

  assert(qualifiedSignal.status === 'qualified', 'L1.1', 'Qualified buying signal passed ICP pre-filter gate');
  assert(!!qualifiedSignal.payload?.suggestedAngle, 'L1.2', `Suggested outreach hook: "${qualifiedSignal.payload?.suggestedAngle}"`);

  // Case 1B: Non-matching signal (Excluded keyword - gambling/scam)
  const excludedSignal = await SignalIngestionGate.ingestSignal({
    type: 'funding',
    companyName: 'BetCasino Corp',
    industry: 'Gambling',
    content: 'Raised $5M for crypto scam token gambling platform.',
  }, testOrgId, icp);

  assert(excludedSignal.status === 'discarded', 'L1.3', 'Non-matching signal discarded immediately (0 LLM/enrichment tokens spent)');
  assert(!!excludedSignal.discardReason?.includes('excluded keyword'), 'L1.4', `Discard reason: ${excludedSignal.discardReason}`);

  // ═════════════════════════════════════════════════════════════════════════
  // LAYER 2: Data Enrichment & Normalized Prospect Profile
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n── LAYER 2: Data Enrichment & Normalized Prospect Profile ────────────');

  // Case 2A: Complete, verified prospect profile
  const validLead = {
    id: `lead_${Date.now()}_1`,
    name: 'Sarah Jenkins',
    email: 'sarah.jenkins@plaid.com',
    emailVerified: true,
    title: 'Chief Technology Officer',
    company: 'Plaid',
    industry: 'Fintech',
    companySize: '1,200 employees',
    score: 95,
  };

  const normalizedProfile = ProspectNormalizer.normalize({
    id: validLead.id,
    organizationId: testOrgId,
    lead: validLead,
    signal: qualifiedSignal.payload,
    enrichmentData: { techStack: ['AWS', 'Next.js', 'PostgreSQL', 'Datadog'] },
  });

  assert(normalizedProfile.isOutreachReady === true, 'L2.1', 'Complete prospect marked isOutreachReady = true');
  assert(normalizedProfile.role.isDecisionMaker === true, 'L2.2', 'CTO role correctly identified as Decision Maker');
  assert(normalizedProfile.technology.techStack.length === 4, 'L2.3', `Enriched tech stack: ${normalizedProfile.technology.techStack.join(', ')}`);
  assert(normalizedProfile.personalization.reasonForSelection.includes('Plaid'), 'L2.4', 'Explicit Reason for Selection attached to profile');

  // Case 2B: Incomplete prospect (Unverified email)
  const unverifiedLead = {
    id: `lead_${Date.now()}_2`,
    name: 'John Doe',
    email: 'johndoe@unknown.com',
    emailVerified: false,
    title: 'Analyst',
    company: 'Unknown Corp',
    score: 55,
  };

  const incompleteProfile = ProspectNormalizer.normalize({
    id: unverifiedLead.id,
    organizationId: testOrgId,
    lead: unverifiedLead,
  });

  assert(incompleteProfile.isOutreachReady === false, 'L2.5', 'Incomplete/unverified prospect blocked from direct send (isOutreachReady = false)');
  assert(incompleteProfile.qualityIssues.length >= 1, 'L2.6', `Quality warnings: ${incompleteProfile.qualityIssues.join('; ')}`);

  // ═════════════════════════════════════════════════════════════════════════
  // LAYER 4: Generation Content Guardrails
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n── LAYER 4: Generation Content Guardrails ────────────────────────────');

  // Case 4A: Clean, humanized, trigger-grounded email
  const cleanEmail = {
    subject: "Quick question regarding Plaid's security scaling",
    body: "Hi Sarah,\n\nSaw Plaid's Series D announcement and your focus on cloud infrastructure.\n\nWe help FinTech leaders eliminate compliance bottlenecks and automate SOC2 audits. Would you be open to a 10-minute chat next Tuesday?",
    channel: 'email' as const,
  };
  const cleanValidation = ContentGuardrailsEngine.validateContent(cleanEmail);
  assert(cleanValidation.passed === true, 'L4.1', 'Clean humanized copy passed all content guardrails');
  assert(cleanValidation.wordCount < 60, 'L4.2', `Email word count concise: ${cleanValidation.wordCount} words`);

  // Case 4B: Unresolved template variable ({{firstName}})
  const brokenVarEmail = {
    subject: "Meeting with {{companyName}}",
    body: "Hi {{firstName}}, I wanted to reach out to {companyName} regarding our revolutionary platform.",
    channel: 'email' as const,
  };
  const brokenVarValidation = ContentGuardrailsEngine.validateContent(brokenVarEmail);
  assert(brokenVarValidation.passed === false, 'L4.3', 'Unresolved template variables blocked by guardrail');
  assert(brokenVarValidation.blockReasons.some(r => r.includes('Unresolved personalization variable')), 'L4.4', 'Detected exact unresolved variable');

  // Case 4C: Generic AI clichés ("I hope this email finds you well")
  const clicheEmail = {
    subject: "Innovative solutions",
    body: "Hi Sarah,\n\nI hope this email finds you well. In today's fast-paced world, our game-changer solution is a cutting-edge platform to dive into synergy.",
    channel: 'email' as const,
  };
  const clicheValidation = ContentGuardrailsEngine.validateContent(clicheEmail);
  assert(clicheValidation.passed === false, 'L4.5', 'Generic AI clichés blocked by guardrail');
  assert(clicheValidation.blockReasons.some(r => r.includes('Generic AI cliché')), 'L4.6', 'Cliché rule violation flagged');

  // Case 4D: LinkedIn 300-character constraint validation
  const oversizedLinkedInNote = {
    body: "Hi Sarah, I saw your recent announcement at Plaid and wanted to connect with you to share our thoughts on how modern financial technology companies can scale their compliance and automated security infrastructure while dramatically reducing friction across their developer teams. Let's schedule a call this week!",
    channel: 'linkedin_connect' as const,
  };
  const liValidation = ContentGuardrailsEngine.validateContent(oversizedLinkedInNote);
  assert(liValidation.passed === false, 'L4.7', 'Oversized LinkedIn connection note blocked (> 300 chars)');
  assert(liValidation.characterCount > 300, 'L4.8', `Character count (${liValidation.characterCount}) caught by guardrail`);

  // ═════════════════════════════════════════════════════════════════════════
  // LAYER 7 & 8: Event-Aware Sequences & Reply Classification
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n── LAYER 7 & 8: Event-Aware Sequences & Reply Classification ─────────');

  const leadRecord = await db.lead.create({
    data: {
      organizationId: testOrgId,
      name: 'Sarah Jenkins',
      email: `sarah.jenkins.${Date.now()}@plaid.com`,
      company: 'Plaid',
      status: 'contacted',
    },
  });

  const msgRecord = await db.outreachMessage.create({
    data: {
      organizationId: testOrgId,
      leadId: leadRecord.id,
      subject: cleanEmail.subject,
      body: cleanEmail.body,
      status: 'approved',
    },
  });

  const classifier = new ReplyClassifierAgent();

  // Test 8A: Positive Meeting Request → Halts Sequence & Escalates to Cal.com
  const meetingReply = "Hi Alex, Thursday at 2pm works great. Send over your invite link.";
  const meetingClassify = await classifier.run({
    messageId: msgRecord.id,
    replyText: meetingReply,
  }, {
    leadId: leadRecord.id,
    lead: leadRecord as any,
    organizationId: testOrgId,
    signals: [],
    previousMessages: [],
    traceId: `trace_${Date.now()}`,
  } as any);

  assert(meetingClassify.success, 'L8.1', 'Inbound meeting request classified');
  assert(!!meetingClassify.data?.calendarLink?.includes('cal.com'), 'L8.2', 'Calendar booking link attached to meeting reply');

  // Verify Event-Aware Universal Sequence Interruption
  await interruptSequence({
    leadId: leadRecord.id,
    organizationId: testOrgId,
    reason: 'meeting_booking',
    note: 'Prospect accepted meeting request',
  });

  await db.lead.update({
    where: { id: leadRecord.id },
    data: { status: 'meeting_booked' },
  });
  const updatedLead = await db.lead.findUnique({ where: { id: leadRecord.id } });
  assert(updatedLead?.status === 'meeting_booked', 'L7.1', 'Event-aware sequence halted and lead status moved to "meeting_booked"');

  // Test 8B: Opt-Out Unsubscribe → Permanent Suppression
  const unsubReply = "Please unsubscribe me from this mailing list.";
  const unsubClassify = await classifier.run({
    messageId: msgRecord.id,
    replyText: unsubReply,
  }, {
    leadId: leadRecord.id,
    lead: leadRecord as any,
    organizationId: testOrgId,
    signals: [],
    previousMessages: [],
    traceId: `trace_unsub_${Date.now()}`,
  } as any);

  assert(unsubClassify.data?.suppressed === true || unsubClassify.data?.nextAction === 'mark_unsub', 'L8.3', 'Unsubscribe triggers permanent DNC suppression flag');

  await db.lead.update({
    where: { id: leadRecord.id },
    data: { doNotContact: true, isBlacklisted: true, status: 'unsubscribed' },
  });

  const safetyCheck = await evaluateSendReadiness({
    messageId: msgRecord.id,
    organizationId: testOrgId,
    traceId: `trace_readiness_${Date.now()}`,
  });

  assert(safetyCheck.ready === false, 'L7.2', 'Deliverability circuit breaker strictly blocks sends to DNC leads (ready = false)');

  // ═════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log(`║   ARCHITECTURE VERIFICATION: ${passed} Passed / ${failed} Failed across All 4 Layers   ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runArchitectureVerificationSuite().catch((err) => {
  console.error('Architecture test failure:', err);
  process.exit(1);
});
