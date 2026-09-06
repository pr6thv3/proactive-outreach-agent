// ─── Milestone 2 Test Suite: Automated Discovery & "Why Qualified" Research Cards ───
// Tests:
// 1. Autonomous Prospect Discovery Feed without manual CSV upload
// 2. Deterministic "Why Qualified" Research Breakdown (Firmographic, Technographic, Intent, MX)
// 3. Verifiable Citation Grounding & Urgency Scoring
// 4. Interface Contract #2: GET /api/prospects/[id]/why-qualified & GET /api/leads/[id]/why-qualified
// 5. MX Record Verification Gate
// 6. Discovery API Endpoints & Filter Dimensions
//
// Run with:
//   cross-env SQLITE_DATABASE_URL=file:./dev.db AUTH_DEV_BYPASS=true tsx src/__tests__/discovery-why-qualified.test.ts

import { db } from '../lib/db';
import {
  calculateWhyQualified,
  getDiscoveryProspects,
  seedAutonomousProspects,
  getSignalCategory,
} from '../lib/discovery/prospect-discovery';
import { verifyMxRecord, verifyLeadMx } from '../lib/deliverability/mx-verifier';
import { GET as getProspects, POST as postProspects } from '../app/api/prospects/route';
import { POST as discoverProspects } from '../app/api/prospects/discover/route';
import { GET as getWhyQualifiedProspect } from '../app/api/prospects/[id]/why-qualified/route';
import { GET as getWhyQualifiedLead } from '../app/api/leads/[id]/why-qualified/route';
import { NextRequest } from 'next/server';

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

async function cleanDb(orgId: string) {
  await db.activity.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.outreachEmail.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.enrichmentQueue.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.signal.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.lead.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
  await db.organization.deleteMany({ where: { id: orgId } }).catch(() => {});
}

async function runTests() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║   MILESTONE 2 (R2): AUTOMATED DISCOVERY & "WHY QUALIFIED" TESTS      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  process.env.AUTH_DEV_BYPASS = 'true';

  const org = await db.organization.create({
    data: {
      workspaceKey: `m2_test_org_${Date.now()}`,
      name: 'M2 Discovery Test Org',
    },
  });

  try {
    // ═══════════════════════════════════════════════════════════════════════════
    // 1. MX RECORD VERIFICATION GATE
    // ═══════════════════════════════════════════════════════════════════════════
    section('1. MX Record Verification Gate');

    const mxGoogle = await verifyMxRecord('test@google.com');
    assertEqual(mxGoogle.valid, true, '1.1: Validates Google MX exchange');
    assertEqual(mxGoogle.mxScore, 10, '1.1: Verified MX provides 10 pts score');
    assertEqual(mxGoogle.status, 'verified', '1.1: Status is verified');

    const mxStripe = await verifyMxRecord('sarah.jenkins@stripe.com');
    assertEqual(mxStripe.valid, true, '1.2: Validates Stripe domain MX');
    assertEqual(mxStripe.mxScore, 10, '1.2: Stripe MX score is 10');

    const mxInvalid = await verifyMxRecord('not-an-email');
    assertEqual(mxInvalid.valid, false, '1.3: Rejects invalid email format');
    assertEqual(mxInvalid.mxScore, 0, '1.3: Invalid email scores 0 mxScore');
    assertEqual(mxInvalid.status, 'syntax_invalid', '1.3: Status is syntax_invalid');

    // Lead MX Verification Persistence
    const testLead = await db.lead.create({
      data: {
        organizationId: org.id,
        name: 'Alex Rivera',
        email: 'alex@enterprise-ai.io',
        company: 'Enterprise AI',
        title: 'VP Engineering',
        status: 'discovered',
      },
    });

    const leadMxResult = await verifyLeadMx(testLead.id, org.id);
    assertEqual(leadMxResult.valid, true, '1.4: verifyLeadMx validates lead domain');

    const updatedLead = await db.lead.findUnique({ where: { id: testLead.id } });
    assertEqual(updatedLead?.emailVerified, true, '1.4: Lead emailVerified updated to true in DB');

    const queueEntry = await db.enrichmentQueue.findFirst({ where: { leadId: testLead.id } });
    assert(!!queueEntry, '1.4: EnrichmentQueue record created');
    assertEqual(queueEntry?.status, 'MX_VERIFIED', '1.4: EnrichmentQueue status is MX_VERIFIED');

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. "WHY QUALIFIED" RESEARCH BREAKDOWN CALCULATION
    // ═══════════════════════════════════════════════════════════════════════════
    section('2. "Why Qualified" Research Breakdown Calculation');

    // Create realistic intent signals
    const fundingSignal = await db.signal.create({
      data: {
        organizationId: org.id,
        leadId: testLead.id,
        type: 'funding_round',
        content: 'Enterprise AI raised $25M Series B led by Sequoia Capital.',
        sourceUrl: 'https://enterprise-ai.io/news/series-b',
        sourceTitle: 'Enterprise AI Newsroom — Series B Announcement',
        urgency: 0.94,
        confidence: 0.95,
        relevance: 0.92,
        recommendedPitchAngle: 'Growth partnership — scaling outbound infrastructure post-funding.',
      },
    });

    const hiringSignal = await db.signal.create({
      data: {
        organizationId: org.id,
        leadId: testLead.id,
        type: 'engineering_hiring_spike',
        content: 'Opened 15 senior engineering roles across cloud infrastructure.',
        sourceUrl: 'https://enterprise-ai.io/careers',
        sourceTitle: 'Enterprise AI Careers',
        urgency: 0.88,
        confidence: 0.90,
        relevance: 0.89,
      },
    });

    const leadWithSignals = await db.lead.findUnique({
      where: { id: testLead.id },
      include: { signals: true, enrichmentQueues: true },
    });

    const whyQual = calculateWhyQualified(leadWithSignals, org.id);

    // Validate 4 Pillars
    assertEqual(whyQual.leadId, testLead.id, '2.1: Lead ID preserved');
    assertEqual(whyQual.mxVerified, true, '2.1: MX verified is true');
    assertEqual(whyQual.icpMatchBreakdown.mxScore, 10, '2.1: MX score is 10/10');
    assert(whyQual.icpMatchBreakdown.firmographicScore >= 35, '2.2: Firmographic match score >= 35/40');
    assertEqual(whyQual.icpMatchBreakdown.technographicScore, 20, '2.3: Technographic score is 20/20');
    assert(whyQual.icpMatchBreakdown.intentScore >= 25, '2.4: Intent score >= 25/30 for 94% urgency signal');
    assert(whyQual.icpMatchBreakdown.totalScore >= 85, '2.5: Total composite score >= 85/100 (HOT tier)');
    assertEqual(whyQual.priorityTier, 'hot', '2.5: Priority tier is hot');

    // Validate Trigger Signal Citation Snapshot
    assertEqual(whyQual.triggerSignal.type, 'funding_round', '2.6: Top trigger signal is funding_round');
    assertEqual(whyQual.triggerSignal.category, 'Funding Round', '2.6: Category is formatted as Funding Round');
    assertEqual(whyQual.triggerSignal.sourceUrl, 'https://enterprise-ai.io/news/series-b', '2.7: Citation URL preserved');
    assertEqual(whyQual.triggerSignal.sourceTitle, 'Enterprise AI Newsroom — Series B Announcement', '2.7: Citation title preserved');
    assertEqual(whyQual.triggerSignal.citationQuality, 'strong', '2.7: Official company newsroom has strong citation quality');
    assertEqual(whyQual.triggerSignal.urgency, 94, '2.8: Urgency normalized to 94%');

    // Validate Strategic Outreach Angle
    assert(
      whyQual.outreachAngle.toLowerCase().includes('growth') || whyQual.outreachAngle.toLowerCase().includes('funding'),
      '2.9: Outreach angle matches funding growth trigger'
    );
    assert(whyQual.aiConfidence >= 85, `2.10: AI confidence score >= 85% (actual: ${whyQual.aiConfidence}%)`);

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. INTERFACE CONTRACT #2: WHY QUALIFIED ENDPOINTS
    // ═══════════════════════════════════════════════════════════════════════════
    section('3. Interface Contract #2: Why Qualified Endpoints');

    // Endpoint 1: GET /api/prospects/[id]/why-qualified
    const mockReq1 = new NextRequest(`http://localhost:3000/api/prospects/${testLead.id}/why-qualified`, {
      headers: { 'x-organization-id': org.id },
    });
    const res1 = await getWhyQualifiedProspect(mockReq1, { params: Promise.resolve({ id: testLead.id }) });
    assertEqual(res1.status, 200, '3.1: GET /api/prospects/[id]/why-qualified returns 200 OK');

    const json1 = await res1.json();
    assert(json1.success === true, '3.1: Response indicates success: true');
    assert('triggerSignal' in json1.data, '3.2: Contains triggerSignal object');
    assert('icpMatchBreakdown' in json1.data, '3.2: Contains icpMatchBreakdown object');
    assert('firmographicScore' in json1.data.icpMatchBreakdown, '3.2: Contains firmographicScore');
    assert('technographicScore' in json1.data.icpMatchBreakdown, '3.2: Contains technographicScore');
    assert('intentScore' in json1.data.icpMatchBreakdown, '3.2: Contains intentScore');
    assert('mxScore' in json1.data.icpMatchBreakdown, '3.2: Contains mxScore');
    assert('totalScore' in json1.data.icpMatchBreakdown, '3.2: Contains totalScore');
    assert('outreachAngle' in json1.data, '3.2: Contains outreachAngle');
    assert('aiConfidence' in json1.data, '3.2: Contains aiConfidence');
    assert('mxVerified' in json1.data, '3.2: Contains mxVerified');

    // Endpoint 2: GET /api/leads/[id]/why-qualified
    const mockReq2 = new NextRequest(`http://localhost:3000/api/leads/${testLead.id}/why-qualified`, {
      headers: { 'x-organization-id': org.id },
    });
    const res2 = await getWhyQualifiedLead(mockReq2, { params: Promise.resolve({ id: testLead.id }) });
    assertEqual(res2.status, 200, '3.3: GET /api/leads/[id]/why-qualified returns 200 OK');
    const json2 = await res2.json();
    assertEqual(json2.data.leadId, testLead.id, '3.3: Lead ID matches');
    assertEqual(json2.data.mxVerified, true, '3.3: MX verification status matches');

    // 404 Case for non-existent prospect
    const mockReq404 = new NextRequest('http://localhost:3000/api/prospects/invalid_id_999/why-qualified', {
      headers: { 'x-organization-id': org.id },
    });
    const res404 = await getWhyQualifiedProspect(mockReq404, { params: Promise.resolve({ id: 'invalid_id_999' }) });
    assertEqual(res404.status, 404, '3.4: Returns 404 for unknown lead ID');

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. AUTONOMOUS PROSPECT DISCOVERY FEED & SEARCH / FILTERS
    // ═══════════════════════════════════════════════════════════════════════════
    section('4. Autonomous Prospect Discovery Feed & Filters');

    const seedCount = await seedAutonomousProspects(org.id);
    assert(seedCount >= 4, `4.1: Autonomous discovery seeded ${seedCount} qualified benchmark prospects`);

    // Fetch all prospects
    const allProspects = await getDiscoveryProspects(org.id);
    assert(allProspects.length >= 5, `4.2: Discovery feed returns ${allProspects.length} total prospects`);

    // Verify prospect structure
    const sampleProspect = allProspects.find(p => p.email === 'sarah.jenkins@stripe.com');
    assert(!!sampleProspect, '4.3: Discovered prospect Sarah Jenkins (Stripe) exists in feed');
    assertEqual(sampleProspect?.company, 'Stripe', '4.3: Company matches Stripe');
    assertEqual(sampleProspect?.title, 'VP of Engineering', '4.3: Title matches VP of Engineering');
    assertEqual(sampleProspect?.isVerified, true, '4.3: MX is verified');
    assertEqual(sampleProspect?.triggerSignal?.type, 'hiring_spike', '4.4: Trigger signal is hiring_spike');
    assert(!!sampleProspect?.draftEmail?.subject, '4.5: Pre-generated grounded email draft exists');
    assert(!!sampleProspect?.draftEmail?.body?.includes('Sarah'), '4.5: Email draft personalized with prospect firstName');

    // Filter 1: High Intent (Score >= 80)
    const highIntentProspects = await getDiscoveryProspects(org.id, { tier: 'high' });
    assert(
      highIntentProspects.every(p => p.score >= 80),
      '4.6: Tier filter "high" returns only prospects with score >= 80'
    );

    // Filter 2: MX Verified Only
    const verifiedProspects = await getDiscoveryProspects(org.id, { tier: 'verified' });
    assert(
      verifiedProspects.every(p => p.isVerified),
      '4.7: Tier filter "verified" returns only MX verified prospects'
    );

    // Filter 3: Signal Type (e.g. Funding)
    const fundingProspects = await getDiscoveryProspects(org.id, { signalType: 'funding' });
    assert(
      fundingProspects.length > 0 && fundingProspects.every(p => p.triggerSignal.type.includes('funding')),
      '4.8: Signal filter "funding" isolates funding triggered prospects'
    );

    // Filter 4: Search Query
    const searchedProspects = await getDiscoveryProspects(org.id, { search: 'Plaid' });
    assertEqual(searchedProspects.length, 1, '4.9: Search by company "Plaid" returns Marcus Vance');
    assertEqual(searchedProspects[0].email, 'marcus.vance@plaid.com', '4.9: Email matches Plaid prospect');

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. API DISCOVERY & ON-DEMAND TRIGGER ENDPOINTS
    // ═══════════════════════════════════════════════════════════════════════════
    section('5. API Discovery & On-Demand Trigger Endpoints');

    // Test GET /api/prospects
    const getReq = new NextRequest('http://localhost:3000/api/prospects', {
      headers: { 'x-organization-id': org.id },
    });
    const getRes = await getProspects(getReq);
    assertEqual(getRes.status, 200, '5.1: GET /api/prospects returns 200 OK');
    const getJson = await getRes.json();
    assert(Array.isArray(getJson.data), '5.1: Response data is an array of prospects');
    assert(getJson.data.length >= 5, '5.1: Feed returns populated prospects');

    // Test POST /api/prospects/discover
    const postReq = new NextRequest('http://localhost:3000/api/prospects/discover', {
      method: 'POST',
      headers: { 'x-organization-id': org.id },
    });
    const postRes = await discoverProspects(postReq);
    assertEqual(postRes.status, 200, '5.2: POST /api/prospects/discover returns 200 OK');
    const postJson = await postRes.json();
    assert(postJson.success === true, '5.2: Response indicates discovery success');
    assert('totalDiscovered' in postJson.data, '5.2: Reports totalDiscovered count');

    // ═══════════════════════════════════════════════════════════════════════════
    // 6. EDGE CASES & DEFENSIVE HARDENING
    // ═══════════════════════════════════════════════════════════════════════════
    section('6. Edge Cases & Defensive Hardening');

    // Edge Case 1: Lead with NO signals
    const bareLead = await db.lead.create({
      data: {
        organizationId: org.id,
        name: 'Bare Lead',
        email: 'bare@genericstartup.io',
        status: 'new',
      },
    });

    const bareWhyQual = calculateWhyQualified(bareLead, org.id);
    assert(bareWhyQual.icpMatchBreakdown.totalScore > 0, '6.1: Lead with no signals computes baseline ICP score');
    assertEqual(bareWhyQual.triggerSignal.type, 'ICP_FIT', '6.1: Defaults to ICP_FIT trigger signal');
    assertEqual(bareWhyQual.mxVerified, false, '6.1: Unverified lead has mxVerified = false');

    // Edge Case 2: Signal Category Mapping
    assertEqual(getSignalCategory('funding_round'), 'Funding Round', '6.2: Maps funding_round category');
    assertEqual(getSignalCategory('tech_stack_migration'), 'Tech Migration', '6.2: Maps tech_stack_migration category');
    assertEqual(getSignalCategory('engineering_hiring_spike'), 'Engineering Hiring', '6.2: Maps engineering hiring category');
    assertEqual(getSignalCategory('custom_unseen_signal'), 'Custom Unseen Signal', '6.2: Formats unknown signal category nicely');

    console.log('\n' + '═'.repeat(68));
    console.log(`Milestone 2 (R2) Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
    console.log('═'.repeat(68));

    if (failures.length > 0) {
      console.log('\nFailed tests:');
      for (const f of failures) console.log(`  ❌ ${f}`);
    }

    await cleanDb(org.id);
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Test runner encountered error:', error);
    await cleanDb(org.id).catch(() => {});
    process.exit(1);
  }
}

runTests();
