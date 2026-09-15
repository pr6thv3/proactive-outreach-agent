// ─── OPERATIONAL INCIDENT CENTER SERVICE ─────────────────────────
// Milestone 4 (R4): Aggregates real-time failures, domain status,
// circuit-breaker triggers, and provides structured 1-click remediation.
// ─────────────────────────────────────────────────────────────────

import { db } from '@/lib/db';

export interface IncidentReport {
  id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'DELIVERABILITY' | 'DOMAIN' | 'QUEUE' | 'PROVIDER' | 'AUTHENTICATION' | 'WEBHOOK';
  title: string;
  whatHappened: string;
  whyItHappened: string;
  whatSystemTried: string;
  whatIsBlocked: string;
  remediationAction: {
    label: string;
    actionEndpoint: string;
    method: 'POST' | 'GET';
  };
  detectedAt: string;
}

export class IncidentCenterService {
  /**
   * Scans the system for active incidents across domains, queues, and deliverability.
   */
  static async getActiveIncidents(organizationId: string): Promise<{
    hasIncidents: boolean;
    incidentCount: number;
    incidents: IncidentReport[];
  }> {
    const incidents: IncidentReport[] = [];

    // 1. Check for unverified or failing sending domains
    try {
      const domains = await db.sendingDomain.findMany({
        where: { organizationId },
      });

      for (const domain of domains) {
        if (!domain.dkimVerified || !domain.spfVerified) {
          incidents.push({
            id: `inc_dom_${domain.id}`,
            severity: 'HIGH',
            category: 'DOMAIN',
            title: `Sending Domain '${domain.domain}' DNS Incomplete`,
            whatHappened: 'Domain DNS records have not propagated or are misconfigured.',
            whyItHappened: `DKIM verified: ${domain.dkimVerified ? 'YES' : 'NO'}, SPF verified: ${domain.spfVerified ? 'YES' : 'NO'}.`,
            whatSystemTried: 'Queried public DNS resolvers and Resend domain verification endpoint.',
            whatIsBlocked: `Outbound email delivery is blocked from @${domain.domain} to prevent instant spam filtering.`,
            remediationAction: {
              label: 'Re-Verify DNS Records',
              actionEndpoint: `/api/sending-domains/${domain.id}/verify`,
              method: 'POST',
            },
            detectedAt: domain.updatedAt.toISOString(),
          });
        }
      }
    } catch {
      // Domain model optional in test mode
    }

    // 2. Check for paused campaigns or circuit-breaker trips
    try {
      const pausedCampaigns = await db.campaign.findMany({
        where: { organizationId, status: 'PAUSED' },
      });

      for (const camp of pausedCampaigns) {
        incidents.push({
          id: `inc_camp_${camp.id}`,
          severity: 'CRITICAL',
          category: 'DELIVERABILITY',
          title: `Campaign '${camp.name}' Paused by Circuit Breaker`,
          whatHappened: 'Campaign outbound pacing was automatically halted.',
          whyItHappened: 'Bounce rate or spam complaint rate crossed safety thresholds (e.g. >= 3.0% bounce).',
          whatSystemTried: '7-Gate pre-send circuit breaker activated emergency killswitch.',
          whatIsBlocked: 'All scheduled follow-ups and new outreach for this campaign are frozen.',
          remediationAction: {
            label: 'Inspect Bounce Logs & Resume',
            actionEndpoint: `/api/campaigns/${camp.id}/start`,
            method: 'POST',
          },
          detectedAt: camp.updatedAt.toISOString(),
        });
      }
    } catch {
      // Campaign model optional
    }

    // 3. Fallback healthy state if zero issues
    return {
      hasIncidents: incidents.length > 0,
      incidentCount: incidents.length,
      incidents,
    };
  }
}
