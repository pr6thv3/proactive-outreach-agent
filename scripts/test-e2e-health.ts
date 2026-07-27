// ─── Live End-to-End Health & API Verification Script ─────────

const BASE_URL = 'http://localhost:3000';

async function testEndpoint(name: string, url: string, options?: any) {
  try {
    const res = await fetch(`${BASE_URL}${url}`, options);
    const status = res.status;
    const body = await res.json().catch(() => null);
    if (status >= 200 && status < 300) {
      console.log(`  ✅ [${status}] ${name} (${url})`);
      return { success: true, body };
    } else {
      console.error(`  ❌ [${status}] ${name} (${url}):`, body);
      return { success: false, status, body };
    }
  } catch (err) {
    console.error(`  ❌ [ERROR] ${name} (${url}):`, err);
    return { success: false, error: err };
  }
}

async function runE2eHealthCheck() {
  console.log('🚀 Running Live End-to-End Verification on http://localhost:3000...\n');

  // 1. Dashboard Stats API
  await testEndpoint('Dashboard Stats', '/api/stats');

  // 2. Leads API
  await testEndpoint('Leads Listing', '/api/leads');

  // 3. Messages API
  await testEndpoint('Messages Listing', '/api/messages');

  // 4. Campaigns API
  await testEndpoint('Campaigns Listing', '/api/campaigns');

  // 5. Domains API
  await testEndpoint('Domains Listing', '/api/domains');

  // 6. Job Queue Health API
  await testEndpoint('Job Health', '/api/jobs/health');

  // 7. Orchestrate Add Lead Action
  const leadRes = await testEndpoint('Add Lead via Orchestrator', '/api/orchestrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'add_lead',
      name: 'E2E Tester',
      email: `e2e.${Date.now()}@testcompany.io`,
      company: 'TestCompany',
      title: 'Head of Testing',
    }),
  });

  // 8. Add Sending Domain API
  const domainRes = await testEndpoint('Add Sending Domain', '/api/domains', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      domain: `e2e-test-${Date.now()}.com`,
      fromEmail: `alex@e2e-test-${Date.now()}.com`,
      fromName: 'Alex Tester',
    }),
  });

  // 9. Verify Domain API
  if (domainRes?.body?.data?.domainId) {
    await testEndpoint('Verify Sending Domain', '/api/domains', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domainId: domainRes.body.data.domainId,
        action: 'verify',
      }),
    });
  }

  console.log('\n✨ Live End-to-End API & Workflow Verification Completed!');
}

runE2eHealthCheck();
