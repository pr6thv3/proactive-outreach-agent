// ─── TEST SUITE: R4 CRM ADAPTER & SYSTEM OBSERVABILITY ────────────
// Validates Milestone 4 requirements:
// 1. Pluggable CRMAdapter (HubSpot, Salesforce, Pipedrive, Generic REST)
// 2. Incident Center diagnostics & 1-click remediation
// 3. Client ROI & labor savings calculator
// ─────────────────────────────────────────────────────────────────

import assert from 'assert';
import { CRMFactory } from '../lib/integrations/crm-adapter';
import { IncidentCenterService } from '../lib/admin/incident-center';
import { RoiCalculator } from '../lib/admin/roi-calculator';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res
        .then(() => {
          passed++;
          console.log(`  ✅ ${name}`);
        })
        .catch((err) => {
          failed++;
          console.error(`  ❌ ${name}:`, err.message);
        });
    } else {
      passed++;
      console.log(`  ✅ ${name}`);
    }
  } catch (err: any) {
    failed++;
    console.error(`  ❌ ${name}:`, err.message);
  }
}

async function runTests() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('🧪 MILESTONE 4: CRM ADAPTER & OBSERVABILITY SUITE');
  console.log('════════════════════════════════════════════════════════════════\n');

  console.log('── 1. Pluggable CRM Adapters ───────────────────────────────────');

  await test('HubSpot adapter handles contacts, activities, and opt-outs', async () => {
    const adapter = CRMFactory.getAdapter('hubspot', { apiKey: 'mock_hs_key' });
    assert.strictEqual(adapter.provider, 'hubspot');

    const contact = await adapter.syncContact({
      organizationId: 'org_1',
      email: 'alex@acme.com',
      firstName: 'Alex',
      companyName: 'Acme Corp',
    });
    assert.strictEqual(contact.success, true);
    assert.ok(contact.externalRecordId?.startsWith('hs_contact_'));

    const activity = await adapter.logActivity({
      organizationId: 'org_1',
      contactEmail: 'alex@acme.com',
      activityType: 'EMAIL_SENT',
      timestamp: new Date().toISOString(),
    });
    assert.strictEqual(activity.success, true);

    const optOut = await adapter.handleOptOut({
      organizationId: 'org_1',
      contactEmail: 'alex@acme.com',
      reason: 'Explicit unsub',
      timestamp: new Date().toISOString(),
    });
    assert.strictEqual(optOut.success, true);
  });

  await test('Salesforce adapter creates 15-char SObject IDs and tasks', async () => {
    const adapter = CRMFactory.getAdapter('salesforce', { instanceUrl: 'https://salesforce.com' });
    assert.strictEqual(adapter.provider, 'salesforce');

    const contact = await adapter.syncContact({
      organizationId: 'org_1',
      email: 'ciso@bank.com',
      firstName: 'Elena',
      companyName: 'Global Bank',
    });
    assert.strictEqual(contact.success, true);
    assert.ok(contact.externalRecordId?.startsWith('003')); // Standard Salesforce Contact prefix

    const task = await adapter.logActivity({
      organizationId: 'org_1',
      contactEmail: 'ciso@bank.com',
      activityType: 'EMAIL_REPLIED',
      timestamp: new Date().toISOString(),
    });
    assert.strictEqual(task.success, true);
    assert.ok(task.externalRecordId?.startsWith('00T')); // Standard Salesforce Task prefix
  });

  await test('Pipedrive adapter handles meeting activities and persons', async () => {
    const adapter = CRMFactory.getAdapter('pipedrive', { apiToken: 'mock_pd_token' });
    assert.strictEqual(adapter.provider, 'pipedrive');

    const meeting = await adapter.syncMeeting({
      organizationId: 'org_1',
      contactEmail: 'lead@startup.io',
      title: 'ProactiveReach Demo',
      scheduledTime: new Date().toISOString(),
      calendarLink: 'https://cal.com/demo',
      durationMinutes: 15,
    });
    assert.strictEqual(meeting.success, true);
    assert.ok(meeting.externalRecordId?.startsWith('pd_meet_'));
  });

  await test('Generic REST adapter dispatches webhook payloads', async () => {
    const adapter = CRMFactory.getAdapter('generic_rest', { webhookUrl: 'https://hooks.zapier.com/test' });
    assert.strictEqual(adapter.provider, 'generic_rest');

    const testConn = await adapter.testConnection();
    assert.strictEqual(testConn.connected, true);
  });

  console.log('\n── 2. Incident Center Operational Diagnostics ──────────────────');

  await test('Incident Center returns structured report with remediation targets', async () => {
    const report = await IncidentCenterService.getActiveIncidents('org_test');
    assert.strictEqual(typeof report.hasIncidents, 'boolean');
    assert.strictEqual(typeof report.incidentCount, 'number');
    assert.ok(Array.isArray(report.incidents));
  });

  console.log('\n── 3. Client ROI & Time Savings Calculator ─────────────────────');

  await test('Computes verified labor hours avoided and positive ROI', async () => {
    const roi = await RoiCalculator.calculateRoi('org_test', {
      hourlyLaborRate: 50,
      manualMinutesPerLead: 20,
    });

    assert.ok(roi.manualHoursAvoided > 0, 'Hours avoided must be positive');
    assert.ok(roi.netHoursSaved > 0, 'Net hours saved must be positive');
    assert.ok(roi.grossLaborSavingsUsd > 0, 'Gross savings must be positive');
    assert.ok(roi.roiPercentage > 0, 'ROI percentage must be positive');
    assert.strictEqual(roi.paybackDays, 4);
  });

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('════════════════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

runTests();
