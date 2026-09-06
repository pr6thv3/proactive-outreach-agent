// ─── Milestone 1 (R1): Comprehensive Onboarding & Conversational Strategy Suite
// Tests:
// 1. Plain-English Goal Parsing & Translation Engine (Interface Contract #1)
// 2. Multi-Industry, Persona, Tech Stack, Geography, Revenue, and Size Range NLP
// 3. 4-Step Sequence Generation (Day 0, 3, 7, 12) & Template Grounding
// 4. ICP API Endpoints (POST /api/icp/translate, POST /api/icp, GET /api/icp)
// 5. Onboarding Step Progression & State Hydration (/api/onboarding/step, /api/onboarding/state)
// 6. Onboarding Completion & 1-Click Campaign Launch (/api/onboarding/complete, /api/campaigns)
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server';
import { db } from '../lib/db';
import { translateGoalToStrategy, GoalTranslationResult } from '../lib/agents/think/goal-translator';
import { GET as getIcp, POST as postIcp } from '../app/api/icp/route';
import { POST as postTranslate } from '../app/api/icp/translate/route';
import { GET as getStep, POST as postStep } from '../app/api/onboarding/step/route';
import { POST as postComplete } from '../app/api/onboarding/complete/route';
import { GET as getState } from '../app/api/onboarding/state/route';
import { POST as postCampaign, GET as getCampaigns } from '../app/api/campaigns/route';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testFailures: string[] = [];

function assert(condition: boolean, testName: string, detail?: string): void {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    const msg = detail ? `${testName} — ${detail}` : testName;
    testFailures.push(msg);
    console.log(`  ❌ [FAIL] ${msg}`);
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

async function runM1ConversationalSuite() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  MILESTONE 1 (R1): CLIENT ONBOARDING & CONVERSATIONAL STRATEGY SUITE ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  // Setup test organization and user
  const org = await db.organization.upsert({
    where: { workspaceKey: 'dev_workspace' },
    update: { name: 'M1 Conversational Test Org' },
    create: { workspaceKey: 'dev_workspace', name: 'M1 Conversational Test Org' },
  });

  const user = await db.user.upsert({
    where: { email: 'm1_conversational@prospectreach.test' },
    update: {},
    create: { email: 'm1_conversational@prospectreach.test', name: 'M1 Conversational Tester' },
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1: CONVERSATIONAL GOAL TRANSLATOR NLP TESTS (INTERFACE CONTRACT #1)
  // ═══════════════════════════════════════════════════════════════════════════
  section('1. Conversational Goal Translation — Core & Diverse Scenarios');

  // 1.1 Canonical Scenario: Fintech + Cybersecurity + CTOs (50-500 employees)
  const prompt1 = 'Find US fintechs with 50-500 employees hiring cybersecurity leaders and reach out to CTOs';
  const res1: GoalTranslationResult = translateGoalToStrategy({
    goalPrompt: prompt1,
    valueProposition: 'Automated compliance and threat mitigation infrastructure.',
    organizationId: org.id,
  });

  assert(res1.icpCriteria.industries.includes('Fintech'), 'Scenario 1.1: Detected Fintech industry');
  assert(res1.icpCriteria.industries.includes('Cybersecurity'), 'Scenario 1.1: Detected Cybersecurity industry');
  assertEqual(res1.icpCriteria.companySizeMin, 50, 'Scenario 1.1: Company size min is 50');
  assertEqual(res1.icpCriteria.companySizeMax, 500, 'Scenario 1.1: Company size max is 500');
  assert(res1.icpCriteria.requiredSignals.includes('hiring_spike'), 'Scenario 1.1: Includes hiring_spike signal');
  assert(res1.icpCriteria.requiredSignals.includes('executive_hire'), 'Scenario 1.1: Includes executive_hire signal');
  assert(res1.personas.some(p => p.title.includes('CTO') || p.department === 'Engineering'), 'Scenario 1.1: Target persona includes CTO');
  assertEqual(res1.sequenceSteps.length, 4, 'Scenario 1.1: Generates 4-step sequence');
  assertEqual(res1.sequenceSteps[0].delayDays, 0, 'Scenario 1.1: Step 1 delay is 0 days');
  assertEqual(res1.sequenceSteps[1].delayDays, 3, 'Scenario 1.1: Step 2 delay is 3 days');
  assertEqual(res1.sequenceSteps[2].delayDays, 7, 'Scenario 1.1: Step 3 delay is 7 days');
  assertEqual(res1.sequenceSteps[3].delayDays, 12, 'Scenario 1.1: Step 4 delay is 12 days');
  assert(res1.confidence >= 0.85, `Scenario 1.1: High confidence score (${res1.confidence})`);
  assert(res1.summary.length > 20, 'Scenario 1.1: Summary generated');

  // 1.2 Scenario: B2B SaaS + Europe + AWS + Snowflake + VP of Sales + Churn
  const prompt2 = 'Target Series A B2B SaaS companies in Europe using AWS seeking to reduce customer churn, reaching out to VPs of Sales';
  const res2 = translateGoalToStrategy({
    goalPrompt: prompt2,
    valueProposition: 'Predictive churn intelligence and pipeline acceleration.',
    organizationId: org.id,
  });

  assert(res2.icpCriteria.industries.includes('B2B SaaS'), 'Scenario 1.2: Detected B2B SaaS industry');
  assert(res2.icpCriteria.techStack.includes('AWS'), 'Scenario 1.2: Detected AWS in techStack');
  assert(Boolean(res2.icpCriteria.geography?.some(g => g.includes('Europe') || g.includes('United Kingdom'))), 'Scenario 1.2: Detected European geography');
  assert(res2.personas.some(p => p.title.includes('Sales') || p.department === 'Sales'), 'Scenario 1.2: Target persona includes VP of Sales');
  assert(res2.icpCriteria.painPoints.some(pp => pp.toLowerCase().includes('churn') || pp.toLowerCase().includes('pipeline')), 'Scenario 1.2: Extracted churn/pipeline pain points');

  // 1.3 Scenario: Healthcare Enterprises with 500+ employees + CISOs + HIPAA
  const prompt3 = 'Target Healthcare enterprises with 500+ employees dealing with HIPAA compliance and pitch CISOs';
  const res3 = translateGoalToStrategy({
    goalPrompt: prompt3,
    organizationId: org.id,
  });

  assert(res3.icpCriteria.industries.includes('Healthcare & HealthTech'), 'Scenario 1.3: Detected Healthcare industry');
  assert(res3.icpCriteria.companySizeMin >= 500, `Scenario 1.3: Size min >= 500 (${res3.icpCriteria.companySizeMin})`);
  assert(res3.personas.some(p => p.title.includes('CISO') || p.department === 'Security'), 'Scenario 1.3: Target persona includes CISO');
  assert(res3.icpCriteria.painPoints.some(pp => pp.toLowerCase().includes('hipaa') || pp.toLowerCase().includes('compliance')), 'Scenario 1.3: Includes HIPAA pain point');

  // 1.4 Scenario: E-Commerce brands (20-200 people) hiring SDRs + Founders
  const prompt4 = 'Find high-growth E-commerce brands (20-200 people) hiring SDRs and reach out to Founders';
  const res4 = translateGoalToStrategy({
    goalPrompt: prompt4,
    organizationId: org.id,
  });

  assert(res4.icpCriteria.industries.includes('E-commerce & Retail'), 'Scenario 1.4: Detected E-commerce industry');
  assertEqual(res4.icpCriteria.companySizeMin, 20, 'Scenario 1.4: Company size min is 20');
  assertEqual(res4.icpCriteria.companySizeMax, 200, 'Scenario 1.4: Company size max is 200');
  assert(res4.personas.some(p => p.seniority === 'Founder' || p.title.includes('Founder') || p.title.includes('CEO')), 'Scenario 1.4: Identified Founder persona');

  // 1.5 Scenario: LegalTech with Contract Lifecycle + General Counsel / CIO
  const prompt5 = 'Find LegalTech and law firm leaders with 100-1000 employees modernizing contract lifecycle, reach out to CIOs';
  const res5 = translateGoalToStrategy({
    goalPrompt: prompt5,
    organizationId: org.id,
  });

  assert(res5.icpCriteria.industries.includes('LegalTech & Compliance'), 'Scenario 1.5: Detected LegalTech & Compliance');
  assertEqual(res5.icpCriteria.companySizeMin, 100, 'Scenario 1.5: Company size min is 100');
  assertEqual(res5.icpCriteria.companySizeMax, 1000, 'Scenario 1.5: Company size max is 1000');
  assert(res5.personas.some(p => p.title.includes('CIO') || p.department === 'IT'), 'Scenario 1.5: Identified CIO persona');

  // 1.6 Scenario: CleanTech & Energy with $5M-$20M ARR and COOs
  const prompt6 = 'Target CleanTech and renewable energy companies with $5M-$20M ARR dealing with grid interconnection, reaching out to COOs';
  const res6 = translateGoalToStrategy({
    goalPrompt: prompt6,
    organizationId: org.id,
  });

  assert(res6.icpCriteria.industries.includes('CleanTech & Energy'), 'Scenario 1.6: Detected CleanTech & Energy');
  assertEqual(res6.icpCriteria.revenueMin, 5000000, 'Scenario 1.6: Parsed revenueMin is $5,000,000');
  assertEqual(res6.icpCriteria.revenueMax, 20000000, 'Scenario 1.6: Parsed revenueMax is $20,000,000');
  assert(res6.personas.some(p => p.title.includes('COO') || p.department === 'Operations'), 'Scenario 1.6: Identified COO persona');

  // 1.7 Scenario: Large Scale '1k-5k employees' & CAIO / Head of AI
  const prompt7 = 'Connect with Chief AI Officers at 1k-5k employees enterprises adopting OpenAI and LangChain';
  const res7 = translateGoalToStrategy({
    goalPrompt: prompt7,
    organizationId: org.id,
  });

  assertEqual(res7.icpCriteria.companySizeMin, 1000, 'Scenario 1.7: Parsed 1k as 1000 min employees');
  assertEqual(res7.icpCriteria.companySizeMax, 5000, 'Scenario 1.7: Parsed 5k as 5000 max employees');
  assert(res7.icpCriteria.techStack.includes('OpenAI'), 'Scenario 1.7: Tech stack includes OpenAI');
  assert(res7.icpCriteria.techStack.includes('LangChain'), 'Scenario 1.7: Tech stack includes LangChain');
  assert(res7.personas.some(p => p.title.includes('AI') || p.department === 'AI & Data'), 'Scenario 1.7: Identified Chief AI Officer persona');

  // 1.8 Scenario: Tech Exclusions ('using AWS without Snowflake')
  const prompt8 = 'Target SaaS companies using AWS without Snowflake';
  const res8 = translateGoalToStrategy({
    goalPrompt: prompt8,
    organizationId: org.id,
  });

  assert(res8.icpCriteria.techStack.includes('AWS'), 'Scenario 1.8: Included AWS in techStack');
  assert(res8.icpCriteria.excludeTechStack.includes('Snowflake'), 'Scenario 1.8: Excluded Snowflake in excludeTechStack');

  // 1.9 Fallback Scenario: Empty or minimal prompt
  const resEmpty = translateGoalToStrategy({ goalPrompt: '', organizationId: org.id });
  assert(resEmpty.icpCriteria.industries.length > 0, 'Scenario 1.9: Fallback industries provided for empty prompt');
  assertEqual(resEmpty.sequenceSteps.length, 4, 'Scenario 1.9: Fallback 4-step sequence provided');
  assert(resEmpty.personas.length > 0, 'Scenario 1.9: Fallback personas provided');

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
      valueProposition: 'Automated threat mitigation and continuous SOC2 compliance',
      organizationId: org.id,
    }),
  });
  const translateRes = await postTranslate(translateReq);
  assertEqual(translateRes.status, 200, 'POST /api/icp/translate returns 200 OK');
  const translateJson = await translateRes.json();
  assert(translateJson.success, 'POST /api/icp/translate success = true');
  assert(translateJson.data.icpCriteria.industries.includes('Fintech'), 'Translate endpoint parsed Fintech');
  assertEqual(translateJson.data.sequenceSteps.length, 4, 'Translate endpoint returns 4-step sequence');
  assert(!!translateJson.traceId, 'Translate response contains traceId');

  // 2.2 POST /api/icp (Save structured criteria)
  const saveIcpReq = new NextRequest('http://localhost:3000/api/icp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      industries: ['Fintech', 'Cybersecurity', 'B2B SaaS'],
      companySizeMin: 50,
      companySizeMax: 500,
      revenueMin: 2000000,
      revenueMax: 20000000,
      techStack: ['AWS', 'Kubernetes', 'Snowflake', 'TypeScript'],
      excludeTechStack: ['Legacy On-Prem'],
      requiredSignals: ['hiring_spike', 'executive_hire'],
      minSignalScore: 65,
      valueProp: 'Empowering engineering teams with verified signal outreach',
      painPoints: ['Compliance overhead', 'Developer velocity', 'SOC alert fatigue'],
    }),
  });
  const saveIcpRes = await postIcp(saveIcpReq);
  assertEqual(saveIcpRes.status, 200, 'POST /api/icp returns 200 OK');
  const saveIcpJson = await saveIcpRes.json();
  assert(saveIcpJson.success, 'POST /api/icp success = true');

  // 2.3 GET /api/icp (Verify structured response format)
  const getIcpReq = new NextRequest('http://localhost:3000/api/icp');
  const getIcpRes = await getIcp(getIcpReq);
  assertEqual(getIcpRes.status, 200, 'GET /api/icp returns 200 OK');
  const getIcpJson = await getIcpRes.json();
  assert(Array.isArray(getIcpJson.data.industries), 'GET /api/icp returns industries array');
  assert(getIcpJson.data.industries.includes('Fintech'), 'GET /api/icp includes Fintech');
  assert(Array.isArray(getIcpJson.data.techStack), 'GET /api/icp returns techStack array');
  assertEqual(getIcpJson.data.companySizeMin, 50, 'GET /api/icp companySizeMin is 50');
  assertEqual(getIcpJson.data.companySizeMax, 500, 'GET /api/icp companySizeMax is 500');
  assertEqual(getIcpJson.data.revenueMin, 2000000, 'GET /api/icp revenueMin is 2000000');

  // 2.4 Step progression (Step 1 -> 2 -> 3 -> 4)
  for (const stepNum of [1, 2, 3, 4]) {
    const postStepReq = new NextRequest('http://localhost:3000/api/onboarding/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: stepNum }),
    });
    const postStepRes = await postStep(postStepReq);
    assertEqual(postStepRes.status, 200, `POST /api/onboarding/step (${stepNum}) returns 200 OK`);
    const postStepJson = await postStepRes.json();
    assertEqual(postStepJson.data.onboardingStep, stepNum, `Onboarding step updated to ${stepNum}`);

    const getStepReq = new NextRequest('http://localhost:3000/api/onboarding/step');
    const getStepRes = await getStep(getStepReq);
    const getStepJson = await getStepRes.json();
    assertEqual(getStepJson.data.onboardingStep, stepNum, `GET /api/onboarding/step returns step ${stepNum}`);
  }

  // 2.5 GET /api/onboarding/state (Full wizard state payload)
  const getStateReq = new NextRequest('http://localhost:3000/api/onboarding/state');
  const getStateRes = await getState(getStateReq);
  assertEqual(getStateRes.status, 200, 'GET /api/onboarding/state returns 200 OK');
  const getStateJson = await getStateRes.json();
  assertEqual(getStateJson.data.step, 4, 'Onboarding state reflects step 4');
  assert(!!getStateJson.data.icp, 'Onboarding state includes saved ICP');
  assert(getStateJson.data.icp.industries.includes('Fintech'), 'Onboarding state ICP contains Fintech');
  assert(Array.isArray(getStateJson.data.domains), 'Onboarding state returns domains array');

  // 2.6 POST /api/onboarding/complete (Launch initial campaign & complete onboarding)
  const completeReq = new NextRequest('http://localhost:3000/api/onboarding/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dailySendLimit: 60,
      minLeadScore: 65,
      autonomyEnabled: true,
      campaignName: 'Q1 Autonomous Fintech Launch Campaign',
      goal: 'Find US fintechs and book CTO discovery calls',
      targetAudience: 'Fintech & Cybersecurity CTOs (50-500 emp)',
      offer: 'Signal-grounded outreach benchmark review',
      senderName: 'Alex Vance',
      senderEmail: 'alex@outreach.acmesaas.com',
      sequenceSteps: [
        { step: 1, delayDays: 0, type: 'initial', template: 'Pain-Point Intro', subject: 'Quick question' },
        { step: 2, delayDays: 3, type: 'followup_1', template: 'Quick Bump', subject: 'Re: Quick question' },
        { step: 3, delayDays: 7, type: 'followup_2', template: 'Case Study', subject: 'Case Study brief' },
        { step: 4, delayDays: 12, type: 'breakup', template: 'Breakup', subject: 'Permission to close file?' },
      ],
    }),
  });
  const completeRes = await postComplete(completeReq);
  assertEqual(completeRes.status, 200, 'POST /api/onboarding/complete returns 200 OK');
  const completeJson = await completeRes.json();
  assertEqual(completeJson.data.onboardingComplete, true, 'onboardingComplete is true');
  assert(!!completeJson.data.campaignId, 'Campaign created during onboarding complete');

  // Verify created campaign in DB
  const createdCamp = await db.campaign.findUnique({
    where: { id: completeJson.data.campaignId },
  });
  assert(!!createdCamp, 'Campaign verified in database');
  assertEqual(createdCamp?.name, 'Q1 Autonomous Fintech Launch Campaign', 'Campaign name matches');
  assertEqual(createdCamp?.maxDailySends, 60, 'Daily sends limit matches 60');

  // 2.7 1-Click Apply Strategy in Campaign Builder -> POST /api/campaigns
  const campBuilderReq = new NextRequest('http://localhost:3000/api/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Conversational 4-Step Strategic Campaign',
      goal: 'Reach out to CTOs at Fintech companies with 50-500 employees',
      targetAudience: 'Fintech (50-500 emp)',
      offer: 'Free 15-minute infrastructure ROI and benchmark review',
      senderName: 'Alex from Acme',
      senderEmail: 'alex@outreach.acmesaas.com',
      dailyLimit: 50,
      sequenceSteps: [
        { step: 1, delayDays: 0, type: 'initial', template: 'Pain-Point Introduction', subject: 'Step 1' },
        { step: 2, delayDays: 3, type: 'followup_1', template: 'Quick Bump Note', subject: 'Step 2' },
        { step: 3, delayDays: 7, type: 'followup_2', template: 'Value Case Study', subject: 'Step 3' },
        { step: 4, delayDays: 12, type: 'breakup', template: 'Break-up Note', subject: 'Step 4' },
      ],
    }),
  });
  const campBuilderRes = await postCampaign(campBuilderReq);
  assertEqual(campBuilderRes.status, 201, 'POST /api/campaigns returns 201 Created');
  const campBuilderJson = await campBuilderRes.json();
  assert(!!campBuilderJson.data.id, 'Campaign created from Campaign Builder has valid ID');

  const savedCamp = await db.campaign.findUnique({ where: { id: campBuilderJson.data.id } });
  assert(!!savedCamp?.sequenceSteps, 'sequenceSteps persisted correctly on Campaign');

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log(`Milestone 1 Onboarding & Conversational Strategy Results: ${passedTests} passed, ${failedTests} failed, ${totalTests} total`);
  console.log('═'.repeat(70));

  if (failedTests > 0) {
    console.error('\nFailed tests:');
    for (const f of testFailures) {
      console.error(`  ❌ ${f}`);
    }
    process.exit(1);
  } else {
    console.log('\n🌟 ALL MILESTONE 1 (R1) REQUIREMENTS VERIFIED GREEN!\n');
    process.exit(0);
  }
}

runM1ConversationalSuite().catch((err) => {
  console.error('Fatal error in M1 conversational suite:', err);
  process.exit(1);
});
