// ─── Strategy Engine Tests ──────────────────────────────
// Validates outreach strategies, selector, and cooldowns
// Run with: npx tsx src/__tests__/strategy.test.ts

import {
  isEntryConditionMet,
  isExitConditionMet,
  selectBestStrategy,
  rankStrategies,
  checkOverallLeadCooldown,
  checkStrategyCooldown,
  matchesPersonaPattern,
} from '../lib/strategy/index';
import { StrategyContext } from '../lib/strategy/types';
import { Lead, Signal, OutreachMessage, ReplyClassification, AgentMemory } from '@prisma/client';

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

// Mock Helper functions to satisfy Prisma type constraints
const createMockLead = (overrides?: Partial<Lead>): Lead => ({
  id: 'lead_123',
  organizationId: 'org_123',
  name: 'John Doe',
  email: 'john@example.com',
  company: 'Example Corp',
  title: 'VP Engineering',
  url: 'https://example.com',
  linkedinUrl: null,
  status: 'new',
  source: 'manual',
  emailVerified: true,
  isBlacklisted: false,
  doNotContact: false,
  lastContacted: null,
  notes: null,
  leadScore: 75,
  signalScore: 80,
  replyProb: 0.5,
  conversionProb: 0.1,
  spamRisk: 0.05,
  priorityTier: 'hot',
  nextActionAt: null,
  autonomyEnabled: false,
  lastAutonomousRun: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const createMockSignal = (overrides?: Partial<Signal>): Signal => ({
  id: 'sig_123',
  organizationId: 'org_123',
  type: 'funding_round',
  content: 'Example growth info',
  source: 'web_scraper',
  relevance: 0.8,
  confidence: 0.9,
  rawSnippet: null,
  sourceUrl: null,
  sourceTitle: null,
  urgency: 0.8,
  reasoning: 'timely',
  recommendedPitchAngle: 'scale',
  recommendedOffer: 'demo',
  decayRate: 0.02,
  detectedAt: new Date(),
  expiresAt: null,
  leadId: 'lead_123',
  createdAt: new Date(),
  ...overrides,
});

// Run Tests
section('1. Persona Pattern Matcher');
assertEqual(matchesPersonaPattern('VP of Engineering'), true, 'VP matches persona');
assertEqual(matchesPersonaPattern('CTO'), true, 'CTO matches persona');
assertEqual(matchesPersonaPattern('Junior Engineer'), false, 'Junior Engineer does not match persona');

section('2. Cooldown Checks');
const recentlyContactedLead = createMockLead({ lastContacted: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) });
assertEqual(checkOverallLeadCooldown(recentlyContactedLead, 3).onCooldown, true, 'Lead contacted 1 day ago is on overall cooldown');
assertEqual(checkOverallLeadCooldown(createMockLead(), 3).onCooldown, false, 'Lead never contacted is not on cooldown');

const recentMsg = {
  id: 'msg_1',
  organizationId: 'org_123',
  subject: 'hello',
  body: 'body',
  channel: 'email',
  status: 'sent',
  strategy: 'funding-growth',
  angle: 'growth',
  tone: 'professional',
  cta: 'chat',
  sequencePos: 0,
  signalTypeUsed: 'funding_round',
  urgencyAtGeneration: 0.8,
  pitchAngleUsed: 'growth',
  leadId: 'lead_123',
  campaignId: 'camp_123',
  senderId: 'send_123',
  approvedBy: null,
  approvedAt: null,
  scheduledAt: null,
  sentAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
  unsubFooter: null,
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
  createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
  updatedAt: new Date(),
} as OutreachMessage;

assertEqual(
  checkStrategyCooldown('funding-growth', [recentMsg], 30).onCooldown,
  true,
  'Strategy executed 5 days ago is on strategy cooldown'
);
assertEqual(
  checkStrategyCooldown('hiring-spike', [recentMsg], 30).onCooldown,
  false,
  'Unexecuted strategy is not on strategy cooldown'
);

section('3. Strategy Entry and Exit Conditions');
// Test funding-growth entry
const fundingSignal = createMockSignal({ type: 'funding_round', detectedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) });
const contextForFunding: StrategyContext = {
  lead: createMockLead(),
  signals: [fundingSignal],
};
assertEqual(isEntryConditionMet('funding-growth', contextForFunding), true, 'Entry condition met for funding-growth with active signal');

const oldFundingSignal = createMockSignal({ type: 'funding_round', detectedAt: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000) });
const contextForOldFunding: StrategyContext = {
  lead: createMockLead(),
  signals: [oldFundingSignal],
};
assertEqual(isEntryConditionMet('funding-growth', contextForOldFunding), false, 'Entry condition NOT met for funding-growth with signal > 45 days old');

// Test exit conditions
const repliedLeadForFunding = createMockLead({ status: 'replied' });
const contextForExitFunding: StrategyContext = {
  lead: repliedLeadForFunding,
  signals: [fundingSignal],
};
assertEqual(isExitConditionMet('funding-growth', contextForExitFunding), true, 'Exit condition met for funding-growth when lead replies');

section('4. Strategy Scoring & Selector');
const memory1 = {
  id: 'mem_1',
  organizationId: 'org_123',
  category: 'reply_rate',
  key: 'funding-growth',
  value: '{}',
  score: 0.9,
  sampleSize: 10,
  industry: 'SaaS',
  persona: 'VP Engineering',
  channel: 'email',
  lastUsedAt: new Date(),
  useCount: 10,
  successCount: 9,
  failCount: 1,
  leadId: null,
  campaignId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as AgentMemory;

const selectorContext: StrategyContext = {
  lead: createMockLead({ leadScore: 90 }),
  signals: [fundingSignal],
  memories: [memory1],
};

const ranked = rankStrategies(selectorContext);
assert(ranked.length > 0, 'Ranked recommendations contains entries');
assertEqual(ranked[0].strategy, 'funding-growth', 'Top ranked strategy is funding-growth');

// Confidence = SignalConfidence * 0.4 + LeadFit * 0.3 + MemoryPerformance * 0.3
// SignalConfidence = 0.9
// LeadFit = 0.9
// MemoryPerformance = 0.9
// Expected Confidence = 0.9 * 0.4 + 0.9 * 0.3 + 0.9 * 0.3 = 0.9
assert(Math.abs(ranked[0].confidence - 0.9) < 0.0001, `Scoring formula calculates correct confidence: ${ranked[0].confidence}`);

console.log('\n' + '═'.repeat(64));
console.log(`Strategy results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('═'.repeat(64));

if (failures.length > 0) {
  console.log('\nFailed tests:');
  for (const f of failures) {
    console.log(`  ❌ ${f}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
