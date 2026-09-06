// Load environment variables before initializing db
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { db as dbClient } from '../lib/db';
const db = dbClient as any;
import { checkCircuitBreaker } from '../lib/risk/circuit-breaker';
import { evaluateRisk } from '../lib/risk/index';
import { evaluateSendReadiness, assertReadyToSend } from '../lib/deliverability/send-readiness';
import { DeliverabilityService } from '../lib/deliverability';
import { handleBounce, handleUnsubscribe } from '../lib/deliverability/bounce-handler';
import { AutonomousWorkflowEngine } from '../lib/agents/infrastructure/autonomous-engine';
import { processSendEmailJob } from '../lib/queue/processors/send-email.processor';
import { Campaign, Lead, OutreachEmail as OutreachMessage, SendingDomain } from '@prisma/client';

// ═══════════════════════════════════════════════════════════════
// TEST HARNESS
// ═══════════════════════════════════════════════════════════════

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
  if (actual !== expected) {
    assert(false, testName, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else {
    assert(true, testName);
  }
}

function section(name: string): void {
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 65 - name.length))}`);
}

// ═══════════════════════════════════════════════════════════════
// TEST DATA CLEANUP & HELPERS
// ═══════════════════════════════════════════════════════════════

async function cleanTestData(orgId: string) {
  await db.emailEvent.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.activity.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.jobQueue.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.messageEdit.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.outreachMessage.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.signal.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.lead.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.campaignSenderPool.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.campaign.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.senderAccount.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.sendingDomain.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.reputationSnapshot.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.userPreference.deleteMany({ where: { activeOrgId: orgId } }).catch(() => {});
}

async function createEmailEvents(records: any[]) {
  for (let i = 0; i < records.length; i += 50) {
    const chunk = records.slice(i, i + 50);
    await Promise.all(chunk.map(data => db.emailEvent.create({ data })));
  }
}

async function setupBaselineEnvironment(prefix = 'cb_test') {
  const timestamp = Date.now();
  const orgId = `${prefix}_org_${timestamp}_${Math.random().toString(36).substring(2, 7)}`;
  const org = await db.organization.create({
    data: {
      id: orgId,
      workspaceKey: `ws_${orgId}`,
      name: `Circuit Breaker Test Org ${timestamp}`,
      slug: `org-${orgId}`,
    },
  });

  const domain = await db.sendingDomain.create({
    data: {
      organizationId: org.id,
      domain: `${prefix}-${timestamp}.outbound-safety.com`,
      status: 'verified',
      reputationScore: 95,
      dailyLimit: 200,
      spfVerified: true,
      dkimVerified: true,
      dmarcVerified: true,
    },
  });

  const sender = await db.senderAccount.create({
    data: {
      organizationId: org.id,
      domainId: domain.id,
      email: `outreach@${domain.domain}`,
      name: 'Safety Sender',
      status: 'active',
      reputationScore: 95,
      dailyLimit: 100,
    },
  });

  const campaign = await db.campaign.create({
    data: {
      organizationId: org.id,
      name: 'Deliverability Protected Campaign',
      status: 'running',
      goal: 'Deliverability validation',
      targetAudience: 'B2B Tech',
      offer: 'Cloud audit',
      senderEmail: sender.email,
      senderName: sender.name,
      tone: 'professional',
      cta: 'Request demo',
      maxDailySends: 100,
      bounceRatePauseThreshold: 0.03, // 3.0%
      complaintRatePauseThreshold: 0.001, // 0.1%
      unsubscribeRatePauseThreshold: 0.02, // 2.0%
    },
  });

  return { org, domain, sender, campaign };
}

// ═══════════════════════════════════════════════════════════════
// MAIN TEST SUITE
// ═══════════════════════════════════════════════════════════════

async function runCircuitBreakerKillSwitchSuite() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  MILESTONE 3: CIRCUIT BREAKER & KILL-SWITCH VALIDATION SUITE    ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  const createdOrgIds: string[] = [];

  try {
    // ═══════════════════════════════════════════════════════════
    // SECTION 1: High Simulated Bounce Rate (> 3.0%) Auto-Pause
    // ═══════════════════════════════════════════════════════════
    section('1. High Bounce Rate Circuit Breaker (> 3.0%)');
    {
      const { org, domain, campaign } = await setupBaselineEnvironment('bounce');
      createdOrgIds.push(org.id);

      // Case 1.1: Healthy Metrics (100 sent, 1 bounce = 1.0% < 3.0%)
      for (let i = 0; i < 100; i++) {
        await db.emailEvent.create({
          data: {
            organizationId: org.id,
            domainId: domain.id,
            campaignId: campaign.id,
            eventType: 'sent',
            recipient: `lead_${i}@example.com`,
          },
        });
      }
      await db.emailEvent.create({
        data: {
          organizationId: org.id,
          domainId: domain.id,
          campaignId: campaign.id,
          eventType: 'bounced',
          recipient: 'lead_0@example.com',
          bounceType: 'hard',
          bounceReason: '550 5.1.1 User unknown',
        },
      });

      let cbStatus = await checkCircuitBreaker({
        domainId: domain.id,
        campaignId: campaign.id,
        organizationId: org.id,
      });

      assertEqual(cbStatus.triggered, false, '1.1: Circuit breaker not triggered for healthy bounce rate (1.0%)');
      assertEqual(cbStatus.status, 'pass', '1.1: Circuit breaker status is pass');
      assertEqual(cbStatus.details.bounceExceeded, false, '1.1: bounceExceeded is false');

      let campaignInDb = await db.campaign.findUnique({ where: { id: campaign.id } });
      assertEqual(campaignInDb?.status, 'running', '1.1: Campaign remains running');

      // Case 1.2: Warning Threshold (100 sent, 2.5 bounces equivalent -> 2.5% vs 3.0% threshold, warning at 2/3 = 2.0%)
      await db.emailEvent.create({
        data: {
          organizationId: org.id,
          domainId: domain.id,
          campaignId: campaign.id,
          eventType: 'bounced',
          recipient: 'lead_1@example.com',
          bounceType: 'hard',
          bounceReason: '550 5.1.1 Mailbox does not exist',
        },
      }); // Now 2 bounces / 100 = 2.0% -> warning threshold is 0.03 * (2/3) = 0.02 (2.0%)

      cbStatus = await checkCircuitBreaker({
        domainId: domain.id,
        campaignId: campaign.id,
        organizationId: org.id,
      });

      assertEqual(cbStatus.triggered, false, '1.2: Warning threshold does not trigger circuit breaker block');
      assertEqual(cbStatus.status, 'warn', '1.2: Status transitions to warn on elevated bounce rate');
      assert(
        Boolean(cbStatus.reason?.includes('bounce rate 2.0% is elevated')),
        '1.2: Warning reason explicitly mentions elevated bounce rate'
      );

      // Case 1.3: Trigger High Bounce Rate (> 3.0% threshold: 4 bounces / 100 sent = 4.0%)
      await db.emailEvent.create({
        data: {
          organizationId: org.id,
          domainId: domain.id,
          campaignId: campaign.id,
          eventType: 'bounced',
          recipient: 'lead_2@example.com',
          bounceType: 'hard',
          bounceReason: '550 5.1.1 Invalid address',
        },
      });
      await db.emailEvent.create({
        data: {
          organizationId: org.id,
          domainId: domain.id,
          campaignId: campaign.id,
          eventType: 'bounced',
          recipient: 'lead_3@example.com',
          bounceType: 'hard',
          bounceReason: '550 5.1.1 Recipient rejected',
        },
      });

      cbStatus = await checkCircuitBreaker({
        domainId: domain.id,
        campaignId: campaign.id,
        organizationId: org.id,
      });

      assertEqual(cbStatus.triggered, true, '1.3: Circuit breaker triggers instantaneously on 4.0% bounce rate (> 3.0%)');
      assertEqual(cbStatus.status, 'block', '1.3: Circuit breaker status is block');
      assertEqual(cbStatus.details.bounceExceeded, true, '1.3: details.bounceExceeded is true');
      assert(
        Boolean(cbStatus.reason?.includes('bounce rate 4.0% exceeds threshold 3.0%')),
        '1.3: Reason specifies exact bounce rate (4.0%) and threshold (3.0%)'
      );

      // Verify Campaign status in database was auto-paused
      campaignInDb = await db.campaign.findUnique({ where: { id: campaign.id } });
      assertEqual(campaignInDb?.status, 'paused', '1.3: Campaign.status is auto-paused in DB');
      assert(
        Boolean(campaignInDb?.pausedReason?.startsWith('Circuit breaker triggered:')),
        '1.3: Campaign.pausedReason starts with "Circuit breaker triggered:"'
      );
      assert(
        Boolean(campaignInDb?.pausedReason?.includes('bounce rate 4.0% exceeds threshold 3.0%')),
        '1.3: Campaign.pausedReason contains exact bounce rate breach detail'
      );

      // Case 1.4: Custom Campaign Threshold Override (5.0%)
      const customCampaign = await db.campaign.create({
        data: {
          organizationId: org.id,
          name: 'Custom High Tolerance Campaign',
          status: 'running',
          maxDailySends: 50,
          bounceRatePauseThreshold: 0.05, // 5% custom threshold
        },
      });

      for (let i = 0; i < 100; i++) {
        await db.emailEvent.create({
          data: {
            organizationId: org.id,
            domainId: domain.id,
            campaignId: customCampaign.id,
            eventType: 'sent',
            recipient: `custom_${i}@example.com`,
          },
        });
      }
      for (let i = 0; i < 4; i++) {
        await db.emailEvent.create({
          data: {
            organizationId: org.id,
            domainId: domain.id,
            campaignId: customCampaign.id,
            eventType: 'bounced',
            recipient: `custom_${i}@example.com`,
          },
        });
      }

      // 4% bounce rate should NOT trigger 5% threshold
      let customCb = await checkCircuitBreaker({
        domainId: domain.id,
        campaignId: customCampaign.id,
        organizationId: org.id,
      });
      assertEqual(customCb.triggered, false, '1.4: 4.0% bounce does not trigger custom 5.0% threshold');

      // Add 2 more bounces -> 6.0% > 5.0%
      for (let i = 4; i < 6; i++) {
        await db.emailEvent.create({
          data: {
            organizationId: org.id,
            domainId: domain.id,
            campaignId: customCampaign.id,
            eventType: 'bounced',
            recipient: `custom_${i}@example.com`,
          },
        });
      }

      customCb = await checkCircuitBreaker({
        domainId: domain.id,
        campaignId: customCampaign.id,
        organizationId: org.id,
      });
      assertEqual(customCb.triggered, true, '1.4: 6.0% bounce triggers custom 5.0% threshold');
      const customInDb = await db.campaign.findUnique({ where: { id: customCampaign.id } });
      assertEqual(customInDb?.status, 'paused', '1.4: Custom campaign auto-paused in DB');
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 2: High Spam Complaints (> 0.1%) Domain Auto-Suspension
    // ═══════════════════════════════════════════════════════════
    section('2. High Spam Complaints Circuit Breaker (> 0.1%)');
    {
      const { org, domain, campaign } = await setupBaselineEnvironment('complaint');
      createdOrgIds.push(org.id);

      // Create 1000 sent events
      const sentRecords = Array.from({ length: 1000 }).map((_, i) => ({
        organizationId: org.id,
        domainId: domain.id,
        campaignId: campaign.id,
        eventType: 'sent',
        recipient: `user_${i}@example.com`,
      }));
      await createEmailEvents(sentRecords);

      // Case 2.1: 0 complaints -> pass
      let cbStatus = await checkCircuitBreaker({
        domainId: domain.id,
        campaignId: campaign.id,
        organizationId: org.id,
      });
      assertEqual(cbStatus.triggered, false, '2.1: 0 complaints returns pass');
      assertEqual(cbStatus.details.complaintExceeded, false, '2.1: complaintExceeded is false');

      let domainInDb = await db.sendingDomain.findUnique({ where: { id: domain.id } });
      assertEqual(domainInDb?.status, 'verified', '2.1: Domain remains verified');

      // Case 2.2: 2 complaints / 1000 = 0.2% > 0.1% threshold
      await db.emailEvent.create({
        data: {
          organizationId: org.id,
          domainId: domain.id,
          campaignId: campaign.id,
          eventType: 'complained',
          complaintType: 'abuse',
          recipient: 'user_1@example.com',
        },
      });
      await db.emailEvent.create({
        data: {
          organizationId: org.id,
          domainId: domain.id,
          campaignId: campaign.id,
          eventType: 'complained',
          complaintType: 'abuse',
          recipient: 'user_2@example.com',
        },
      });

      cbStatus = await checkCircuitBreaker({
        domainId: domain.id,
        campaignId: campaign.id,
        organizationId: org.id,
      });

      assertEqual(cbStatus.triggered, true, '2.2: 0.20% complaint rate triggers circuit breaker (> 0.10%)');
      assertEqual(cbStatus.status, 'block', '2.2: Status transitions to block');
      assertEqual(cbStatus.details.complaintExceeded, true, '2.2: details.complaintExceeded is true');
      assert(
        Boolean(cbStatus.reason?.includes('complaint rate 0.20% exceeds threshold 0.10%')),
        '2.2: Reason specifies exact complaint rate (0.20%) and threshold (0.10%)'
      );

      // Verify domain was auto-suspended in database
      domainInDb = await db.sendingDomain.findUnique({ where: { id: domain.id } });
      assertEqual(domainInDb?.status, 'suspended', '2.2: SendingDomain.status is auto-suspended in DB');

      // Case 2.3: Verify Send-Readiness Blocks All Sends On Suspended Domain
      const lead = await db.lead.create({
        data: {
          organizationId: org.id,
          name: 'Target Lead',
          email: 'target@example.com',
          status: 'approved',
        },
      });
      const sender = await db.senderAccount.findFirst({ where: { domainId: domain.id } });
      const msg = await db.outreachMessage.create({
        data: {
          organizationId: org.id,
          leadId: lead.id,
          campaignId: campaign.id,
          senderId: sender?.id,
          subject: 'Test Subject',
          body: 'Test Body',
          channel: 'email',
          status: 'approved',
          approvedAt: new Date(),
        },
      });

      const readiness = await evaluateSendReadiness({
        organizationId: org.id,
        messageId: msg.id,
        traceId: 'trace_suspended_domain_test',
      });

      assertEqual(readiness.ready, false, '2.3: Send readiness returns ready=false for suspended domain');
      const domainCheck = readiness.checks.find(c => c.id === 'domain_verified');
      assertEqual(domainCheck?.status, 'block', '2.3: domain_verified check returns status "block"');
      assert(
        Boolean(domainCheck?.reason?.includes('not verified: suspended')),
        '2.3: domain_verified reason clearly reports suspended domain'
      );

      // Assert assertReadyToSend throws
      let threw = false;
      try {
        await assertReadyToSend({
          organizationId: org.id,
          messageId: msg.id,
          traceId: 'trace_assert_suspended',
        });
      } catch (err: any) {
        threw = true;
        assert(
          Boolean(err.message.includes('suspended') || err.message.includes('verified')),
          '2.3: assertReadyToSend throws error referencing domain suspension'
        );
      }
      assertEqual(threw, true, '2.3: assertReadyToSend throws for suspended domain');
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 3: High Unsubscribe Rate (> 2.0%) Auto-Pause
    // ═══════════════════════════════════════════════════════════
    section('3. High Unsubscribe Rate Circuit Breaker (> 2.0%)');
    {
      const { org, domain, campaign } = await setupBaselineEnvironment('unsub');
      createdOrgIds.push(org.id);

      // Create 200 sent events
      const sentRecords = Array.from({ length: 200 }).map((_, i) => ({
        organizationId: org.id,
        domainId: domain.id,
        campaignId: campaign.id,
        eventType: 'sent',
        recipient: `unsub_lead_${i}@example.com`,
      }));
      await createEmailEvents(sentRecords);

      // Case 3.1: 2 unsubs / 200 = 1.0% < 2.0% -> pass
      await db.emailEvent.create({
        data: {
          organizationId: org.id,
          domainId: domain.id,
          campaignId: campaign.id,
          eventType: 'unsubscribed',
          recipient: 'unsub_lead_0@example.com',
        },
      });
      await db.emailEvent.create({
        data: {
          organizationId: org.id,
          domainId: domain.id,
          campaignId: campaign.id,
          eventType: 'unsubscribed',
          recipient: 'unsub_lead_1@example.com',
        },
      });

      let cbStatus = await checkCircuitBreaker({
        domainId: domain.id,
        campaignId: campaign.id,
        organizationId: org.id,
      });
      assertEqual(cbStatus.triggered, false, '3.1: 1.0% unsubscribe rate does not trigger block');
      assertEqual(cbStatus.details.unsubscribeExceeded, false, '3.1: unsubscribeExceeded is false');

      // Case 3.2: 5 unsubs / 200 = 2.5% > 2.0% -> triggers auto-pause
      for (let i = 2; i < 5; i++) {
        await db.emailEvent.create({
          data: {
            organizationId: org.id,
            domainId: domain.id,
            campaignId: campaign.id,
            eventType: 'unsubscribed',
            recipient: `unsub_lead_${i}@example.com`,
          },
        });
      }

      cbStatus = await checkCircuitBreaker({
        domainId: domain.id,
        campaignId: campaign.id,
        organizationId: org.id,
      });

      assertEqual(cbStatus.triggered, true, '3.2: 2.5% unsubscribe rate triggers circuit breaker (> 2.0%)');
      assertEqual(cbStatus.status, 'block', '3.2: Status is block');
      assertEqual(cbStatus.details.unsubscribeExceeded, true, '3.2: details.unsubscribeExceeded is true');
      assert(
        Boolean(cbStatus.reason?.includes('unsubscribe rate 2.5% exceeds threshold 2.0%')),
        '3.2: Reason specifies exact unsubscribe rate (2.5%) and threshold (2.0%)'
      );

      // Verify campaign auto-paused in DB
      const campaignInDb = await db.campaign.findUnique({ where: { id: campaign.id } });
      assertEqual(campaignInDb?.status, 'paused', '3.2: Campaign is auto-paused in DB on unsubscribe breach');
      assert(
        Boolean(campaignInDb?.pausedReason?.includes('unsubscribe rate 2.5% exceeds threshold 2.0%')),
        '3.2: Campaign.pausedReason records unsubscribe rate breach'
      );
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 4: Kill-Switch Responsiveness Within 1 Execution Cycle
    // ═══════════════════════════════════════════════════════════
    section('4. Kill-Switch Responsiveness Within 1 Execution Cycle');
    {
      const { org, domain, sender, campaign } = await setupBaselineEnvironment('killswitch');
      createdOrgIds.push(org.id);

      // Create test leads
      const leads: any[] = [];
      for (let i = 0; i < 5; i++) {
        leads.push(
          await db.lead.create({
            data: {
              organizationId: org.id,
              name: `KillSwitch Lead ${i}`,
              email: `ks_lead_${i}@example.com`,
              status: 'new',
              leadScore: 85,
            },
          })
        );
      }

      // Case 4.1: Normal cycle without kill-switch
      const engineActive = new AutonomousWorkflowEngine({ organizationId: org.id });
      const activeResult = await engineActive.runCycle();
      assert(activeResult.discovered > 0, '4.1: Autonomous engine discovers leads when kill-switch is inactive');

      // Case 4.2: Engage Autonomy Kill-Switch (autonomyPaused = true in userPreference)
      const user = await db.user.create({
        data: {
          email: `owner_${Date.now()}@example.com`,
          name: 'Workspace Owner',
        },
      });

      await db.userPreference.create({
        data: {
          userId: user.id,
          activeOrgId: org.id,
          autonomyPaused: true,
          pausedReason: 'Emergency compliance kill-switch triggered by administrator',
          pausedAt: new Date(),
        },
      });

      // Execute cycle immediately — must halt in cycle 1
      const engineHalted = new AutonomousWorkflowEngine({ organizationId: org.id });
      const haltedResult = await engineHalted.runCycle();

      assertEqual(haltedResult.discovered, 0, '4.2: 0 leads discovered within 1 cycle of kill-switch activation');
      assertEqual(haltedResult.enriched, 0, '4.2: 0 leads enriched within 1 cycle of kill-switch activation');
      assertEqual(haltedResult.scored, 0, '4.2: 0 leads scored within 1 cycle of kill-switch activation');
      assertEqual(haltedResult.drafted, 0, '4.2: 0 emails drafted within 1 cycle of kill-switch activation');
      assertEqual(haltedResult.scheduled, 0, '4.2: 0 sends scheduled within 1 cycle of kill-switch activation');

      // Case 4.3: Campaign Kill-Switch (Manual or automated Campaign pause)
      await db.campaign.update({
        where: { id: campaign.id },
        data: { status: 'paused', pausedReason: 'Manual operator kill-switch' },
      });

      const approvedMsg = await db.outreachMessage.create({
        data: {
          organizationId: org.id,
          leadId: leads[0].id,
          campaignId: campaign.id,
          senderId: sender.id,
          subject: 'Campaign Kill-Switch Test',
          body: 'Hello',
          channel: 'email',
          status: 'approved',
          approvedAt: new Date(),
        },
      });

      const readiness = await evaluateSendReadiness({
        organizationId: org.id,
        messageId: approvedMsg.id,
        traceId: 'trace_campaign_killswitch',
      });

      assertEqual(readiness.ready, false, '4.3: Paused campaign blocks send readiness in 1 cycle');
      const campaignCheck = readiness.checks.find(c => c.id === 'campaign_active');
      assertEqual(campaignCheck?.status, 'block', '4.3: campaign_active check returns block');
      assert(
        Boolean(campaignCheck?.reason?.includes('paused (Manual operator kill-switch)')),
        '4.3: Reason identifies manual kill-switch reason'
      );
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 5: Live Queue Preservation & Zero Dropped Messages
    // ═══════════════════════════════════════════════════════════
    section('5. Live Queue Preservation & Zero Dropped Messages');
    {
      const { org, domain, sender, campaign } = await setupBaselineEnvironment('preserve');
      createdOrgIds.push(org.id);

      // Create 10 approved messages and 10 queued jobs in DB
      const totalMessages = 10;
      const messageIds: string[] = [];
      const jobIds: string[] = [];

      for (let i = 0; i < totalMessages; i++) {
        const lead = await db.lead.create({
          data: {
            organizationId: org.id,
            name: `Preserve Lead ${i}`,
            email: `preserve_${i}_${Date.now()}@example.com`,
            status: 'approved',
          },
        });

        const msg = await db.outreachMessage.create({
          data: {
            organizationId: org.id,
            leadId: lead.id,
            campaignId: campaign.id,
            senderId: sender.id,
            subject: `Queue Preservation Message ${i}`,
            body: `Preserve body content for lead ${i}`,
            channel: 'email',
            status: 'approved',
            sequencePos: 0,
            approvedAt: new Date(),
            approvedBy: 'reviewer',
          },
        });
        messageIds.push(msg.id);

        const job = await db.jobQueue.create({
          data: {
            organizationId: org.id,
            queueName: 'send-email',
            type: 'send-email',
            status: 'pending',
            payload: JSON.stringify({
              messageId: msg.id,
              leadId: lead.id,
              campaignId: campaign.id,
              organizationId: org.id,
            }),
            leadId: lead.id,
            campaignId: campaign.id,
            traceId: `trace_preserve_${i}`,
          },
        });
        jobIds.push(job.id);
      }

      // Verify baseline counts
      const initialMsgCount = await db.outreachMessage.count({ where: { organizationId: org.id } });
      const initialJobCount = await db.jobQueue.count({ where: { organizationId: org.id } });
      assertEqual(initialMsgCount, totalMessages, '5.1: 10 outreach messages created in DB');
      assertEqual(initialJobCount, totalMessages, '5.1: 10 pending jobs created in JobQueue');

      // Trip the circuit breaker on this campaign (e.g. simulate high bounce rate)
      for (let i = 0; i < 100; i++) {
        await db.emailEvent.create({
          data: {
            organizationId: org.id,
            domainId: domain.id,
            campaignId: campaign.id,
            eventType: 'sent',
            recipient: `event_sent_${i}@example.com`,
          },
        });
      }
      for (let i = 0; i < 5; i++) {
        await db.emailEvent.create({
          data: {
            organizationId: org.id,
            domainId: domain.id,
            campaignId: campaign.id,
            eventType: 'bounced',
            recipient: `event_sent_${i}@example.com`,
          },
        });
      }

      const cbResult = await checkCircuitBreaker({
        domainId: domain.id,
        campaignId: campaign.id,
        organizationId: org.id,
      });
      assertEqual(cbResult.triggered, true, '5.2: Circuit breaker tripped');

      // CRITICAL CHECK: Verify 0 messages deleted or discarded in DB
      const postTripMsgCount = await db.outreachMessage.count({ where: { organizationId: org.id } });
      const postTripJobCount = await db.jobQueue.count({ where: { organizationId: org.id } });
      assertEqual(postTripMsgCount, totalMessages, '5.2: Exactly 10/10 messages preserved in DB (0 dropped)');
      assertEqual(postTripJobCount, totalMessages, '5.2: Exactly 10/10 jobs preserved in JobQueue (0 dropped)');

      // Case 5.3: Worker execution on tripped campaign transitions safely to 'blocked'
      // Execute worker job processor for the first job
      const workerResult: any = await processSendEmailJob({
        organizationId: org.id,
        messageId: messageIds[0],
        leadId: 'some_lead',
        traceId: 'trace_worker_preservation_test',
        dryRun: false,
        attempt: 1,
        createdAt: new Date().toISOString(),
      });

      assertEqual(workerResult.sent, false, '5.3: Worker does not send email when circuit breaker is active');
      assertEqual(workerResult.blocked, true, '5.3: Worker reports blocked=true');
      assert(
        Boolean(workerResult.blockedChecks?.some((c: any) => c.id === 'campaign_active' || c.id === 'risk_evaluation_circuit_breaker')),
        '5.3: Worker blockedChecks contains campaign_active or circuit breaker block'
      );

      // Verify message state in DB: status is 'blocked', message record is fully intact
      const blockedMsg = await db.outreachMessage.findUnique({ where: { id: messageIds[0] } });
      assertEqual(blockedMsg?.status, 'blocked', '5.3: Message transitions safely to status="blocked"');
      assertEqual(blockedMsg?.body, `Preserve body content for lead 0`, '5.3: Message content completely preserved');

      // Verify remaining queued messages are still intact in DB
      const remainingMsgCount = await db.outreachMessage.count({ where: { organizationId: org.id } });
      assertEqual(remainingMsgCount, totalMessages, '5.3: Zero messages dropped during worker defense execution');

      // Case 5.4: Recovery and Resumption without data loss
      // Fix deliverability / reset campaign status to 'running'
      await db.campaign.update({
        where: { id: campaign.id },
        data: { status: 'running', pausedReason: null },
      });

      // Clear the high bounce events or reset metrics
      await db.emailEvent.deleteMany({ where: { organizationId: org.id, eventType: 'bounced' } });

      // Unblock the message back to approved for resumption
      await db.outreachMessage.update({
        where: { id: messageIds[0] },
        data: { status: 'approved' },
      });

      // Check readiness again after resumption
      const recoveredReadiness = await evaluateSendReadiness({
        organizationId: org.id,
        messageId: messageIds[0],
        traceId: 'trace_resumed_test',
      });
      assertEqual(recoveredReadiness.ready, true, '5.4: Send readiness passes after campaign unpauses');

      // Worker executes dryRun send successfully
      const resumedWorkerResult: any = await processSendEmailJob({
        organizationId: org.id,
        messageId: messageIds[0],
        leadId: 'some_lead',
        traceId: 'trace_resumed_send',
        dryRun: true,
        attempt: 1,
        createdAt: new Date().toISOString(),
      });
      assertEqual(resumedWorkerResult.success, true, '5.4: Message successfully dispatched upon resumption');
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 6: Asynchronous Webhook Event Driven Circuit Breaker
    // ═══════════════════════════════════════════════════════════
    section('6. Asynchronous Webhook Event Driven Circuit Breaker');
    {
      const { org, domain, sender, campaign } = await setupBaselineEnvironment('webhook_cb');
      createdOrgIds.push(org.id);

      // Create 100 sent events
      const sentRecords = Array.from({ length: 100 }).map((_, i) => ({
        organizationId: org.id,
        domainId: domain.id,
        campaignId: campaign.id,
        eventType: 'sent',
        recipient: `webhook_lead_${i}@example.com`,
      }));
      await createEmailEvents(sentRecords);

      // Send 4 hard bounces sequentially via handleBounce
      for (let i = 0; i < 4; i++) {
        await handleBounce({
          organizationId: org.id,
          domainId: domain.id,
          campaignId: campaign.id,
          recipient: `webhook_lead_${i}@example.com`,
          bounceType: 'hard',
          bounceReason: '550 5.1.1 Recipient mailbox not found',
        });
      }

      // Verify handleBounce instantaneously triggered the circuit breaker
      const campaignInDb = await db.campaign.findUnique({ where: { id: campaign.id } });
      assertEqual(campaignInDb?.status, 'paused', '6.1: handleBounce automatically paused campaign in DB');
      assert(
        Boolean(campaignInDb?.pausedReason?.includes('Circuit breaker triggered:')),
        '6.1: handleBounce recorded pausedReason in Campaign'
      );

      // Test spam complaint via handleBounce
      const { org: orgComp, domain: domainComp, campaign: campComp } = await setupBaselineEnvironment('webhook_complaint');
      createdOrgIds.push(orgComp.id);

      // 1000 sent events
      const compSentRecords = Array.from({ length: 1000 }).map((_, i) => ({
        organizationId: orgComp.id,
        domainId: domainComp.id,
        campaignId: campComp.id,
        eventType: 'sent',
        recipient: `comp_lead_${i}@example.com`,
      }));
      await createEmailEvents(compSentRecords);

      // 2 spam complaints via handleBounce
      await handleBounce({
        organizationId: orgComp.id,
        domainId: domainComp.id,
        campaignId: campComp.id,
        recipient: 'comp_lead_0@example.com',
        bounceType: 'feedback',
        bounceReason: 'Spam complaint from user',
      });
      await handleBounce({
        organizationId: orgComp.id,
        domainId: domainComp.id,
        campaignId: campComp.id,
        recipient: 'comp_lead_1@example.com',
        bounceType: 'feedback',
        bounceReason: 'abuse report feedback loop',
      });

      const domainInDb = await db.sendingDomain.findUnique({ where: { id: domainComp.id } });
      assertEqual(domainInDb?.status, 'suspended', '6.2: handleBounce automatically suspended domain in DB');

      // Test unsubscribe via handleUnsubscribe
      const { org: orgUnsub, domain: domainUnsub, campaign: campUnsub } = await setupBaselineEnvironment('webhook_unsub');
      createdOrgIds.push(orgUnsub.id);

      // 100 sent events
      const unsubSentRecords = Array.from({ length: 100 }).map((_, i) => ({
        organizationId: orgUnsub.id,
        domainId: domainUnsub.id,
        campaignId: campUnsub.id,
        eventType: 'sent',
        recipient: `unsub_wh_${i}@example.com`,
      }));
      await createEmailEvents(unsubSentRecords);

      // 3 unsubscribes via handleUnsubscribe (3.0% > 2.0%)
      for (let i = 0; i < 3; i++) {
        await handleUnsubscribe({
          organizationId: orgUnsub.id,
          domainId: domainUnsub.id,
          campaignId: campUnsub.id,
          recipient: `unsub_wh_${i}@example.com`,
        });
      }

      const campUnsubInDb = await db.campaign.findUnique({ where: { id: campUnsub.id } });
      assertEqual(campUnsubInDb?.status, 'paused', '6.3: handleUnsubscribe automatically paused campaign in DB');
      assert(
        Boolean(campUnsubInDb?.pausedReason?.includes('unsubscribe rate') && campUnsubInDb?.pausedReason?.includes('exceeds threshold 2.0%')),
        '6.3: handleUnsubscribe recorded unsubscribe rate breach in pausedReason'
      );
    }

  } catch (error: any) {
    console.error('\n❌ Fatal error in circuit-breaker-killswitch suite:', error);
    failed++;
    failures.push(`Fatal error in circuit-breaker-killswitch suite: ${error?.message || String(error)}`);
  } finally {
    // Clean up created orgs
    for (const orgId of createdOrgIds) {
      await cleanTestData(orgId);
      await db.organization.delete({ where: { id: orgId } }).catch(() => {});
    }
  }

  // ═══════════════════════════════════════════════════════════
  // FINAL REPORT
  // ═══════════════════════════════════════════════════════════
  section('Circuit Breaker & Kill-Switch Suite Results');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);

  if (failed > 0 || failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  } else {
    console.log('\n🎉 ALL CIRCUIT BREAKER & KILL-SWITCH TESTS PASSED (100% Green)!');
    process.exit(0);
  }
}

runCircuitBreakerKillSwitchSuite().catch(err => {
  console.error('Test runner execution failed:', err);
  process.exit(1);
});
