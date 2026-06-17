// ─── DNS Checker — SPF/DKIM/DMARC Verification ────────
// Provides DNS record templates and checks verification via Resend API

import { getResendDomainStatus, isResendConfigured } from './resend-client';
import { db } from '@/lib/db';

export interface DnsRecordStatus {
  type: 'TXT' | 'CNAME' | 'MX';
  host: string;
  value: string;
  verified: boolean;
  instructions: string;
}

export interface DomainDnsStatus {
  domain: string;
  spf: DnsRecordStatus;
  dkim: DnsRecordStatus;
  dmarc: DnsRecordStatus;
  overallStatus: 'verified' | 'partial' | 'not_configured' | 'pending';
  resendDomainId?: string;
}

/**
 * Get DNS records that need to be configured for a domain
 * These are the records the user needs to add to their DNS provider
 */
export function getRequiredDnsRecords(domain: string): { spf: DnsRecordStatus; dkim: DnsRecordStatus; dmarc: DnsRecordStatus } {
  return {
    spf: {
      type: 'TXT',
      host: domain,
      value: 'v=spf1 include:resend.com ~all',
      verified: false,
      instructions: `Add a TXT record to your DNS:\n  Host: ${domain}\n  Value: v=spf1 include:resend.com ~all\n  TTL: 3600`,
    },
    dkim: {
      type: 'CNAME',
      host: `resend._domainkey.${domain}`,
      value: 'resend.com',
      verified: false,
      instructions: `Add a CNAME record to your DNS:\n  Host: resend._domainkey.${domain}\n  Value: resend.com\n  TTL: 3600\n\nNote: If your DNS provider doesn't support CNAME at root, use TXT record instead.`,
    },
    dmarc: {
      type: 'TXT',
      host: `_dmarc.${domain}`,
      value: 'v=DMARC1; p=none; rua=mailto:dmarc@resend.com',
      verified: false,
      instructions: `Add a TXT record to your DNS:\n  Host: _dmarc.${domain}\n  Value: v=DMARC1; p=none; rua=mailto:dmarc@resend.com\n  TTL: 3600\n\nStart with p=none (monitor mode), then upgrade to p=quarantine or p=reject once you're confident.`,
    },
  };
}

/**
 * Check the DNS verification status of a domain
 * Uses Resend's API to verify, plus our internal DB tracking
 */
export async function checkDomainDnsStatus(domainId: string, organizationId?: string): Promise<DomainDnsStatus> {
  const domain = await db.sendingDomain.findFirst({
    where: { id: domainId, ...(organizationId ? { organizationId } : {}) },
  });
  if (!domain) {
    throw new Error(`Domain ${domainId} not found`);
  }

  const requiredRecords = getRequiredDnsRecords(domain.domain);

  // Try to get live verification status from Resend
  if (isResendConfigured() && domain.apiKeyRef) {
    const resendStatus = await getResendDomainStatus(domain.apiKeyRef);
    if (resendStatus) {
      // Cast to access dynamic properties from Resend domain response
      const statusData = resendStatus as unknown as Record<string, unknown>;
      
      // Parse records array if available
      const records = statusData.records as Array<{
        record: string;
        name: string;
        type: string;
        value: string;
        status: string;
      }> | undefined;

      if (Array.isArray(records)) {
        const spf = records.find(r => r.record === 'SPF' && r.type === 'TXT');
        const dkim = records.find(r => r.record === 'DKIM');
        const dmarc = records.find(r => r.record === 'DMARC' || r.name?.includes('_dmarc'));

        if (spf) {
          requiredRecords.spf.value = spf.value;
          requiredRecords.spf.host = spf.name;
          requiredRecords.spf.verified = spf.status === 'verified';
          requiredRecords.spf.instructions = `Add a TXT record to your DNS:\n  Host: ${spf.name}\n  Value: ${spf.value}\n  Status: ${spf.status}`;
        }
        if (dkim) {
          requiredRecords.dkim.value = dkim.value;
          requiredRecords.dkim.host = dkim.name;
          requiredRecords.dkim.verified = dkim.status === 'verified';
          requiredRecords.dkim.instructions = `Add a CNAME record to your DNS:\n  Host: ${dkim.name}\n  Value: ${dkim.value}\n  Status: ${dkim.status}`;
        }
        if (dmarc) {
          requiredRecords.dmarc.value = dmarc.value;
          requiredRecords.dmarc.host = dmarc.name;
          requiredRecords.dmarc.verified = dmarc.status === 'verified';
          requiredRecords.dmarc.instructions = `Add a TXT record to your DNS:\n  Host: ${dmarc.name}\n  Value: ${dmarc.value}\n  Status: ${dmarc.status}`;
        }
      }

      // Check legacy/status fields if records parser didn't match
      const spfData = statusData.spf as Record<string, string> | undefined;
      const dkimData = statusData.dkim as Record<string, string> | undefined;
      const dmarcData = statusData.dmarc as Record<string, string> | undefined;

      if (spfData?.status === 'verified') {
        requiredRecords.spf.verified = true;
      }
      if (dkimData?.status === 'verified') {
        requiredRecords.dkim.verified = true;
      }
      if (dmarcData?.status === 'verified') {
        requiredRecords.dmarc.verified = true;
      }
    }
  }

  // Also check our DB-tracked verification status
  if (domain.spfVerified) requiredRecords.spf.verified = true;
  if (domain.dkimVerified) requiredRecords.dkim.verified = true;
  if (domain.dmarcVerified) requiredRecords.dmarc.verified = true;

  const allVerified = requiredRecords.spf.verified && requiredRecords.dkim.verified && requiredRecords.dmarc.verified;
  const someVerified = requiredRecords.spf.verified || requiredRecords.dkim.verified || requiredRecords.dmarc.verified;

  let overallStatus: DomainDnsStatus['overallStatus'];
  if (allVerified) {
    overallStatus = 'verified';
  } else if (someVerified) {
    overallStatus = 'partial';
  } else if (domain.status === 'pending') {
    overallStatus = 'pending';
  } else {
    overallStatus = 'not_configured';
  }

  // Persist updated records and verification status to database
  await db.sendingDomain.updateMany({
    where: { id: domainId },
    data: {
      spfRecord: requiredRecords.spf.value,
      spfVerified: requiredRecords.spf.verified,
      spfStatus: requiredRecords.spf.verified ? 'verified' : 'pending',
      dkimRecord: requiredRecords.dkim.value,
      dkimVerified: requiredRecords.dkim.verified,
      dkimStatus: requiredRecords.dkim.verified ? 'verified' : 'pending',
      dmarcRecord: requiredRecords.dmarc.value,
      dmarcVerified: requiredRecords.dmarc.verified,
      dmarcStatus: requiredRecords.dmarc.verified ? 'verified' : 'pending',
      status: allVerified ? 'verified' : (someVerified ? 'verifying' : domain.status),
      lastDnsCheckAt: new Date(),
      ...(allVerified ? { lastVerifiedAt: new Date() } : {}),
    },
  });

  return {
    domain: domain.domain,
    spf: requiredRecords.spf,
    dkim: requiredRecords.dkim,
    dmarc: requiredRecords.dmarc,
    overallStatus,
    resendDomainId: domain.apiKeyRef || undefined,
  };
}

/**
 * Update domain DNS verification status in DB
 */
export async function updateDomainDnsStatus(
  domainId: string,
  status: { spfVerified?: boolean; dkimVerified?: boolean; dmarcVerified?: boolean },
  organizationId?: string,
): Promise<void> {
  const updates: Record<string, unknown> = { lastDnsCheckAt: new Date() };
  if (status.spfVerified !== undefined) updates.spfVerified = status.spfVerified;
  if (status.dkimVerified !== undefined) updates.dkimVerified = status.dkimVerified;
  if (status.dmarcVerified !== undefined) updates.dmarcVerified = status.dmarcVerified;

  // If all verified, update domain status
  if (status.spfVerified && status.dkimVerified && status.dmarcVerified) {
    updates.status = 'verified';
    updates.lastVerifiedAt = new Date();
  }

  await db.sendingDomain.updateMany({
    where: { id: domainId, ...(organizationId ? { organizationId } : {}) },
    data: updates,
  });
}
