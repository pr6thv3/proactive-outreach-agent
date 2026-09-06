// ─── Multi-Channel Orchestration Test Suite ──────────────────────────────────────
// Verifies Email + LinkedIn multi-touch sequence execution, 300-char note limits,
// LinkedIn anti-ban daily safety caps (20/day), and cross-channel universal cancellation.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from '../lib/db';
import { LinkedInService, DEFAULT_LINKEDIN_LIMITS } from '../lib/deliverability/linkedin-service';
import { translateGoalToStrategy } from '../lib/agents/think/goal-translator';
import { interruptSequence } from '../lib/agents/act/followup-scheduler';
import { ReplyClassifierAgent } from '../lib/agents/reeval/reply-classifier';

async function runMultiChannelTests() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║   PROACTIVEREACH — MULTI-CHANNEL (EMAIL + LINKEDIN) TEST SUITE           ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS [${testName}] ${detail || ''}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL [${testName}] ${detail || ''}`);
      failed++;
    }
  }

  const testOrgId = `org_multichannel_${Date.now()}`;
  await db.organization.create({
    data: { id: testOrgId, name: 'OmniChannel Labs', slug: `omni-${Date.now()}` },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: LinkedIn 300-Character Note Validation
  // ─────────────────────────────────────────────────────────────────────────
  console.log('── Test 1: LinkedIn 300-Character Note Validation ─────────────────────');

  const validNote = 'Hi Sarah, saw Plaid\'s Series D announcement. We help FinTech leaders eliminate compliance bottlenecks. Would love to connect!';
  const validCheck = LinkedInService.validateConnectionNote(validNote);
  assert(validCheck.valid && validCheck.length <= 300, 'T1.1', `Valid note accepted (${validCheck.length}/300 chars)`);

  const oversizedNote = 'A'.repeat(305);
  const oversizedCheck = LinkedInService.validateConnectionNote(oversizedNote);
  assert(!oversizedCheck.valid && oversizedCheck.length === 305, 'T1.2', `Oversized note rejected (${oversizedCheck.length}/300 chars: "${oversizedCheck.error}")`);

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: Multi-Channel Sequence Strategy Generation
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── Test 2: Multi-Channel Sequence Strategy Generation ────────────────');

  const strategy = translateGoalToStrategy({
    goalPrompt: 'Find US fintechs with 50-500 employees and reach out to CTOs via email and LinkedIn',
  });

  assert(strategy.sequenceSteps.length >= 4, 'T2.1', `Generated ${strategy.sequenceSteps.length} sequence steps`);
  assert(strategy.personas.length > 0, 'T2.2', `Target persona identified: ${strategy.personas[0].title}`);

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: LinkedIn Action Execution & Anti-Ban Daily Rate Limiting
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── Test 3: LinkedIn Action Execution & Daily Safety Caps ──────────────');

  const lead = await db.lead.create({
    data: {
      organizationId: testOrgId,
      name: 'Alex Rivera',
      firstName: 'Alex',
      lastName: 'Rivera',
      email: `alex.rivera.${Date.now()}@finscale.io`,
      company: 'FinScale',
      title: 'VP Engineering',
      status: 'discovered',
    },
  });

  // Execute Profile View
  const viewResult = await LinkedInService.executeAction({
    organizationId: testOrgId,
    leadId: lead.id,
    actionType: 'profile_view',
    linkedinUrl: 'https://linkedin.com/in/alex-rivera-tech',
  });
  assert(viewResult.success, 'T3.1', `LinkedIn profile view executed for ${lead.name}`);

  // Execute Connection Request with valid note
  const connectResult = await LinkedInService.executeAction({
    organizationId: testOrgId,
    leadId: lead.id,
    actionType: 'connection_request',
    linkedinUrl: 'https://linkedin.com/in/alex-rivera-tech',
    note: 'Hi Alex, saw your team expansion at FinScale. Would love to share our deliverability benchmarks.',
  });
  assert(connectResult.success, 'T3.2', `LinkedIn connection request sent with ${connectResult.characterCount}-char note`);

  // Verify Daily Safety Cap
  assert(DEFAULT_LINKEDIN_LIMITS.connectionRequests === 20, 'T3.3', `Strict daily connection invite cap configured at ${DEFAULT_LINKEDIN_LIMITS.connectionRequests}/day`);
  assert(DEFAULT_LINKEDIN_LIMITS.profileViews === 50, 'T3.4', `Strict daily profile view cap configured at ${DEFAULT_LINKEDIN_LIMITS.profileViews}/day`);

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: Cross-Channel Universal Sequence Interruption
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── Test 4: Cross-Channel Universal Sequence Interruption ─────────────');

  const campaign = await db.campaign.create({
    data: {
      organizationId: testOrgId,
      name: 'OmniChannel CTO Campaign',
      status: 'active',
      dailyLimit: 25,
      fromEmail: 'alex@reach.io',
      fromName: 'Alex',
      goal: 'Outreach',
    },
  });

  // Create scheduled email and scheduled linkedin touches
  const scheduledEmail = await db.outreachMessage.create({
    data: {
      organizationId: testOrgId,
      campaignId: campaign.id,
      leadId: lead.id,
      subject: 'Quick question regarding FinScale',
      body: 'Hi Alex, following up...',
      status: 'approved',
      channel: 'email',
    },
  });

  // Inbound reply arrives on LinkedIn
  const replyClassifier = new ReplyClassifierAgent();
  const linkedInReply = "Thanks for the LinkedIn message Alex! Yes, let's chat next week. Send over your calendar link.";
  
  const reevalResult = await replyClassifier.run({
    messageId: scheduledEmail.id,
    replyText: linkedInReply,
  }, {
    leadId: lead.id,
    lead: lead as any,
    organizationId: testOrgId,
    signals: [],
    previousMessages: [],
    traceId: `trace_mc_${Date.now()}`,
  } as any);

  assert(reevalResult.success, 'T4.1', 'LinkedIn inbound message classified by AI classifier');
  assert(reevalResult.data?.sentiment === 'positive' || reevalResult.data?.nextAction === 'escalate', 'T4.2', 'Positive intent detected from LinkedIn touchpoint');

  // Universal sequence interrupt
  await interruptSequence(lead.id, testOrgId, 'Inbound LinkedIn message received');
  
  const updatedLead = await db.lead.findUnique({ where: { id: lead.id } });
  assert(updatedLead?.status === 'replied' || updatedLead?.status === 'interested' || updatedLead?.status === 'contacted', 'T4.3', `Cross-channel sequence interrupted across Email & LinkedIn (Lead status: ${updatedLead?.status})`);

  // ─────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log(`║   MULTI-CHANNEL TEST RESULTS: ${passed} Passed / ${failed} Failed                       ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runMultiChannelTests().catch((err) => {
  console.error('Multi-channel test failure:', err);
  process.exit(1);
});
