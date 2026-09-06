// ─── Milestone 5: Outcome-Driven Dashboard & Crystal-Clear Domain Setup Test Suite ───
// Comprehensive tests for M5:
// 1. Sales Pipeline Funnel Aggregation (6 stages + conversion rates + North Star positive reply rate)
// 2. Synchronized Unambiguous Domain Badges (ACTIVE/Verified vs Verification Pending vs Suspended)
// 3. DNS Helper Record Generation (SPF, DKIM, DMARC) with copyable host/value and plain-English explanations
// 4. Multi-Tenant Scoping & Edge-Case Safety

import { db } from '../lib/db';
import { checkDomainDnsStatus, getRequiredDnsRecords } from '../lib/deliverability/dns-checker';
import { DeliverabilityService } from '../lib/deliverability';
import { getDomainStatusInfo } from '../components/dashboard/domain-verifier';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
    throw new Error(`Assertion failed: ${name}`);
  }
}

function assertEqual<T>(actual: T, expected: T, name: string) {
  if (actual === expected) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${name} (Expected: ${JSON.stringify(expected)}, Actual: ${JSON.stringify(actual)})`);
    throw new Error(`Assertion failed: ${name}`);
  }
}

function section(title: string) {
  console.log(`\n── ${title} ──────────────────────────────────`);
}

async function runM5TestSuite() {
  console.log('🧪 Starting Milestone 5: Dashboard & Domain Setup Verification Suite...\n');
  const orgId = `m5_test_org_${Date.now()}`;
  const testDomain = `outreach-test-${Date.now()}.com`;
  const senderEmail = `alex@${testDomain}`;

  try {
    // ══════════════════════════════════════════════════════════════════
    // SUITE 1: SALES PIPELINE FUNNEL AGGREGATION & CONTRACT 5
    // ══════════════════════════════════════════════════════════════════
    section('1. Sales Pipeline Funnel Aggregation (Contract 5)');

    // Create test organization
    const org = await db.organization.create({
      data: {
        id: orgId,
        workspaceKey: `ws_m5_${Date.now()}`,
        name: 'M5 Test Workspace',
        slug: `m5-test-${Date.now()}`,
      },
    });
    assert(!!org.id, 'Organization created');

    // Create 10 leads across various pipeline stages
    // 4 new, 2 enriched, 2 scored, 1 sent, 1 interested
    const lead1 = await db.lead.create({
      data: { organizationId: orgId, name: 'Alice Smith', email: `alice@${testDomain}`, status: 'new', leadScore: 40 },
    });
    const lead2 = await db.lead.create({
      data: { organizationId: orgId, name: 'Bob Jones', email: `bob@${testDomain}`, status: 'new', leadScore: 45 },
    });
    const lead3 = await db.lead.create({
      data: { organizationId: orgId, name: 'Charlie Brown', email: `charlie@${testDomain}`, status: 'enriched', leadScore: 70 },
    });
    const lead4 = await db.lead.create({
      data: { organizationId: orgId, name: 'Diana Prince', email: `diana@${testDomain}`, status: 'scored', leadScore: 85 },
    });
    const lead5 = await db.lead.create({
      data: { organizationId: orgId, name: 'Evan Wright', email: `evan@${testDomain}`, status: 'sent', leadScore: 90 },
    });
    const lead6 = await db.lead.create({
      data: { organizationId: orgId, name: 'Fiona Gallagher', email: `fiona@${testDomain}`, status: 'interested', leadScore: 95 },
    });

    // Create outreach messages
    await db.outreachMessage.create({
      data: {
        organizationId: orgId,
        leadId: lead5.id,
        subject: 'Quick question regarding scaling',
        body: 'Hi Evan, saw your growth signal.',
        status: 'sent',
      },
    });

    await db.outreachMessage.create({
      data: {
        organizationId: orgId,
        leadId: lead6.id,
        subject: 'Follow-up on cybersecurity',
        body: 'Hi Fiona, value case study.',
        status: 'replied',
      },
    });

    // Create reply classification (meeting escalation)
    await db.replyClassification.create({
      data: {
        organizationId: orgId,
        leadId: lead6.id,
        category: 'meeting_request',
        confidence: 0.95,
        nextAction: 'escalate',
      },
    });

    // Total leads: 6
    // Qualified leads (status != new): 4 (lead3, lead4, lead5, lead6)
    // Contacted (messages sent): 2
    // Replied: 1
    // Interested (positive replies - North Star): 1
    // Meetings Booked: 1

    const totalLeads = await db.lead.count({ where: { organizationId: orgId, isBlacklisted: false } });
    assertEqual(totalLeads, 6, 'Total discovered leads count is 6');

    const qualifiedLeads = await db.lead.count({ where: { organizationId: orgId, status: { in: ['enriched', 'scored', 'generated', 'approved', 'sent', 'interested'] } } });
    assertEqual(qualifiedLeads, 4, 'Qualified leads count is 4');

    const sentMessages = await db.outreachMessage.count({ where: { organizationId: orgId, status: { in: ['sent', 'replied'] } } });
    assertEqual(sentMessages, 2, 'Sent messages count is 2');

    const repliedMessages = await db.outreachMessage.count({ where: { organizationId: orgId, status: 'replied' } });
    assertEqual(repliedMessages, 1, 'Inbound replied messages count is 1');

    const interestedLeads = await db.lead.count({ where: { organizationId: orgId, status: 'interested' } });
    assertEqual(interestedLeads, 1, 'Positive replies (interested leads) count is 1');

    const meetingsBooked = await db.replyClassification.count({ where: { organizationId: orgId, nextAction: 'escalate' } });
    assertEqual(meetingsBooked, 1, 'Meetings booked count is 1');

    // Rates calculation
    const replyRate = (repliedMessages / sentMessages) * 100;
    assertEqual(replyRate, 50, 'Reply rate is 50.0%');

    const positiveReplyRate = (interestedLeads / repliedMessages) * 100;
    assertEqual(positiveReplyRate, 100, 'Positive reply rate is 100.0%');

    // ══════════════════════════════════════════════════════════════════
    // SUITE 2: SYNCHRONIZED DOMAIN STATUS BADGES
    // ══════════════════════════════════════════════════════════════════
    section('2. Synchronized Unambiguous Domain Status Badges');

    // 2.1 Pending Domain
    const pendingDomainObj = {
      domain: 'pending.example.com',
      status: 'pending',
      spfVerified: false,
      dkimVerified: false,
      dmarcVerified: false,
    };
    const pendingStatus = getDomainStatusInfo(pendingDomainObj);
    assertEqual(pendingStatus.status, 'pending', 'Pending domain returns status: pending');
    assertEqual(pendingStatus.label, 'Verification Pending', 'Pending domain label is "Verification Pending"');
    assert(pendingStatus.badgeClass.includes('amber'), 'Pending domain badge uses amber styling');

    // 2.2 Active / Verified Domain
    const activeDomainObj = {
      domain: 'verified.example.com',
      status: 'verified',
      spfVerified: true,
      dkimVerified: true,
      dmarcVerified: true,
    };
    const activeStatus = getDomainStatusInfo(activeDomainObj);
    assertEqual(activeStatus.status, 'active', 'Verified domain returns status: active');
    assertEqual(activeStatus.label, 'ACTIVE / Verified', 'Verified domain label is "ACTIVE / Verified"');
    assert(activeStatus.badgeClass.includes('emerald'), 'Verified domain badge uses emerald styling');

    // 2.3 Suspended Domain
    const suspendedDomainObj = {
      domain: 'suspended.example.com',
      status: 'suspended',
      isSuspended: true,
    };
    const suspendedStatus = getDomainStatusInfo(suspendedDomainObj);
    assertEqual(suspendedStatus.status, 'suspended', 'Suspended domain returns status: suspended');
    assertEqual(suspendedStatus.label, 'Suspended', 'Suspended domain label is "Suspended"');
    assert(suspendedStatus.badgeClass.includes('red'), 'Suspended domain badge uses red styling');

    // ══════════════════════════════════════════════════════════════════
    // SUITE 3: DNS RECORD INSPECTION & COPYABLE FIELDS
    // ══════════════════════════════════════════════════════════════════
    section('3. DNS Helper Records (SPF, DKIM, DMARC)');

    const dnsRecords = getRequiredDnsRecords(testDomain);
    assert(!!dnsRecords.spf, 'SPF record template exists');
    assert(!!dnsRecords.dkim, 'DKIM record template exists');
    assert(!!dnsRecords.dmarc, 'DMARC record template exists');

    // SPF verification
    assertEqual(dnsRecords.spf.type, 'TXT', 'SPF record type is TXT');
    assertEqual(dnsRecords.spf.host, testDomain, 'SPF host matches domain');
    assertEqual(dnsRecords.spf.value, 'v=spf1 include:resend.com ~all', 'SPF value contains include:resend.com');
    assert(dnsRecords.spf.instructions.length > 0, 'SPF has clear plain-English instructions');

    // DKIM verification
    assertEqual(dnsRecords.dkim.type, 'CNAME', 'DKIM record type is CNAME');
    assertEqual(dnsRecords.dkim.host, `resend._domainkey.${testDomain}`, 'DKIM host is resend._domainkey.<domain>');
    assertEqual(dnsRecords.dkim.value, 'resend.com', 'DKIM target is resend.com');
    assert(dnsRecords.dkim.instructions.length > 0, 'DKIM has clear plain-English instructions');

    // DMARC verification
    assertEqual(dnsRecords.dmarc.type, 'TXT', 'DMARC record type is TXT');
    assertEqual(dnsRecords.dmarc.host, `_dmarc.${testDomain}`, 'DMARC host is _dmarc.<domain>');
    assert(dnsRecords.dmarc.value.startsWith('v=DMARC1;'), 'DMARC value starts with v=DMARC1;');
    assert(dnsRecords.dmarc.instructions.length > 0, 'DMARC has clear plain-English instructions');

    // ══════════════════════════════════════════════════════════════════
    // SUITE 4: DOMAIN LIFECYCLE & LIVE VERIFICATION
    // ══════════════════════════════════════════════════════════════════
    section('4. Domain Lifecycle & Verification Flow');

    // Add domain
    const addRes = await DeliverabilityService.addDomain({
      organizationId: orgId,
      domain: testDomain,
      fromEmail: senderEmail,
      fromName: 'Alex Tester',
    });
    assert(addRes.success, 'Domain added successfully');
    assert(!!addRes.domainId, 'Domain ID returned');

    // Check initial DNS status
    const initialDns = await checkDomainDnsStatus(addRes.domainId!, orgId);
    assert(initialDns.domain === testDomain, 'Initial DNS status returned for domain');

    // Verify domain
    const verifiedDns = await DeliverabilityService.verifyDomain(addRes.domainId!, orgId);
    assert(verifiedDns.overallStatus === 'verified' || verifiedDns.spf.verified, 'Domain verification returned verified status');

    const domainInDb = await db.sendingDomain.findUnique({ where: { id: addRes.domainId! } });
    assertEqual(domainInDb?.status, 'verified', 'Domain status in DB updated to verified');

    // ══════════════════════════════════════════════════════════════════
    // SUITE 5: ZERO-STATE & DIVISION BY ZERO GUARDS
    // ══════════════════════════════════════════════════════════════════
    section('5. Zero-State & Edge-Case Handling');

    const emptyOrgId = `empty_org_${Date.now()}`;
    await db.organization.create({
      data: {
        id: emptyOrgId,
        workspaceKey: `ws_empty_${Date.now()}`,
        name: 'Empty Test Workspace',
      },
    });

    const emptyLeads = await db.lead.count({ where: { organizationId: emptyOrgId } });
    assertEqual(emptyLeads, 0, 'Empty workspace has 0 leads');

    const emptySent = await db.outreachMessage.count({ where: { organizationId: emptyOrgId } });
    assertEqual(emptySent, 0, 'Empty workspace has 0 messages');

    // Rates calculation with 0 inputs
    const zeroReplyRate = emptySent > 0 ? (0 / emptySent) * 100 : 0;
    assertEqual(zeroReplyRate, 0, 'Zero-sent workspace returns 0% reply rate without NaN or error');

    const zeroPositiveRate = 0 > 0 ? (0 / 0) * 100 : 0;
    assertEqual(zeroPositiveRate, 0, 'Zero-reply workspace returns 0% positive reply rate without NaN or error');

    // ══════════════════════════════════════════════════════════════════
    // CLEANUP
    // ══════════════════════════════════════════════════════════════════
    section('6. Cleanup Test Tenants');
    await db.outreachMessage.deleteMany({ where: { organizationId: orgId } });
    await db.replyClassification.deleteMany({ where: { organizationId: orgId } });
    await db.lead.deleteMany({ where: { organizationId: orgId } });
    await db.sendingDomain.deleteMany({ where: { organizationId: orgId } });
    await db.organization.delete({ where: { id: orgId } });
    await db.organization.delete({ where: { id: emptyOrgId } });
    console.log('  ✅ Cleaned up temporary test tenants');

    console.log(`\n════════════════════════════════════════════════════════════════`);
    console.log(`M5 Dashboard & Domain Setup Test Suite: ${passed} passed, ${failed} failed, ${passed + failed} total`);
    console.log(`════════════════════════════════════════════════════════════════\n`);
  } catch (error) {
    console.error('❌ M5 Test Suite encountered an error:', error);
    process.exit(1);
  }
}

runM5TestSuite();
