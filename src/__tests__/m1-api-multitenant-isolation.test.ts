// ─── Milestone 1 API Route Multi-Tenant Isolation Adversarial Test ───
// Tests HTTP API Route handlers to ensure tenant isolation is strictly enforced
// across API boundaries.

import { NextRequest } from 'next/server';
import { db } from '../lib/db';
import { GET as handleEmailEventsGet } from '../app/api/email-events/route';
import { GET as handleLeadsGet, DELETE as handleLeadsDelete } from '../app/api/leads/route';
import { GET as handleInboxGet, POST as handleInboxPost } from '../app/api/inbox/route';
import { GET as handleStatsGet } from '../app/api/stats/route';

let passed = 0;
let failed = 0;
const errors: string[] = [];

function assert(cond: boolean, name: string, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✅ [PASS] ${name}`);
  } else {
    failed++;
    const msg = detail ? `${name} - ${detail}` : name;
    errors.push(msg);
    console.log(`  ❌ [FAIL] ${msg}`);
  }
}

function assertEqual<T>(act: T, exp: T, name: string) {
  if (act !== exp) {
    assert(false, name, `Expected ${JSON.stringify(exp)}, got ${JSON.stringify(act)}`);
  } else {
    assert(true, name);
  }
}

async function runApiMultiTenantTest() {
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║   ADVERSARIAL API ROUTE MULTI-TENANT ISOLATION TEST                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  // Create two isolated tenant organizations with workspace keys
  const orgAKey = `ws_api_alpha_${Date.now()}`;
  const orgBKey = `ws_api_beta_${Date.now()}`;

  const orgA = await db.organization.create({
    data: {
      name: 'API Tenant Alpha',
      workspaceKey: orgAKey,
      plan: 'pro',
      subscriptionStatus: 'active',
    },
  });

  const orgB = await db.organization.create({
    data: {
      name: 'API Tenant Beta',
      workspaceKey: orgBKey,
      plan: 'starter',
      subscriptionStatus: 'active',
    },
  });

  // Create Org A Data
  const leadA = await db.lead.create({
    data: {
      organizationId: orgA.id,
      name: 'Confidential Lead A',
      email: `alpha.target.${Date.now()}@acme.com`,
      company: 'Acme High-Security Inc',
      status: 'active',
    },
  });

  const messageA = await db.outreachEmail.create({
    data: {
      organizationId: orgA.id,
      leadId: leadA.id,
      subject: 'Secret Proposal for Acme',
      body: 'Proprietary strategy info...',
      status: 'sent',
    },
  });

  const eventA = await db.emailEvent.create({
    data: {
      organizationId: orgA.id,
      recipient: leadA.email,
      eventType: 'delivered',
      type: 'delivered',
      messageId: messageA.id,
      leadId: leadA.id,
    },
  });

  const classificationA = await db.replyClassification.create({
    data: {
      organizationId: orgA.id,
      messageId: messageA.id,
      leadId: leadA.id,
      category: 'meeting_request',
      confidence: 0.99,
      replyText: 'Acme wants to invest $10M. Call me!',
    },
  });

  // Create Org B Data
  const leadB = await db.lead.create({
    data: {
      organizationId: orgB.id,
      name: 'Standard Lead B',
      email: `beta.target.${Date.now()}@beta.com`,
      company: 'Beta Corp',
      status: 'active',
    },
  });

  const messageB = await db.outreachEmail.create({
    data: {
      organizationId: orgB.id,
      leadId: leadB.id,
      subject: 'Beta Standard Intro',
      body: 'Introductory email...',
      status: 'sent',
    },
  });

  const eventB = await db.emailEvent.create({
    data: {
      organizationId: orgB.id,
      recipient: leadB.email,
      eventType: 'opened',
      type: 'opened',
      messageId: messageB.id,
      leadId: leadB.id,
    },
  });

  try {
    // ──────────────────────────────────────────────────────────────────────────
    // 1. GET /api/email-events Isolation
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n── 1. GET /api/email-events Multi-Tenant Isolation ────────────────────');

    const reqEventsB = new NextRequest('http://localhost:3000/api/email-events', {
      headers: { 'x-workspace-key': orgBKey },
    });
    const resEventsB = await handleEmailEventsGet(reqEventsB);
    assertEqual(resEventsB.status, 200, 'GET /api/email-events returns 200 for Tenant B');
    const dataEventsB = await resEventsB.json();
    const bEvents = dataEventsB.data.events;
    
    assert(bEvents.length === 1, 'Tenant B receives exactly 1 email event');
    assertEqual(bEvents[0].id, eventB.id, 'Tenant B receives only its own email event');
    assert(!bEvents.some((e: any) => e.id === eventA.id), 'Tenant B cannot see Tenant A email events');
    assertEqual(dataEventsB.data.aggregation.counts.opened, 1, 'Tenant B counts only Tenant B opened events');
    assertEqual(dataEventsB.data.aggregation.counts.delivered || 0, 0, 'Tenant B counts 0 for Tenant A delivered events');

    // ──────────────────────────────────────────────────────────────────────────
    // 2. GET /api/leads Isolation
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n── 2. GET /api/leads Multi-Tenant Isolation ───────────────────────────');

    const reqLeadsB = new NextRequest('http://localhost:3000/api/leads', {
      headers: { 'x-workspace-key': orgBKey },
    });
    const resLeadsB = await handleLeadsGet(reqLeadsB);
    assertEqual(resLeadsB.status, 200, 'GET /api/leads returns 200 for Tenant B');
    const dataLeadsB = await resLeadsB.json();
    const leadsList = dataLeadsB.data.leads;

    assert(leadsList.length === 1, 'Tenant B receives exactly 1 lead');
    assertEqual(leadsList[0].id, leadB.id, 'Tenant B receives only its own lead');
    assert(!leadsList.some((l: any) => l.id === leadA.id), 'Tenant B cannot see Tenant A leads');

    // Search targeting Tenant A name from Tenant B context
    const reqSearchB = new NextRequest('http://localhost:3000/api/leads?search=Confidential', {
      headers: { 'x-workspace-key': orgBKey },
    });
    const resSearchB = await handleLeadsGet(reqSearchB);
    const dataSearchB = await resSearchB.json();
    assertEqual(dataSearchB.data.leads.length, 0, 'Search for Tenant A lead from Tenant B context returns 0 results');

    // ──────────────────────────────────────────────────────────────────────────
    // 3. DELETE /api/leads IDOR Attack Resistance
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n── 3. DELETE /api/leads IDOR Attack Resistance ────────────────────────');

    // Tenant B attempts to delete Tenant A's lead
    const reqDeleteAFromB = new NextRequest(`http://localhost:3000/api/leads?id=${leadA.id}`, {
      method: 'DELETE',
      headers: { 'x-workspace-key': orgBKey },
    });
    const resDeleteAFromB = await handleLeadsDelete(reqDeleteAFromB);
    assertEqual(resDeleteAFromB.status, 404, 'DELETE /api/leads for Tenant A lead by Tenant B returns 404 Not Found');

    // Confirm Lead A still exists in DB
    const intactLeadA = await db.lead.findUnique({ where: { id: leadA.id } });
    assert(!!intactLeadA, 'Tenant A lead is still intact in database');

    // ──────────────────────────────────────────────────────────────────────────
    // 4. POST /api/inbox IDOR Attack Resistance (Reclassify & Suppress)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n── 4. POST /api/inbox IDOR Attack Resistance ──────────────────────────');

    // Tenant B attempts to reclassify Tenant A's reply
    const reqReclassifyFromB = new NextRequest('http://localhost:3000/api/inbox', {
      method: 'POST',
      headers: { 'x-workspace-key': orgBKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'reclassify',
        messageId: messageA.id,
        newCategory: 'not_interested',
      }),
    });
    const resReclassifyFromB = await handleInboxPost(reqReclassifyFromB);
    assertEqual(resReclassifyFromB.status, 200, 'Reclassify request handler completed');

    // Confirm Classification A was NOT changed
    const uncompromisedClass = await db.replyClassification.findUnique({ where: { id: classificationA.id } });
    assertEqual(uncompromisedClass?.category, 'meeting_request', 'Tenant A classification remains meeting_request');

    // Tenant B attempts to suppress Tenant A's lead
    const reqSuppressFromB = new NextRequest('http://localhost:3000/api/inbox', {
      method: 'POST',
      headers: { 'x-workspace-key': orgBKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'suppress',
        leadId: leadA.id,
      }),
    });
    const resSuppressFromB = await handleInboxPost(reqSuppressFromB);
    assertEqual(resSuppressFromB.status, 200, 'Suppress request executed');

    // Confirm Lead A was NOT blacklisted or modified by Tenant B
    const verifiedLeadA = await db.lead.findUnique({ where: { id: leadA.id } });
    assertEqual(verifiedLeadA?.doNotContact, false, 'Tenant A lead was NOT marked DNC by Tenant B');
    assertEqual(verifiedLeadA?.status, 'active', 'Tenant A lead status remains active');

    // ──────────────────────────────────────────────────────────────────────────
    // 5. GET /api/stats Isolation
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n── 5. GET /api/stats Multi-Tenant Metric Scoping ──────────────────────');

    const reqStatsB = new NextRequest('http://localhost:3000/api/stats', {
      headers: { 'x-workspace-key': orgBKey },
    });
    const resStatsB = await handleStatsGet(reqStatsB);
    assertEqual(resStatsB.status, 200, 'GET /api/stats returns 200 for Tenant B');
    const dataStatsB = await resStatsB.json();
    assertEqual(dataStatsB.data.totalLeads, 1, 'Tenant B stats show exactly 1 total lead (Tenant B only)');

  } finally {
    // Cleanup
    await db.emailEvent.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } }).catch(() => {});
    await db.replyClassification.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } }).catch(() => {});
    await db.outreachEmail.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } }).catch(() => {});
    await db.lead.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } }).catch(() => {});
    await db.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } }).catch(() => {});
  }

  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log(`║  API MULTI-TENANT RESULTS: ${passed} PASSED, ${failed} FAILED                          ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  if (failed > 0) {
    console.error(`\n❌ Failed tests (${failed}):`);
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  } else {
    console.log('\n🌟 ALL API MULTI-TENANT ISOLATION TESTS PASSED 100% GREEN!\n');
  }
}

runApiMultiTenantTest().catch(err => {
  console.error('API Multi-tenant test error:', err);
  process.exit(1);
});
