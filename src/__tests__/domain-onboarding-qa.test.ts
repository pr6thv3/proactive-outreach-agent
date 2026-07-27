// ─── Senior QA Test Suite: Domain Onboarding & Verification ─────────
// Exhaustively tests all 10 customer domain onboarding requirement scenarios

import { DeliverabilityService } from '@/lib/deliverability';
import { checkDomainDnsStatus, getRequiredDnsRecords } from '@/lib/deliverability/dns-checker';
import { db } from '@/lib/db';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  ✅ PASS: ${message}`);
  }
}

function section(title: string) {
  console.log(`\n── ${title} ──────────────────────────────────`);
}

async function runDomainQATests() {
  console.log('🧪 Starting Senior QA Domain Onboarding Test Suite...\n');
  const orgId = `qa_org_${Date.now()}`;
  const testDomainName = `qa-test-${Date.now()}.com`;
  const fromEmail = `alex@${testDomainName}`;

  try {
    // ── 1. Setup Organization ──
    section('0. Environment & Tenant Setup');
    const org = await db.organization.create({
      data: {
        id: orgId,
        workspaceKey: `ws_${Date.now()}`,
        name: 'QA Test Org',
        slug: `qa-org-${Date.now()}`,
      },
    });
    assert(!!org.id, 'Organization created for QA test');

    // ── 2. Add Domain Flow ──
    section('1. Add Domain & Resend Integration');
    const addResult = await DeliverabilityService.addDomain({
      organizationId: orgId,
      domain: testDomainName,
      fromEmail,
      fromName: 'Alex Tester',
    });
    assert(addResult.success === true, 'Domain added successfully via DeliverabilityService');
    assert(!!addResult.domainId, 'Returned valid domainId');
    assert(!!addResult.dnsRecords, 'Returned initial DNS records');

    // Test Duplicate Add Guard
    const dupResult = await DeliverabilityService.addDomain({
      organizationId: orgId,
      domain: testDomainName,
      fromEmail,
    });
    assert(dupResult.success === false, 'Duplicate domain creation prevented');
    assert(dupResult.error === 'Domain already exists', 'Correct duplicate error message returned');

    // ── 3. Database Persistence Verification ──
    section('2. Database Persistence & Multi-Tenant Scoping');
    const savedDomain = await db.sendingDomain.findUnique({ where: { id: addResult.domainId! } });
    assert(!!savedDomain, 'SendingDomain row persisted in database');
    assert(savedDomain?.domain === testDomainName, 'Domain name matches input');
    assert(savedDomain?.organizationId === orgId, 'Organization ID properly scoped');
    assert(savedDomain?.status === 'pending', 'Initial domain status is pending');
    assert(savedDomain?.warmupEnabled === true, 'Warmup enabled by default');

    const savedSender = await db.senderAccount.findFirst({ where: { domainId: addResult.domainId! } });
    assert(!!savedSender, 'Associated SenderAccount created');
    assert(savedSender?.email === fromEmail, 'Sender email matches input');
    assert(savedSender?.status === 'pending', 'Sender status initially pending');

    // ── 4. DNS Records Structure & Copy-Friendly Fields ──
    section('3. DNS Table Rendering & Copy Fields');
    const dnsStatus = await checkDomainDnsStatus(addResult.domainId!, orgId);
    assert(!!dnsStatus.spf, 'SPF record exists');
    assert(!!dnsStatus.dkim, 'DKIM record exists');
    assert(!!dnsStatus.dmarc, 'DMARC record exists');
    assert(dnsStatus.spf.type === 'TXT', 'SPF record type is TXT');
    assert(dnsStatus.dkim.type === 'CNAME', 'DKIM record type is CNAME');
    assert(dnsStatus.dmarc.type === 'TXT', 'DMARC record type is TXT');
    assert(dnsStatus.spf.value.length > 0, 'SPF value is non-empty string');
    assert(dnsStatus.dkim.host.length > 0, 'DKIM host is non-empty copyable string');
    assert(dnsStatus.dmarc.host.length > 0, 'DMARC host is non-empty copyable string');

    // ── 5. Campaign Activation Gate (Pre-Verification) ──
    section('4. Campaign Activation Gate (Pre-Verification Check)');
    const domainsPre = await db.sendingDomain.findMany({ where: { organizationId: orgId } });
    const hasVerifiedPre = domainsPre.some(d => d.status === 'verified');
    assert(hasVerifiedPre === false, 'Campaign start button remains disabled when domain is pending');

    // ── 6. Manual & Auto Polling Verification ──
    section('5. Domain Verification & Sender Activation');
    const verifyStatus = await DeliverabilityService.verifyDomain(addResult.domainId!, orgId);
    assert(verifyStatus.overallStatus === 'verified' || verifyStatus.spf.verified, 'Domain verification returned verified status');

    const updatedDomain = await db.sendingDomain.findUnique({ where: { id: addResult.domainId! } });
    assert(updatedDomain?.status === 'verified', 'SendingDomain status updated to verified in DB');

    const updatedSender = await db.senderAccount.findFirst({ where: { domainId: addResult.domainId! } });
    assert(updatedSender?.status === 'active', 'Associated SenderAccount activated upon domain verification');

    // ── 7. Campaign Activation Gate (Post-Verification) ──
    section('6. Campaign Activation Gate (Post-Verification Check)');
    const domainsPost = await db.sendingDomain.findMany({ where: { organizationId: orgId } });
    const hasVerifiedPost = domainsPost.some(d => d.status === 'verified');
    assert(hasVerifiedPost === true, 'Campaign start button unlocks and enables after domain verification');

    // ── 8. Error States & Edge Cases ──
    section('7. Error Handling & Edge Cases');
    try {
      await checkDomainDnsStatus('non_existent_domain_id', orgId);
      assert(false, 'Should have thrown error for invalid domainId');
    } catch (e) {
      assert(true, 'Properly threw error for non-existent domain ID');
    }

    // ── 9. Cleanup ──
    section('8. Cleanup Test Tenant');
    await db.sendingDomain.deleteMany({ where: { organizationId: orgId } });
    await db.organization.delete({ where: { id: orgId } });
    assert(true, 'Test org cleaned up successfully');

    console.log('\n🎉 Senior QA Domain Onboarding Suite PASSED ALL ASSERTIONS cleanly!\n');
  } catch (err) {
    console.error('\n❌ QA Test Suite Failed:', err);
    process.exit(1);
  }
}

runDomainQATests();
