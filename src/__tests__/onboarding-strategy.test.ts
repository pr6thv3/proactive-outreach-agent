// ─── Milestone 1 (R1): Onboarding & Conversational Strategy Tests ─────────────
// Validates:
// 1. Natural Language Campaign Goal Translation (Industries, Sizes, Signals, Personas, 4-Step Sequence)
// 2. ICP Criteria API contracts & JSON dual-compatibility
// 3. Onboarding Wizard Step progression & State persistence
// 4. Onboarding Complete & 1-Click Campaign Launch
//
// Run with:
//   cross-env SQLITE_DATABASE_URL=file:./dev.db AUTH_DEV_BYPASS=true tsx src/__tests__/onboarding-strategy.test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server';
import { db } from '../lib/db';
import { translateGoalToStrategy } from '../lib/agents/think/goal-translator';
import { GET as getIcp, POST as postIcp } from '../app/api/icp/route';
import { POST as postTranslate } from '../app/api/icp/translate/route';
import { GET as getStep, POST as postStep } from '../app/api/onboarding/step/route';
import { POST as postComplete } from '../app/api/onboarding/complete/route';
import { GET as getState } from '../app/api/onboarding/state/route';
import { POST as postCampaign, GET as getCampaigns } from '../app/api/campaigns/route';

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
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 68 - name.length))}`);
}

async function runOnboardingStrategySuite() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║   MILESTONE 1 (R1): ONBOARDING & CONVERSATIONAL STRATEGY SUITE       ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  // Setup test organization and user
  const org = await db.organization.upsert({
    where: { workspaceKey: 'dev_workspace' },
    update: { name: 'M1 Test Org' },
    create: { workspaceKey: 'dev_workspace', name: 'M1 Test Org' },
  });

  const user = await db.user.upsert({
    where: { email: 'm1_tester@prospect.com' },
    update: {},
    create: { email: 'm1_tester@prospect.com', name: 'M1 Tester' },
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1: GOAL TRANSLATOR NLP PARSING TESTS
  // ═══════════════════════════════════════════════════════════════════════════
  section('1. Conversational Goal Translation — Core Scenarios');

  // Scenario 1.1: Fintech + Cybersecurity + CTOs (50-500 employees)
  const prompt1 = 'Find US fintechs with 50-500 employees hiring cybersecurity leaders and reach out to CTOs';
  const result1 = translateGoalToStrategy({
    goalPrompt: prompt1,
    valueProposition: 'Automated compliance and threat mitigation infrastructure.',
  });

  assert(result1.icpCriteria.industries.includes('Fintech'), 'Scenario 1.1: Detects Fintech industry');
  assert(result1.icpCriteria.industries.includes('Cybersecurity'), 'Scenario 1.1: Detects Cybersecurity industry');
  assertEqual(result1.icpCriteria.companySizeMin, 50, 'Scenario 1.1: Company size min is 50');
  assertEqual(result1.icpCriteria.companySizeMax, 500, 'Scenario 1.1: Company size max is 500');
  assert(result1.icpCriteria.requiredSignals.includes('hiring_spike'), 'Scenario 1.1: Detects hiring_spike signal');
  assert(result1.icpCriteria.requiredSignals.includes('executive_hire'), 'Scenario 1.1: Detects executive_hire signal');
  assert(result1.personas.some(p => p.title.includes('CTO') || p.department === 'Engineering'), 'Scenario 1.1: Identifies CTO persona');
  assertEqual(result1.sequenceSteps.length, 4, 'Scenario 1.1: Generates 4-step sequence');
  assertEqual(result1.sequenceSteps[0].delayDays, 0, 'Scenario 1.1: Step 1 delay is 0 days');
  assertEqual(result1.sequenceSteps[1].delayDays, 3, 'Scenario 1.1: Step 2 delay is 3 days');
  assertEqual(result1.sequenceSteps[2].delayDays, 7, 'Scenario 1.1: Step 3 delay is 7 days');
  assertEqual(result1.sequenceSteps[3].delayDays, 12, 'Scenario 1.1: Step 4 delay is 12 days');
  assert(result1.confidence >= 0.85, `Scenario 1.1: High confidence score (${result1.confidence})`);

  // Scenario 1.2: B2B SaaS + Europe + AWS + Snowflake + VP Sales + Customer Churn
  const prompt2 = 'Target Series A B2B SaaS companies in Europe using AWS seeking to reduce customer churn, reaching out to VPs of Sales';
  const result2 = translateGoalToStrategy({
    goalPrompt: prompt2,
    valueProposition: 'Predictive churn intelligence and pipeline acceleration.',
  });

  assert(result2.icpCriteria.industries.includes('B2B SaaS'), 'Scenario 1.2: Detects B2B SaaS industry');
  assert(result2.icpCriteria.techStack.includes('AWS'), 'Scenario 1.2: Detects AWS in techStack');
  assert(Boolean(result2.icpCriteria.geography?.some(g => g.includes('Europe') || g.includes('United Kingdom'))), 'Scenario 1.2: Detects European geography');
  assert(result2.personas.some(p => p.title.includes('Sales') || p.department === 'Sales'), 'Scenario 1.2: Identifies VP of Sales persona');
  assert(result2.icpCriteria.painPoints.some(pp => pp.toLowerCase().includes('churn') || pp.toLowerCase().includes('pipeline')), 'Scenario 1.2: Extracts churn / pipeline pain points');

  // Scenario 1.3: Healthcare Enterprises 500+ employees + CISOs + HIPAA
  const prompt3 = 'Target Healthcare enterprises with 500+ employees dealing with HIPAA compliance and pitch CISOs';
  const result3 = translateGoalToStrategy({
    goalPrompt: prompt3,
  });

  assert(result3.icpCriteria.industries.includes('Healthcare & HealthTech'), 'Scenario 1.3: Detects Healthcare industry');
  assert(result3.icpCriteria.companySizeMin >= 500, `Scenario 1.3: Enterprise size min >= 500 (actual: ${result3.icpCriteria.companySizeMin})`);
  assert(result3.personas.some(p => p.title.includes('CISO') || p.department === 'Security'), 'Scenario 1.3: Identifies CISO persona');
  assert(result3.icpCriteria.painPoints.some(pp => pp.toLowerCase().includes('hipaa') || pp.toLowerCase().includes('compliance')), 'Scenario 1.3: Includes HIPAA / compliance pain point');

  // Scenario 1.4: E-commerce brands (20-200 people) hiring SDRs + Founders
  const prompt4 = 'Find high-growth E-commerce brands (20-200 people) hiring SDRs and reach out to Founders';
  const result4 = translateGoalToStrategy({
    goalPrompt: prompt4,
  });

  assert(result4.icpCriteria.industries.includes('E-commerce & Retail'), 'Scenario 1.4: Detects E-commerce industry');
  assertEqual(result4.icpCriteria.companySizeMin, 20, 'Scenario 1.4: Size min is 20');
  assertEqual(result4.icpCriteria.companySizeMax, 200, 'Scenario 1.4: Size max is 200');
  assert(result4.personas.some(p => p.seniority === 'Founder' || p.title.includes('Founder') || p.title.includes('CEO')), 'Scenario 1.4: Identifies Founder persona');

  // Scenario 1.5: Fallback & Edge Cases
  const emptyResult = translateGoalToStrategy({ goalPrompt: '' });
  assert(emptyResult.icpCriteria.industries.length > 0, 'Scenario 1.5: Empty prompt falls back to default industries');
  assertEqual(emptyResult.sequenceSteps.length, 4, 'Scenario 1.5: Empty prompt produces default 4-step sequence');

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: API ROUTE TESTS (ICP TRANSLATE, ICP CRUD, ONBOARDING STEPS)
  // ═══════════════════════════════════════════════════════════════════════════
  section('2. API Endpoints — ICP & Onboarding Routes');

  // 2.1 POST /api/icp/translate
  const translateReq = new NextRequest('http://localhost:3000/api/icp/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      goalPrompt: 'Find US fintechs with 50-500 employees hiring cybersecurity leaders and reach out to CTOs',
    }),
  });
  const translateRes = await postTranslate(translateReq);
  assertEqual(translateRes.status, 200, 'POST /api/icp/translate returns 200 OK');
  const translateJson = await translateRes.json();
  assert(translateJson.success, 'Translation API response success = true');
  assert(translateJson.data.icpCriteria.industries.includes('Fintech'), 'API response contains parsed Fintech industry');
  assertEqual(translateJson.data.sequenceSteps.length, 4, 'API response contains 4-step sequence');

  // 2.2 POST /api/icp (Save structured criteria)
  const saveIcpReq = new NextRequest('http://localhost:3000/api/icp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      industries: ['Fintech', 'Cybersecurity'],
      companySizeMin: 50,
      companySizeMax: 500,
      techStack: ['AWS', 'Kubernetes', 'Snowflake'],
      excludeTechStack: ['Legacy On-Prem'],
      requiredSignals: ['hiring_spike', 'executive_hire'],
      minSignalScore: 65,
      valueProp: 'Automated signal-grounded outreach',
      painPoints: ['Compliance overhead', 'Developer velocity'],
    }),
  });
  const saveIcpRes = await postIcp(saveIcpReq);
  assertEqual(saveIcpRes.status, 200, 'POST /api/icp returns 200 OK');

  // 2.3 GET /api/icp (Verify structured response format)
  const getIcpReq = new NextRequest('http://localhost:3000/api/icp');
  const getIcpRes = await getIcp(getIcpReq);
  assertEqual(getIcpRes.status, 200, 'GET /api/icp returns 200 OK');
  const getIcpJson = await getIcpRes.json();
  assert(Array.isArray(getIcpJson.data.industries), 'GET /api/icp returns industries as Array');
  assert(getIcpJson.data.industries.includes('Fintech'), 'GET /api/icp includes Fintech');
  assert(Array.isArray(getIcpJson.data.techStack), 'GET /api/icp returns techStack as Array');
  assertEqual(getIcpJson.data.companySizeMin, 50, 'GET /api/icp companySizeMin is 50');
  assertEqual(getIcpJson.data.companySizeMax, 500, 'GET /api/icp companySizeMax is 500');

  // 2.4 POST /api/onboarding/step & GET /api/onboarding/step
  const postStepReq = new NextRequest('http://localhost:3000/api/onboarding/step', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step: 3 }),
  });
  const postStepRes = await postStep(postStepReq);
  assertEqual(postStepRes.status, 200, 'POST /api/onboarding/step returns 200 OK');
  const postStepJson = await postStepRes.json();
  assertEqual(postStepJson.data.onboardingStep, 3, 'Onboarding step updated to 3');

  const getStepReq = new NextRequest('http://localhost:3000/api/onboarding/step');
  const getStepRes = await getStep(getStepReq);
  const getStepJson = await getStepRes.json();
  assertEqual(getStepJson.data.onboardingStep, 3, 'GET /api/onboarding/step retrieves step 3');

  // 2.5 GET /api/onboarding/state (Full wizard state payload)
  const getStateReq = new NextRequest('http://localhost:3000/api/onboarding/state');
  const getStateRes = await getState(getStateReq);
  assertEqual(getStateRes.status, 200, 'GET /api/onboarding/state returns 200 OK');
  const getStateJson = await getStateRes.json();
  assertEqual(getStateJson.data.step, 3, 'Onboarding state reflects current step 3');
  assert(!!getStateJson.data.icp, 'Onboarding state includes saved ICP');
  assert(getStateJson.data.icp.industries.includes('Fintech'), 'Onboarding state ICP contains Fintech');

  // 2.6 POST /api/onboarding/complete (Launch initial campaign & complete onboarding)
  const completeReq = new NextRequest('http://localhost:3000/api/onboarding/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dailySendLimit: 75,
      minLeadScore: 65,
      autonomyEnabled: true,
      campaignName: 'M1 Automated Launch Campaign',
      goal: 'Find US fintechs and book CTO discovery calls',
      targetAudience: 'Fintech & Cybersecurity CTOs (50-500 emp)',
      offer: 'Signal-grounded outreach demo',
      senderName: 'Alex Vance',
      senderEmail: 'alex@outreach.acmesaas.com',
      sequenceSteps: [
        { step: 1, delayDays: 0, type: 'initial', template: 'Pain-Point Intro', subject: 'Hello' },
        { step: 2, delayDays: 3, type: 'followup_1', template: 'Quick Bump', subject: 'Re: Hello' },
        { step: 3, delayDays: 7, type: 'followup_2', template: 'Case Study', subject: 'Case Study' },
        { step: 4, delayDays: 12, type: 'breakup', template: 'Breakup', subject: 'Permission to close file?' },
      ],
    }),
  });
  const completeRes = await postComplete(completeReq);
  assertEqual(completeRes.status, 200, 'POST /api/onboarding/complete returns 200 OK');
  const completeJson = await completeRes.json();
  assertEqual(completeJson.data.onboardingComplete, true, 'onboardingComplete is true');
  assert(!!completeJson.data.campaignId, 'Initial campaign created during onboarding completion');

  // Verify created campaign in DB
  const createdCamp = await db.campaign.findUnique({
    where: { id: completeJson.data.campaignId },
  });
  assert(!!createdCamp, 'Campaign verified in database');
  assertEqual(createdCamp?.name, 'M1 Automated Launch Campaign', 'Campaign name matches');
  assertEqual(createdCamp?.maxDailySends, 75, 'Daily sends matches 75');

  // 2.7 POST /api/campaigns with 1-Click applied 4-step sequence
  const campReq = new NextRequest('http://localhost:3000/api/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Conversational 4-Step Outreach Campaign',
      goal: 'Connect with CTOs',
      targetAudience: 'Fintech (50-500)',
      offer: '15-minute benchmark review',
      senderName: 'Alex',
      senderEmail: 'alex@outreach.acmesaas.com',
      dailyLimit: 50,
      sequenceSteps: [
        { step: 1, delayDays: 0, type: 'initial', template: 'Pain-Point Introduction', subject: 'Step 1' },
        { step: 2, delayDays: 3, type: 'followup_1', template: 'Quick Bump', subject: 'Step 2' },
        { step: 3, delayDays: 7, type: 'followup_2', template: 'Case Study', subject: 'Step 3' },
        { step: 4, delayDays: 12, type: 'breakup', template: 'Breakup Note', subject: 'Step 4' },
      ],
    }),
  });
  const campRes = await postCampaign(campReq);
  assertEqual(campRes.status, 201, 'POST /api/campaigns with sequence steps returns 201 Created');
  const campJson = await campRes.json();
  assert(!!campJson.data.id, 'Campaign created with valid ID');

  // Verify saved campaign in DB has sequenceSteps
  const savedCamp = await db.campaign.findUnique({ where: { id: campJson.data.id } });
  assert(!!savedCamp?.sequenceSteps, 'sequenceSteps persisted on Campaign record');

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log(`Milestone 1 Onboarding & Conversational Strategy Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('═'.repeat(70));

  if (failures.length > 0) {
    console.log('\nFailed tests:');
    for (const f of failures) {
      console.log(`  ❌ ${f}`);
    }
    process.exit(1);
  } else {
    console.log('\n🌟 ALL MILESTONE 1 (R1) REQUIREMENTS VERIFIED GREEN!\n');
    process.exit(0);
  }
}

runOnboardingStrategySuite().catch((err) => {
  console.error('Fatal error in onboarding strategy suite:', err);
  process.exit(1);
});
