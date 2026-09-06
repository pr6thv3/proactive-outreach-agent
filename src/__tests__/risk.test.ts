// Load environment variables before initializing db
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { db as dbClient } from '../lib/db';
const db = dbClient as any;
import { checkCircuitBreaker } from '../lib/risk/circuit-breaker';
import { evaluateRisk } from '../lib/risk/index';
import { evaluateSendReadiness } from '../lib/deliverability/send-readiness';
import { Lead, Campaign, OutreachEmail as OutreachMessage, SendingDomain } from '@prisma/client';
type SenderAccount = any;
type CampaignSenderPool = any;

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
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 60 - name.length))}`);
}

// Store original db methods for restoration
const originalFindFirstCampaign = db.campaign.findFirst;
const originalCountEmailEvent = db.emailEvent.count;
const originalFindFirstSendingDomain = db.sendingDomain.findFirst;
const originalFindFirstLead = db.lead.findFirst;
const originalFindFirstOutreachMessage = db.outreachMessage.findFirst;
const originalFindManyOutreachMessage = db.outreachMessage.findMany;
const originalFindManyCampaignSenderPool = db.campaignSenderPool.findMany;
const originalFindFirstSenderAccount = db.senderAccount.findFirst;
const originalFindManyReputationSnapshot = db.reputationSnapshot.findMany;
const originalUpdateCampaign = db.campaign.update;
const originalUpdateSendingDomain = db.sendingDomain.update;

function restoreMocks() {
  db.campaign.findFirst = originalFindFirstCampaign;
  db.emailEvent.count = originalCountEmailEvent;
  db.sendingDomain.findFirst = originalFindFirstSendingDomain;
  db.lead.findFirst = originalFindFirstLead;
  db.outreachMessage.findFirst = originalFindFirstOutreachMessage;
  db.outreachMessage.findMany = originalFindManyOutreachMessage;
  db.campaignSenderPool.findMany = originalFindManyCampaignSenderPool;
  db.senderAccount.findFirst = originalFindFirstSenderAccount;
  db.reputationSnapshot.findMany = originalFindManyReputationSnapshot;
  db.campaign.update = originalUpdateCampaign;
  db.sendingDomain.update = originalUpdateSendingDomain;
}

// Mock builders
const mockDomain = (overrides?: Partial<SendingDomain>): SendingDomain => ({
  id: 'domain_123',
  organizationId: 'org_123',
  domain: 'outreach.example.com',
  status: 'verified',
  provider: 'resend',
  spfRecord: null,
  spfStatus: 'verified',
  spfVerified: true,
  dkimRecord: null,
  dkimStatus: 'verified',
  dkimVerified: true,
  dmarcRecord: null,
  dmarcStatus: 'verified',
  dmarcVerified: true,
  warmupEnabled: false,
  warmupDay: 30,
  warmupDailyLimit: 250,
  dailyLimit: 250,
  dailySendsCount: 0,
  dailySendsDate: null,
  bounceRate: 0,
  complaintRate: 0,
  openRate: 0.5,
  clickRate: 0.1,
  reputationScore: 90,
  apiKeyRef: null,
  fromEmail: 'hello@outreach.example.com',
  fromName: 'Alex',
  replyTo: 'reply@example.com',
  verifiedAt: new Date(),
  lastVerifiedAt: new Date(),
  lastDnsCheckAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
}) as unknown as SendingDomain;

const mockCampaign = (overrides?: Partial<Campaign>): Campaign => ({
  id: 'campaign_123',
  organizationId: 'org_123',
  name: 'SaaS User Acquisition',
  status: 'running',
  goal: 'Demo booking',
  targetAudience: 'CTOs',
  offer: 'Free trial',
  senderName: 'Alex',
  senderEmail: 'hello@outreach.example.com',
  tone: 'professional',
  cta: 'Book trial',
  maxDailySends: 50,
  followUpSchedule: '[3, 7]',
  productDescription: 'Awesome Tool',
  dailySendsCount: 0,
  dailySendsDate: null,
  channels: '["email"]',
  linkedinEnabled: false,
  twitterEnabled: false,
  smsEnabled: false,
  contactFormEnabled: false,
  autoApprovalEnabled: false,
  spamRiskThreshold: 0.25,
  bounceRatePauseThreshold: 0.03,
  complaintRatePauseThreshold: 0.001,
  unsubscribeRatePauseThreshold: 0.02,
  pausedReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
} as Campaign);

const mockLead = (overrides?: Partial<Lead>): Lead => ({
  id: 'lead_123',
  organizationId: 'org_123',
  name: 'John CTO',
  email: 'john@example.com',
  company: 'Target Corp',
  title: 'CTO',
  url: 'target.com',
  linkedinUrl: null,
  status: 'new',
  source: 'manual',
  emailVerified: true,
  isBlacklisted: false,
  doNotContact: false,
  lastContacted: null,
  leadScore: 80,
  signalScore: 80,
  replyProb: 0.4,
  conversionProb: 0.2,
  spamRisk: 0.05,
  priorityTier: 'hot',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
}) as unknown as Lead;

const mockMessage = (overrides?: Partial<OutreachMessage>): OutreachMessage => ({
  id: 'msg_123',
  organizationId: 'org_123',
  subject: 'Increase your engineering speed',
  body: 'Hi, we can double your velocity.',
  channel: 'email',
  status: 'approved',
  strategy: 'signal-led',
  angle: 'growth',
  tone: 'professional',
  cta: 'Book chat',
  sequencePos: 0,
  signalTypeUsed: 'funding_round',
  urgencyAtGeneration: 0.8,
  pitchAngleUsed: 'velocity',
  leadId: 'lead_123',
  campaignId: 'campaign_123',
  senderId: 'sender_123',
  approvedBy: 'admin',
  approvedAt: new Date(),
  scheduledAt: null,
  sentAt: null,
  unsubFooter: 'Unsubscribe here',
  deliveredAt: null,
  bouncedAt: null,
  bounceReason: null,
  openedAt: null,
  clickedAt: null,
  repliedAt: null,
  variationId: null,
  variationSeed: null,
  originalBody: null,
  finalBody: null,
  variationMetadata: null,
  evidenceSnapshot: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
}) as unknown as OutreachMessage;

const mockSender = (overrides?: Partial<SenderAccount>): SenderAccount => ({
  id: 'sender_123',
  organizationId: 'org_123',
  domainId: 'domain_123',
  email: 'hello@outreach.example.com',
  name: 'Alex',
  replyTo: 'reply@example.com',
  provider: 'resend',
  status: 'active',
  dailyLimit: 25,
  sentToday: 0,
  sentTodayDate: null,
  warmupStage: 0,
  reputationScore: 90,
  lastSentAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// Run Tests
async function runTests() {
  try {
    section('1. Deliverability Circuit Breaker Policy');
    
    // Set default mocks for queries that fallback during testing
    db.outreachMessage.findMany = async () => [];
    db.campaignSenderPool.findMany = async () => [];
    db.senderAccount.findFirst = async () => mockSender();
    db.sendingDomain.findFirst = async () => mockDomain();
    db.lead.findFirst = async () => mockLead();
    db.campaign.findFirst = async () => mockCampaign();
    db.outreachMessage.findFirst = async () => mockMessage();
    db.emailEvent.count = async () => 0;

    // Case 1: Healthy metrics
    db.campaign.findFirst = async () => mockCampaign();
    db.sendingDomain.findFirst = async () => mockDomain();
    db.reputationSnapshot.findMany = async () => [];
    db.emailEvent.count = async (args: any) => {
      if (args.where.eventType === 'sent') return 100;
      return 0; // 0 bounces, 0 complaints, 0 unsubscribes
    };

    let cb = await checkCircuitBreaker({ domainId: 'domain_123', campaignId: 'campaign_123', organizationId: 'org_123' });
    assertEqual(cb.triggered, false, 'Circuit breaker should not trigger for healthy metrics');
    assertEqual(cb.status, 'pass', 'Circuit breaker status should be pass');

    // Case 2: Warning Threshold Exceeded (Bounce rate 2.5%, default campaign threshold is 3%)
    db.emailEvent.count = async (args: any) => {
      if (args.where.eventType === 'sent') return 1000;
      if (args.where.eventType === 'bounced') return 25; // 2.5%
      return 0;
    };
    cb = await checkCircuitBreaker({ domainId: 'domain_123', campaignId: 'campaign_123', organizationId: 'org_123' });
    assertEqual(cb.triggered, false, 'Warning threshold should not trigger block');
    assertEqual(cb.status, 'warn', 'Warning threshold should return status warn');
    assert(cb.reason?.includes('bounce rate 2.5% is elevated') || false, 'Warning reason should mention bounce rate');

    // Case 3: Block/Pause Threshold Exceeded (Bounce rate 4%)
    db.emailEvent.count = async (args: any) => {
      if (args.where.eventType === 'sent') return 1000;
      if (args.where.eventType === 'bounced') return 40; // 4.0%
      return 0;
    };
    let campaignUpdated = false;
    db.campaign.update = async (args: any) => {
      campaignUpdated = true;
      assertEqual(args.data.status, 'paused', 'Campaign should be set to paused status');
      return mockCampaign();
    };
    cb = await checkCircuitBreaker({ domainId: 'domain_123', campaignId: 'campaign_123', organizationId: 'org_123' });
    assertEqual(cb.triggered, true, 'Block threshold must trigger circuit breaker');
    assertEqual(cb.status, 'block', 'Circuit breaker status should be block');
    assertEqual(campaignUpdated, true, 'Campaign auto-pause should trigger');

    // Case 4: Complaint Rate Exceeded (Complaint rate 0.2% vs threshold 0.1%)
    db.campaign.update = async () => mockCampaign();
    db.emailEvent.count = async (args: any) => {
      if (args.where.eventType === 'sent') return 1000;
      if (args.where.eventType === 'complained') return 2; // 0.2%
      return 0;
    };
    let domainUpdated = false;
    db.sendingDomain.update = async (args: any) => {
      domainUpdated = true;
      assertEqual(args.data.status, 'suspended', 'Domain should be suspended');
      return mockDomain();
    };
    cb = await checkCircuitBreaker({ domainId: 'domain_123', campaignId: 'campaign_123', organizationId: 'org_123' });
    assertEqual(cb.triggered, true, 'High complaint rate must trigger circuit breaker');
    assertEqual(domainUpdated, true, 'Domain auto-suspension should trigger');

    section('2. Strategy-Level Risk Check');

    // Case 1: Healthy Lead and Message
    db.lead.findFirst = async () => mockLead();
    db.outreachMessage.findFirst = async () => mockMessage();
    db.campaign.findFirst = async () => mockCampaign();
    db.emailEvent.count = async () => 0;

    let risk = await evaluateRisk({ domainId: 'domain_123', campaignId: 'campaign_123', organizationId: 'org_123', leadId: 'lead_123', messageId: 'msg_123' });
    assertEqual(risk.checks.strategyRisk.status, 'pass', 'Strategy risk passes for normal scores');

    // Case 2: Lead has high spam risk
    db.lead.findFirst = async () => mockLead({ spamRisk: 0.3 });
    risk = await evaluateRisk({ domainId: 'domain_123', campaignId: 'campaign_123', organizationId: 'org_123', leadId: 'lead_123', messageId: 'msg_123' });
    assertEqual(risk.checks.strategyRisk.status, 'block', 'High lead spam risk triggers block');
    assert(risk.remediationSteps.some(s => s.includes('Review the lead profile')), 'Remediation list should suggest reviewing the lead profile');

    // Case 3: Message has spam trigger words
    db.lead.findFirst = async () => mockLead({ spamRisk: 0.05 });
    db.outreachMessage.findFirst = async () => mockMessage({ body: 'Win a free gift today!' });
    risk = await evaluateRisk({ domainId: 'domain_123', campaignId: 'campaign_123', organizationId: 'org_123', leadId: 'lead_123', messageId: 'msg_123' });
    assertEqual(risk.checks.strategyRisk.status, 'block', 'Spam trigger words trigger block');
    assert(risk.remediationSteps.some(s => s.includes('Remove high-frequency promotional keywords')), 'Remediation should suggest removing promotional keywords');

    section('3. Campaign Budget and Pacing Check');

    // Case 1: Daily quota reached
    db.lead.findFirst = async () => mockLead();
    db.outreachMessage.findFirst = async () => mockMessage();
    db.campaign.findFirst = async () => mockCampaign({ dailySendsCount: 50, maxDailySends: 50, dailySendsDate: new Date().toISOString().split('T')[0] as any });
    db.emailEvent.count = async () => 0;

    risk = await evaluateRisk({ domainId: 'domain_123', campaignId: 'campaign_123', organizationId: 'org_123', leadId: 'lead_123', messageId: 'msg_123' });
    assertEqual(risk.checks.pacingAndBudget.status, 'block', 'Reaching daily limit triggers block');
    assert(risk.checks.pacingAndBudget.reason?.includes('daily budget limit reached') || false, 'Pacing reason should mention daily limit');

    // Case 2: Pacing warning (hourly limit exceeded)
    db.campaign.findFirst = async () => mockCampaign({ dailySendsCount: 5, maxDailySends: 80, dailySendsDate: new Date().toISOString().split('T')[0] as any });
    db.emailEvent.count = async (args: any) => {
      // Return 20 sends in the last hour
      if (args.where.createdAt) return 20; // Pacing limit is Math.max(10, 80/8) = 10
      return 5;
    };
    risk = await evaluateRisk({ domainId: 'domain_123', campaignId: 'campaign_123', organizationId: 'org_123', leadId: 'lead_123', messageId: 'msg_123' });
    assertEqual(risk.checks.pacingAndBudget.status, 'warn', 'Exceeding hourly pacing triggers warning');

    section('4. Sender Pool Health Check');

    // Case 1: Pool sender unhealthy, healthy alternative available
    db.campaign.findFirst = async () => mockCampaign();
    db.senderAccount.findFirst = async () => mockSender({ status: 'unhealthy' }); // Current selected sender is unhealthy
    db.emailEvent.count = async () => 0;

    const mockPoolWithAlternative = [
      {
        campaignId: 'campaign_123',
        senderId: 'sender_123',
        domainId: 'domain_123',
        enabled: true,
        sender: mockSender({ id: 'sender_123', status: 'unhealthy' }),
      },
      {
        campaignId: 'campaign_123',
        senderId: 'sender_456',
        domainId: 'domain_456',
        enabled: true,
        sender: mockSender({ id: 'sender_456', email: 'fallback@example.com', status: 'active', reputationScore: 95 }),
      },
    ];
    db.campaignSenderPool.findMany = async () => mockPoolWithAlternative as any;

    risk = await evaluateRisk({ domainId: 'domain_123', campaignId: 'campaign_123', organizationId: 'org_123', leadId: 'lead_123', messageId: 'msg_123', senderId: 'sender_123' });
    assertEqual(risk.checks.senderPoolHealth.status, 'warn', 'Unhealthy sender with healthy alternative returns warning');
    assertEqual(risk.checks.senderPoolHealth.details?.suggestedSenderId, 'sender_456', 'Pool health evaluation suggests healthy sender');

    // Case 2: Pool sender unhealthy, no alternative
    db.campaignSenderPool.findMany = async () => [mockPoolWithAlternative[0]] as any;
    risk = await evaluateRisk({ domainId: 'domain_123', campaignId: 'campaign_123', organizationId: 'org_123', leadId: 'lead_123', messageId: 'msg_123', senderId: 'sender_123' });
    assertEqual(risk.checks.senderPoolHealth.status, 'block', 'Unhealthy sender with no healthy alternatives triggers block');

    section('5. evaluateSendReadiness Pipeline Integration');
    db.campaign.findFirst = async () => mockCampaign();
    db.sendingDomain.findFirst = async () => mockDomain();
    db.senderAccount.findFirst = async () => ({ ...mockSender(), domain: mockDomain() } as any);
    db.senderAccount.findMany = async () => [{ ...mockSender(), domain: mockDomain() } as any];
    db.campaignSenderPool.findMany = async () => [];
    db.outreachMessage.findFirst = async () => mockMessage({ lead: mockLead() } as any);
    db.emailEvent.count = async () => 0;

    const readinessResult = await evaluateSendReadiness({ organizationId: 'org_123', messageId: 'msg_123', traceId: 'trace_testing' });
    const hasRiskChecks = readinessResult.checks.some(c => c.id.startsWith('risk_evaluation_'));
    assertEqual(hasRiskChecks, true, 'Readiness result checklist includes risk evaluation metrics');

  } catch (error) {
    console.error('Test execution failed:', error);
    failed++;
  } finally {
    restoreMocks();
  }

  // Log final stats
  section('Test Suite Summary');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  } else {
    console.log('\nAll tests completed successfully! 🎉');
    process.exit(0);
  }
}

runTests();
