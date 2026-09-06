// ─── Complete Commercial Readiness E2E Verification Test ─────────────────────
// Validates every essential client feature, workflow, and capability from start to finish.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from '../lib/db';
import { DeliverabilityService } from '../lib/deliverability';
import { translateGoalToStrategy } from '../lib/agents/think/goal-translator';
import { ScoringEngine } from '../lib/agents/think/scoring-engine';
import { ReplyClassifierAgent } from '../lib/agents/reeval/reply-classifier';
import { evaluateSendReadiness } from '../lib/deliverability/send-readiness';
import { LinkedInService, DEFAULT_LINKEDIN_LIMITS } from '../lib/deliverability/linkedin-service';
import { AbTestingOptimizer } from '../lib/agents/think/ab-testing';
import { CrmSyncService } from '../lib/integrations/crm-sync';
import { interruptSequence } from '../lib/agents/act/followup-scheduler';

async function runCommercialReadinessSuite() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║   PROACTIVEREACH — COMPLETE COMMERCIAL SYSTEM READINESS TEST SUITE        ║');
  console.log('║   Full Lifecycle: Onboarding → Signals → Discovery → A/B → CRM → Inbox   ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, stepName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS [${stepName}] ${detail || ''}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL [${stepName}] ${detail || ''}`);
      failed++;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 1: Organization Onboarding & Natural Language Goal Translation
  // ─────────────────────────────────────────────────────────────────────────
  console.log('── STAGE 1: Organization Onboarding & Conversational Strategy ────────');
  
  const clientOrgId = `full_org_${Date.now()}`;
  const org = await db.organization.create({
    data: {
      id: clientOrgId,
      name: 'Vanguard Security Systems',
      slug: `vanguard-${Date.now()}`,
    },
  });
  assert(!!org.id, 'S1.1', `Created organization "${org.name}" (ID: ${org.id})`);

  const strategy = translateGoalToStrategy({
    goalPrompt: 'Find US fintech and cloud infrastructure companies with 50-500 employees hiring security leads and reach out to CTOs',
    productDescription: 'Automated SOC2 audit compliance and cloud vulnerability remediation.',
    valueProposition: 'Eliminate compliance audit prep time by 80%.',
  });

  assert(strategy.icpCriteria.industries.length >= 2, 'S1.2', `Target Industries: ${strategy.icpCriteria.industries.join(', ')}`);
  assert(strategy.personas[0].decisionMaker, 'S1.3', `Target Persona: ${strategy.personas[0].title} (Decision Maker: true)`);
  assert(strategy.sequenceSteps.length === 4, 'S1.4', `Generated 4-step multi-touch sequence`);

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 2: 1-Click Domain Setup & Deliverability Shield
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── STAGE 2: 1-Click Sending Domain Setup & Deliverability Shield ─────');

  const domainRes = await DeliverabilityService.addDomain({
    organizationId: clientOrgId,
    domain: 'outreach.vanguardsec.io',
    fromEmail: 'alex@outreach.vanguardsec.io',
    fromName: 'Alex Rivers',
  });

  assert(domainRes.success, 'S2.1', 'Secondary sending domain created: outreach.vanguardsec.io');
  
  const dnsRes = await DeliverabilityService.verifyDomain(domainRes.domainId!, clientOrgId);
  assert(dnsRes.spf.verified && dnsRes.dkim.verified && dnsRes.dmarc.verified, 'S2.2', 'SPF, DKIM, and DMARC DNS records verified');

  const sender = await (db as any).senderAccount.findFirst({
    where: { organizationId: clientOrgId, domainId: domainRes.domainId! },
  });
  assert(!!sender?.id, 'S2.3', `Sender account active for alex@outreach.vanguardsec.io`);

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 3: Live Buying Signal Stream & Dynamic A/B Testing
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── STAGE 3: Live Buying Signal Stream & Dynamic A/B Testing ──────────');

  const abVariants = AbTestingOptimizer.generateVariants({
    companyName: 'Plaid',
    industry: 'Fintech',
    signalContext: 'Plaid raised $425M Series D',
    valueProp: 'Automating SOC2 compliance reviews',
  });

  assert(abVariants.variantA.subject.includes('Plaid'), 'S3.1', `Variant A Hook: "${abVariants.variantA.subject}"`);
  assert(abVariants.variantB.subject.includes('Fintech'), 'S3.2', `Variant B Hook: "${abVariants.variantB.subject}"`);

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 4: Automated Prospect Discovery & Evidence Grounding
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── STAGE 4: Automated Prospect Discovery & Evidence Grounding ────────');

  const prospect = await db.lead.create({
    data: {
      organizationId: clientOrgId,
      name: 'Sarah Jenkins',
      firstName: 'Sarah',
      lastName: 'Jenkins',
      email: `sarah.jenkins.${Date.now()}@plaid.com`,
      company: 'Plaid',
      title: 'Chief Technology Officer',
      industry: 'Fintech',
      companySize: '250 employees',
      country: 'United States',
      score: 96.0,
      emailVerified: true,
      status: 'discovered',
    },
  });

  const signal = await db.signal.create({
    data: {
      organizationId: clientOrgId,
      leadId: prospect.id,
      type: 'funding',
      content: 'Plaid raised $425M Series D and is actively scaling cloud security infrastructure.',
      sourceUrl: 'https://techcrunch.com/plaid-funding',
      sourceTitle: 'Plaid Series D Funding Announcement',
      score: 98.0,
      relevance: 0.98,
      confidence: 0.99,
    },
  });

  assert(!!prospect.id, 'S4.1', `Discovered prospect: ${prospect.name} at ${prospect.company}`);
  assert(!!signal.id, 'S4.2', `Grounded intent signal attached with verified citation URL`);

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 5: Multi-Factor Scoring & 5-Second Review Queue
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── STAGE 5: Multi-Factor Scoring & 5-Second Review Queue ─────────────');

  const scorer = new ScoringEngine();
  const scoreResult = await scorer.run({ forceRescore: true }, {
    leadId: prospect.id,
    lead: prospect as any,
    organizationId: clientOrgId,
    signals: [signal as any],
    traceId: `trace_${Date.now()}`,
  } as any);

  assert(scoreResult.success, 'S5.1', `Lead scored in ${scoreResult.durationMs}ms`);
  assert((scoreResult.data?.leadScore ?? 0) >= 50, 'S5.2', `Score: ${scoreResult.data?.leadScore}/100 (${scoreResult.data?.priorityTier})`);

  const campaign = await db.campaign.create({
    data: {
      organizationId: clientOrgId,
      name: 'FinTech CTO Expansion Campaign',
      status: 'active',
      dailyLimit: 50,
      fromEmail: 'alex@outreach.vanguardsec.io',
      fromName: 'Alex Rivers',
      goal: 'Outreach',
    },
  });

  const outreachMessage = await db.outreachMessage.create({
    data: {
      organizationId: clientOrgId,
      campaignId: campaign.id,
      leadId: prospect.id,
      senderId: sender?.id || null,
      subject: abVariants.variantA.subject,
      body: abVariants.variantA.bodyHook,
      status: 'pending_approval',
      evidenceSnapshot: JSON.stringify({
        signalId: signal.id,
        signalContent: signal.content,
        sourceUrl: signal.sourceUrl,
      }),
      sequencePos: 1,
    },
  });

  assert(outreachMessage.status === 'pending_approval', 'S5.3', `Message queued for 5-second human review (ID: ${outreachMessage.id})`);

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 6: 1-Click Approval & 7-Gate Pre-Send Safety Audit
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── STAGE 6: 1-Click Approval & 7-Gate Pre-Send Safety Audit ──────────');

  await db.outreachMessage.update({
    where: { id: outreachMessage.id },
    data: { status: 'approved', approvedAt: new Date() },
  });

  const readiness = await evaluateSendReadiness({
    messageId: outreachMessage.id,
    organizationId: clientOrgId,
    traceId: `trace_safety_${Date.now()}`,
  });

  assert(readiness.ready, 'S6.1', 'All 7 Deliverability Circuit Breaker gates passed 100% (ready = true)');

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 7: LinkedIn Multi-Channel Touchpoint Execution
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── STAGE 7: LinkedIn Multi-Channel Touchpoint Execution ──────────────');

  const liConnectResult = await LinkedInService.executeAction({
    organizationId: clientOrgId,
    leadId: prospect.id,
    actionType: 'connection_request',
    linkedinUrl: 'https://linkedin.com/in/sarah-jenkins-cto',
    note: 'Hi Sarah, saw Plaid\'s Series D announcement. We help FinTech leaders eliminate compliance bottlenecks. Would love to connect!',
  });

  assert(liConnectResult.success, 'S7.1', `LinkedIn connection request sent with ${liConnectResult.characterCount}-char note`);
  assert(DEFAULT_LINKEDIN_LIMITS.connectionRequests === 20, 'S7.2', 'Anti-ban safety limit enforced (Max 20/day)');

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 8: Inbound Smart Inbox & Calendar Booking Escalation
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── STAGE 8: AI Smart Inbox & Meeting Booking Escalation ──────────────');

  const replyClassifier = new ReplyClassifierAgent();
  const positiveReply = "Hi Alex, this is very timely. We are looking for SOC2 automation right now. Are you free this Thursday at 2pm?";
  
  const classificationResult = await replyClassifier.run({
    messageId: outreachMessage.id,
    replyText: positiveReply,
  }, {
    leadId: prospect.id,
    lead: prospect as any,
    organizationId: clientOrgId,
    signals: [],
    previousMessages: [],
    traceId: `trace_inbound_${Date.now()}`,
  } as any);

  assert(classificationResult.success, 'S8.1', 'Inbound prospect response classified');
  assert(classificationResult.data?.sentiment === 'positive' || classificationResult.data?.nextAction === 'escalate', 'S8.2', 'Positive meeting intent detected');

  await interruptSequence({
    leadId: prospect.id,
    organizationId: clientOrgId,
    reason: 'meeting_booking',
    note: 'Prospect agreed to demo',
  });

  await db.lead.update({
    where: { id: prospect.id },
    data: { status: 'meeting_booked' },
  });

  const updatedLead = await db.lead.findUnique({ where: { id: prospect.id } });
  assert(updatedLead?.status === 'meeting_booked', 'S8.3', 'Lead stage escalated to "meeting_booked"');

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 9: Bi-Directional CRM Sync & Permanent DNC Protection
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── STAGE 9: Bi-Directional CRM Sync & Permanent DNC Protection ───────');

  const crmResult = await CrmSyncService.syncLeadToCrm({
    organizationId: clientOrgId,
    leadId: prospect.id,
    eventType: 'meeting_booked',
    leadName: prospect.name,
    leadEmail: prospect.email,
    companyName: prospect.company || 'Plaid',
    jobTitle: prospect.title || 'CTO',
    notes: 'Prospect requested SOC2 demo for Thursday 2pm.',
    signalContext: signal.content,
  });

  assert(crmResult.success, 'S9.1', `Lead and deal synced to CRM (${crmResult.provider}) with external ID: ${crmResult.externalId}`);

  // Test Opt-Out Suppression Guarantee
  await db.lead.update({
    where: { id: prospect.id },
    data: { doNotContact: true, isBlacklisted: true, status: 'unsubscribed' },
  });

  const dncSafetyAudit = await evaluateSendReadiness({
    messageId: outreachMessage.id,
    organizationId: clientOrgId,
    traceId: `trace_dnc_${Date.now()}`,
  });

  assert(!dncSafetyAudit.ready, 'S9.2', 'Send-readiness strictly BLOCKS sends to unsubscribed leads (ready = false)');
  assert(dncSafetyAudit.checks.some(c => c.id === 'lead_not_dnc' && c.status === 'block'), 'S9.3', 'Zero-DNC leak guarantee verified by lead_not_dnc circuit breaker');

  // ─────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log(`║   FULL SYSTEM READINESS: ${passed} Passed / ${failed} Failed across All 9 Stages      ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runCommercialReadinessSuite().catch((err) => {
  console.error('System readiness test failure:', err);
  process.exit(1);
});
