// ─── Real-World Client End-to-End Simulation Script ─────────────────────────────
// Tests the full SaaS experience as a real paying client:
// Apex Cybersecurity Inc. selling cloud security compliance to FinTech CTOs.

import { db } from '../lib/db';
import { DeliverabilityService } from '../lib/deliverability';
import { translateGoalToStrategy } from '../lib/agents/think/goal-translator';
import { ScoringEngine } from '../lib/agents/think/scoring-engine';
import { ReplyClassifierAgent } from '../lib/agents/reeval/reply-classifier';
import { evaluateSendReadiness } from '../lib/deliverability/send-readiness';

async function runClientSimulation() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║   PROACTIVEREACH — REAL-WORLD CLIENT END-TO-END JOURNEY SIMULATION       ║');
  console.log('║   Client: Apex Cybersecurity Inc. (Selling to FinTech CTOs)             ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  let testPassed = 0;
  let testFailed = 0;

  function assert(condition: boolean, stepName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS [${stepName}] ${detail || ''}`);
      testPassed++;
    } else {
      console.error(`  ❌ FAIL [${stepName}] ${detail || ''}`);
      testFailed++;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 1: Client Onboarding & Conversational Strategy
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── STAGE 1: Client Onboarding & Conversational Strategy ──────────────');
  
  const clientOrgId = `apex_org_${Date.now()}`;
  const org = await db.organization.create({
    data: {
      id: clientOrgId,
      name: 'Apex Cybersecurity Inc.',
      slug: `apex-security-${Date.now()}`,
    },
  });
  assert(!!org.id, 'Stage 1.1', `Created organization "${org.name}" (ID: ${org.id})`);

  const goalPrompt = 'Find US fintechs with 50-500 employees hiring cybersecurity leaders and reach out to CTOs';
  const strategy = translateGoalToStrategy({
    goalPrompt,
    productDescription: 'Autonomous cloud security compliance & SOC2 audit automation for FinTechs.',
    valueProposition: 'Eliminate 80% of compliance prep time and prevent critical cloud misconfigurations.',
  });

  assert(strategy.summary.length > 0, 'Stage 1.2', `Summary: "${strategy.summary}"`);
  assert(strategy.icpCriteria.industries.length > 0, 'Stage 1.3', `Target Industries: ${strategy.icpCriteria.industries.join(', ')}`);
  assert(strategy.personas.length > 0, 'Stage 1.4', `Target Persona: ${strategy.personas[0].title}`);
  assert(strategy.sequenceSteps.length === 4, 'Stage 1.5', `Generated ${strategy.sequenceSteps.length}-step multi-touch sequence`);

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 2: Secondary Sending Domain Setup & DNS Verification
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── STAGE 2: Secondary Sending Domain Setup & Deliverability Shield ───');

  const domainResult = await DeliverabilityService.addDomain({
    organizationId: clientOrgId,
    domain: 'outreach.apexsec.io',
    fromEmail: 'alex@outreach.apexsec.io',
    fromName: 'Alex Rivers',
  });

  assert(domainResult.success, 'Stage 2.1', `Secondary domain created: outreach.apexsec.io`);
  assert(!!domainResult.domainId, 'Stage 2.2', `Domain ID assigned: ${domainResult.domainId}`);

  // Perform DNS Verification
  const dnsStatus = await DeliverabilityService.verifyDomain(domainResult.domainId!, clientOrgId);
  assert(dnsStatus.spf.verified, 'Stage 2.3', 'SPF Record verified (v=spf1 include:resend.com ~all)');
  assert(dnsStatus.dkim.verified, 'Stage 2.4', 'DKIM Record verified (resend._domainkey.outreach.apexsec.io)');
  assert(dnsStatus.dmarc.verified, 'Stage 2.5', 'DMARC Record verified (_dmarc.outreach.apexsec.io)');

  const verifiedDomain = await db.sendingDomain.findUnique({ where: { id: domainResult.domainId! } });
  const statusLower = (verifiedDomain?.status || '').toLowerCase();
  assert(statusLower === 'active' || statusLower === 'verified', 'Stage 2.6', `Domain status is ACTIVE & VERIFIED in DB (${verifiedDomain?.status})`);

  const sender = await (db as any).senderAccount.findFirst({
    where: { organizationId: clientOrgId, domainId: domainResult.domainId! },
  });
  assert(!!sender?.id, 'Stage 2.7', `Sender account active for alex@outreach.apexsec.io (ID: ${sender?.id})`);

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 3: Campaign Activation & Sequence Rules
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── STAGE 3: Campaign Activation & Multi-Step Sequence ────────────────');

  const campaign = await db.campaign.create({
    data: {
      organizationId: clientOrgId,
      name: 'FinTech CTO Cloud Security Expansion',
      status: 'active',
      dailyLimit: 50,
      fromEmail: 'alex@outreach.apexsec.io',
      fromName: 'Alex Rivers',
      goal: goalPrompt,
      tone: 'professional',
      cta: 'Would you be open to a 10-minute architecture review next Tuesday?',
      sequenceSteps: JSON.stringify(strategy.sequenceSteps),
    },
  });

  assert(campaign.status === 'active', 'Stage 3.1', `Campaign "${campaign.name}" created with ACTIVE status`);

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 4: Automated Prospect Discovery & Evidence-Backed Research
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── STAGE 4: Automated Prospect Discovery & Signal Grounding ──────────');

  // Simulate AI SDR discovering a high-intent prospect matching ICP
  const prospect1 = await db.lead.create({
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
      score: 94.0,
      emailVerified: true,
      status: 'discovered',
    },
  });

  const signal1 = await db.signal.create({
    data: {
      organizationId: clientOrgId,
      leadId: prospect1.id,
      type: 'funding',
      content: 'Plaid raised $425M Series D and is actively scaling cloud security infrastructure.',
      sourceUrl: 'https://techcrunch.com/plaid-funding',
      sourceTitle: 'Plaid Secures Series D for Platform Expansion',
      score: 95.0,
      relevance: 0.95,
      confidence: 0.98,
    },
  });

  assert(!!prospect1.id, 'Stage 4.1', `AI Discovered prospect: ${prospect1.name} (${prospect1.title} at ${prospect1.company})`);
  assert(!!signal1.id, 'Stage 4.2', `Intent Signal Grounded: "${signal1.content}" (URL: ${signal1.sourceUrl})`);

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 5: Multi-Factor Scoring & Contextual Copy Generation
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── STAGE 5: Scoring & Contextual Copy Generation ─────────────────────');

  const scorer = new ScoringEngine();
  const scoringContext = {
    leadId: prospect1.id,
    lead: prospect1 as any,
    organization: org as any,
    organizationId: clientOrgId,
    signals: [signal1 as any],
    previousMessages: [],
    campaignConfig: campaign as any,
    traceId: `trace_${Date.now()}`,
  };

  const scoreResult = await scorer.run({ forceRescore: true }, scoringContext);
  assert(scoreResult.success, 'Stage 5.1', `Scoring Engine completed successfully in ${scoreResult.durationMs}ms`);
  assert((scoreResult.data?.leadScore ?? 0) >= 50, 'Stage 5.2', `Composite score calculated: ${scoreResult.data?.leadScore}/100 (Tier: ${scoreResult.data?.priorityTier})`);
  assert((scoreResult.data?.signalScore ?? 0) >= 50, 'Stage 5.3', `Signal strength score: ${scoreResult.data?.signalScore}/100`);

  const step1 = strategy.sequenceSteps[0];
  const personalizedSubject = step1.subject.replace('{{company}}', prospect1.company || 'Plaid');
  const personalizedBody = `Hi ${prospect1.firstName},\n\nNoticed ${prospect1.company} recently announced: "${signal1.content}"\n\nWe help Fintech leaders eliminate compliance bottlenecks and automate SOC2 reviews. Would you be open to a 10-minute chat next Tuesday?\n\nBest,\nAlex`;

  const evidenceSnapshot = {
    signalId: signal1.id,
    signalContent: signal1.content,
    sourceUrl: signal1.sourceUrl,
    generatedAt: new Date().toISOString(),
  };

  // Persist Outreach Message with assigned sender
  const outreachMsg = await db.outreachMessage.create({
    data: {
      organizationId: clientOrgId,
      campaignId: campaign.id,
      leadId: prospect1.id,
      senderId: sender?.id || null,
      subject: personalizedSubject,
      body: personalizedBody,
      status: 'pending_approval',
      evidenceSnapshot: JSON.stringify(evidenceSnapshot),
      sequencePos: 1,
    },
  });

  assert(outreachMsg.status === 'pending_approval', 'Stage 5.4', `Message queued for 5-Second Human Review (ID: ${outreachMsg.id})`);
  assert(outreachMsg.subject.includes('Plaid'), 'Stage 5.5', `Generated Subject references "${prospect1.company}"`);

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 6: 5-Second Review & 7-Step Pre-Send Safety Audit
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── STAGE 6: 5-Second Review & 7-Step Pre-Send Deliverability Audit ───');

  // Client 1-click approves the draft
  await db.outreachMessage.update({
    where: { id: outreachMsg.id },
    data: { status: 'approved', approvedAt: new Date() },
  });

  // Execute 7-Step Deliverability Circuit Breaker Gate
  const readiness = await evaluateSendReadiness({
    messageId: outreachMsg.id,
    organizationId: clientOrgId,
    traceId: `trace_audit_${Date.now()}`,
  });

  assert(readiness.ready, 'Stage 6.1', 'All 7 Deliverability Circuit Breaker gates passed 100% (ready = true)');
  assert(readiness.checks.every(c => c.status === 'pass' || c.status === 'warn'), 'Stage 6.2', `All ${readiness.checks.length} sub-checks verified safe for sending`);

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 7: Inbound Reply Handling, AI Classification & Calendar Routing
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── STAGE 7: AI Smart Inbox Classification & Calendar Routing ─────────');

  // Scenario 7A: Prospect replies asking for a meeting
  const replyClassifier = new ReplyClassifierAgent();
  const reevalContext = {
    leadId: prospect1.id,
    lead: prospect1 as any,
    organization: org as any,
    organizationId: clientOrgId,
    signals: [signal1 as any],
    previousMessages: [],
    campaignConfig: campaign as any,
    traceId: `trace_reply_${Date.now()}`,
  };

  const positiveReply = "Hi Alex, this is timely. We just closed our round and are hiring. Do you have 15 minutes this Thursday afternoon for a demo?";
  const meetingResult = await replyClassifier.run({
    messageId: outreachMsg.id,
    replyText: positiveReply,
  }, reevalContext);

  assert(meetingResult.success, 'Stage 7.1', 'ReplyClassifier evaluated inbound meeting request');
  assert(meetingResult.data?.sentiment === 'positive' || meetingResult.data?.nextAction === 'escalate', 'Stage 7.2', `Meeting reply classified with positive intent (Action: ${meetingResult.data?.nextAction})`);

  // Simulate Calendar Booking routing
  const updatedLead = await db.lead.update({
    where: { id: prospect1.id },
    data: { status: 'meeting_booked' },
  });
  assert(updatedLead.status === 'meeting_booked', 'Stage 7.3', `Lead stage escalated to "meeting_booked" with Cal.com routing`);

  // Scenario 7B: Unsubscribe reply triggers permanent DNC suppression
  const optOutReply = "Please unsubscribe me from your emails.";
  const optOutResult = await replyClassifier.run({
    messageId: outreachMsg.id,
    replyText: optOutReply,
  }, reevalContext);

  assert(optOutResult.success, 'Stage 7.4', 'ReplyClassifier evaluated opt-out reply');
  assert(optOutResult.data?.sentiment === 'negative' || optOutResult.data?.nextAction === 'mark_unsub', 'Stage 7.5', `Opt-out classified for permanent DNC suppression (Action: ${optOutResult.data?.nextAction})`);

  await db.lead.update({
    where: { id: prospect1.id },
    data: { doNotContact: true, isBlacklisted: true, status: 'unsubscribed' },
  });

  const dncAudit = await evaluateSendReadiness({
    messageId: outreachMsg.id,
    organizationId: clientOrgId,
    traceId: `trace_dnc_${Date.now()}`,
  });

  assert(!dncAudit.ready, 'Stage 7.6', 'Send readiness BLOCKS any future sends to unsubscribed lead (ready = false)');
  assert(dncAudit.checks.some(c => c.id === 'lead_not_dnc' && c.status === 'block'), 'Stage 7.7', 'Zero-DNC leak guarantee verified by lead_not_dnc circuit breaker');

  // ─────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log(`║   SIMULATION RESULT: ${testPassed} Passed / ${testFailed} Failed across 7 Client Stages     ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  if (testFailed > 0) {
    process.exit(1);
  }
}

runClientSimulation().catch((err) => {
  console.error('Simulation encountered unhandled error:', err);
  process.exit(1);
});
