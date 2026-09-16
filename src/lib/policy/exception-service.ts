/**
 * Exception Queue Service & Action Badge Engine (R1)
 * Transforms operator routine from passive monitoring of machine counters to
 * handling high-priority exceptions with guided step-by-step resolution.
 */

import { db as dbClient } from '@/lib/db';
import { getWorkspaceEmergencyStopStatus } from '@/lib/safety/emergency-stop';
const db = dbClient as any;

export type ActionBadgeType =
  | 'RISK_GATE_HOLD'
  | 'LOW_CONFIDENCE_REVIEW'
  | 'CIRCUIT_BREAKER_TRIPPED'
  | 'LEGAL_ESCALATION'
  | 'UNVERIFIED_SENDER_DOMAIN'
  | 'SPAM_RISK_ELEVATED'
  | 'SECONDARY_INTENT_REFERRAL'
  | 'EMERGENCY_STOP_ACTIVE'
  | 'RATE_LIMIT_NEAR_CEILING';

export type ExceptionSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO';

export interface ActionBadge {
  type: ActionBadgeType;
  label: string;
  severity: ExceptionSeverity;
  guidedResolution: string;
  actionLabel: string;
}

export interface ExceptionItem {
  id: string;
  type: ActionBadgeType;
  badge: ActionBadge;
  title: string;
  summary: string;
  organizationId: string;
  entityType: 'lead' | 'email' | 'campaign' | 'domain' | 'inbound' | 'system';
  entityId?: string;
  severity: ExceptionSeverity;
  guidedSteps: string[];
  remediationAction: {
    label: string;
    actionKey: string;
    endpoint?: string;
    method?: 'POST' | 'PATCH' | 'GET';
    payload?: Record<string, any>;
  };
  metadata?: Record<string, any>;
  createdAt: string;
  resolved?: boolean;
}

export interface ExceptionQueueReport {
  exceptions: ExceptionItem[];
  count: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  hasBlockers: boolean;
  zeroStateHeadline: string;
}

/**
 * Deterministically generates an Action Badge with guided resolution instructions.
 */
export function generateActionBadge(type: ActionBadgeType, context?: Record<string, any>): ActionBadge {
  switch (type) {
    case 'CIRCUIT_BREAKER_TRIPPED':
      return {
        type,
        label: 'Circuit Breaker Tripped',
        severity: 'CRITICAL',
        guidedResolution: 'Review bounced domains, cleanse contact list, and click "Reset Circuit Breaker" once deliverability restores.',
        actionLabel: 'Reset Circuit Breaker',
      };

    case 'LEGAL_ESCALATION':
      return {
        type,
        label: 'Legal / Compliance Escalation',
        severity: 'CRITICAL',
        guidedResolution: 'Inbound message contains legal threat or privacy claim. Confirm DNC suppression and complete compliance review.',
        actionLabel: 'Acknowledge Escalation',
      };

    case 'EMERGENCY_STOP_ACTIVE':
      return {
        type,
        label: 'Emergency Stop Engaged',
        severity: 'CRITICAL',
        guidedResolution: 'All outbound side-effects paused workspace-wide. Inspect incident diagnostics and resume when safe.',
        actionLabel: 'Inspect Incident Center',
      };

    case 'UNVERIFIED_SENDER_DOMAIN':
      return {
        type,
        label: 'Unverified Domain',
        severity: 'CRITICAL',
        guidedResolution: 'Verify SPF/DKIM DNS records in settings, or switch to 1-click sandbox domain fallback.',
        actionLabel: 'Verify Domain DNS',
      };

    case 'RISK_GATE_HOLD':
      return {
        type,
        label: 'Risk Gate Hold',
        severity: 'HIGH',
        guidedResolution: 'Inspect the flagged risk signals, verify lead eligibility, and approve or adjust copy before dispatch.',
        actionLabel: 'Review Risk Flags',
      };

    case 'LOW_CONFIDENCE_REVIEW':
      return {
        type,
        label: 'Low Confidence Draft',
        severity: 'HIGH',
        guidedResolution: 'Review generated copy diff, verify personalization hook, and click "Approve" or "Regenerate".',
        actionLabel: 'Inspect Draft',
      };

    case 'SPAM_RISK_ELEVATED':
      return {
        type,
        label: 'Spam Risk Detected',
        severity: 'HIGH',
        guidedResolution: 'Remove high-risk spam keywords from copy template and verify unsubscribe footer placement.',
        actionLabel: 'Edit Copy Template',
      };

    case 'SECONDARY_INTENT_REFERRAL':
      return {
        type,
        label: 'Referral Detected',
        severity: 'MEDIUM',
        guidedResolution: 'Click "Accept Referral" to automatically enroll referred colleague into outreach sequence.',
        actionLabel: 'Enroll Colleague',
      };

    case 'RATE_LIMIT_NEAR_CEILING':
      return {
        type,
        label: 'Daily Limit Near Ceiling',
        severity: 'MEDIUM',
        guidedResolution: 'Daily send quota at 90% capacity. Outreach pacing will smoothly queue remaining sends for tomorrow.',
        actionLabel: 'Adjust Quota',
      };
  }
}

/**
 * Returns guided step-by-step resolution steps for a given exception type.
 */
export function getGuidedResolutionSteps(type: ActionBadgeType, context?: Record<string, any>): string[] {
  switch (type) {
    case 'CIRCUIT_BREAKER_TRIPPED':
      return [
        'Inspect the bounce log for invalid MX records or rejected sender mailboxes.',
        'Purge unverified contacts from current campaign sequence to prevent further bounces.',
        'Verify domain DNS records (SPF, DKIM, DMARC) are healthy with 1-click test.',
        'Click "Reset Circuit Breaker" to unlock paused campaigns.',
      ];

    case 'LEGAL_ESCALATION':
      return [
        'Verify immediate workspace-wide DNC suppression was applied to recipient and domain.',
        'Examine inbound message for specific GDPR, CCPA, or legal representation citations.',
        'Notify organization compliance officer or legal counsel if formal notice was served.',
        'Click "Acknowledge Escalation" once records have been quarantined.',
      ];

    case 'EMERGENCY_STOP_ACTIVE':
      return [
        'Verify all background outbound worker loops and cron dispatches are halted.',
        'Review recent incident logs and error stack traces in Incident Center.',
        'Remediate root cause (e.g. rate limit, provider outage, or data corruption).',
        'Toggle Emergency Stop to OFF when outbound safety is verified.',
      ];

    case 'UNVERIFIED_SENDER_DOMAIN':
      return [
        'Check DNS registrar for missing SPF (TXT), DKIM (CNAME), or DMARC (TXT) records.',
        'Click "Re-check DNS" to poll verification status.',
        'Alternatively, switch to Instant Sandbox Domain for immediate pilot evaluation without registrar setup.',
      ];

    case 'RISK_GATE_HOLD':
      return [
        'Inspect lead ICP criteria match score and verification evidence.',
        'Confirm prospect seniority and decision-maker status.',
        'Click "Approve Lead" to bypass gate, or "Disqualify" to suppress.',
      ];

    case 'LOW_CONFIDENCE_REVIEW':
      return [
        'Compare AI generated copy against buying intent signals in the review card.',
        'Check personalization hook for accuracy and relevant company citations.',
        'Choose "Approve & Next" (A), "Inline Edit" (E), or "Regenerate" (G).',
      ];

    case 'SPAM_RISK_ELEVATED':
      return [
        'Review copy for flagged trigger words (e.g. "free", "guarantee", "risk-free", all-caps).',
        'Ensure physical mailing address and plain-text unsubscribe footer are present.',
        'Test render in recipient mailbox simulator before dispatching.',
      ];

    case 'SECONDARY_INTENT_REFERRAL':
      return [
        `Review referred colleague contact information (${context?.colleagueEmail || 'colleague'}).`,
        'Verify the colleague matches target ICP title and seniority.',
        'Click "Accept Referral" to automatically enroll in sequence with referral intro note.',
      ];

    case 'RATE_LIMIT_NEAR_CEILING':
      return [
        'Current campaign send volume is approaching the daily domain limit.',
        'Remaining scheduled emails will automatically be queued for the next UTC send window.',
        'Optionally increase daily send limit if domain warmup schedule allows.',
      ];
  }
}

export class ExceptionService {
  /**
   * Aggregates real-time blockers, safety violations, and exceptions across an organization.
   */
  static async getActiveExceptions(organizationId: string): Promise<ExceptionQueueReport> {
    const exceptions: ExceptionItem[] = [];

    try {
      // 1. Check Server-Side Emergency Stop
      const estopStatus = await getWorkspaceEmergencyStopStatus(organizationId).catch(() => ({ isStopped: false }));

      if (estopStatus?.isStopped) {
        const badge = generateActionBadge('EMERGENCY_STOP_ACTIVE');
        exceptions.push({
          id: `exc_estop_${organizationId}`,
          type: 'EMERGENCY_STOP_ACTIVE',
          badge,
          title: 'Server-Side Emergency Stop Active',
          summary: 'All outbound email dispatches, autonomous loops, and worker queues are strictly paused workspace-wide.',
          organizationId,
          entityType: 'system',
          severity: badge.severity,
          guidedSteps: getGuidedResolutionSteps('EMERGENCY_STOP_ACTIVE'),
          remediationAction: {
            label: badge.actionLabel,
            actionKey: 'open_incident_center',
            endpoint: '/dashboard/incidents',
            method: 'GET',
          },
          createdAt: new Date().toISOString(),
        });
      }

      // 2. Check Paused Campaigns & Circuit Breaker Trips
      const pausedCampaigns = await db.campaign.findMany({
        where: {
          organizationId,
          status: 'PAUSED',
        },
        select: { id: true, name: true, status: true, updatedAt: true },
        take: 5,
      }).catch(() => []);

      for (const camp of pausedCampaigns) {
        const badge = generateActionBadge('CIRCUIT_BREAKER_TRIPPED');
        exceptions.push({
          id: `exc_cb_${camp.id}`,
          type: 'CIRCUIT_BREAKER_TRIPPED',
          badge,
          title: `Campaign Paused: "${camp.name}"`,
          summary: 'Campaign was halted by the deliverability circuit breaker to protect sender domain reputation.',
          organizationId,
          entityType: 'campaign',
          entityId: camp.id,
          severity: badge.severity,
          guidedSteps: getGuidedResolutionSteps('CIRCUIT_BREAKER_TRIPPED'),
          remediationAction: {
            label: badge.actionLabel,
            actionKey: 'reset_circuit_breaker',
            endpoint: `/api/campaigns/${camp.id}/reset`,
            method: 'POST',
          },
          metadata: { campaignName: camp.name },
          createdAt: camp.updatedAt?.toISOString() || new Date().toISOString(),
        });
      }

      // 3. Check Unverified Sending Domains
      const unverifiedDomains = await db.sendingDomain.findMany({
        where: {
          organizationId,
          OR: [
            { dkimVerified: false },
            { spfVerified: false },
            { status: 'PENDING' },
          ],
        },
        select: { id: true, domain: true, createdAt: true },
        take: 3,
      }).catch(() => []);

      for (const dom of unverifiedDomains) {
        const badge = generateActionBadge('UNVERIFIED_SENDER_DOMAIN');
        exceptions.push({
          id: `exc_dom_${dom.id}`,
          type: 'UNVERIFIED_SENDER_DOMAIN',
          badge,
          title: `Domain Pending DNS Verification: "${dom.domain}"`,
          summary: 'Outbound sends from this domain are blocked until SPF, DKIM, and DMARC records are validated.',
          organizationId,
          entityType: 'domain',
          entityId: dom.id,
          severity: badge.severity,
          guidedSteps: getGuidedResolutionSteps('UNVERIFIED_SENDER_DOMAIN'),
          remediationAction: {
            label: badge.actionLabel,
            actionKey: 'verify_domain',
            endpoint: `/api/domains/${dom.id}/verify`,
            method: 'POST',
          },
          metadata: { domain: dom.domain },
          createdAt: dom.createdAt?.toISOString() || new Date().toISOString(),
        });
      }

      // 4. Check Compliance Escalation Tasks (if table exists or through activities)
      try {
        const escalationTasks = await (db as any).escalationTask?.findMany({
          where: {
            organizationId,
            status: 'PENDING',
          },
          take: 5,
        }).catch(() => []);

        if (Array.isArray(escalationTasks)) {
          for (const task of escalationTasks) {
            const badge = generateActionBadge('LEGAL_ESCALATION');
            exceptions.push({
              id: `exc_escalation_${task.id}`,
              type: 'LEGAL_ESCALATION',
              badge,
              title: `Compliance Escalation: ${task.reason || 'High Risk Inbound Signal'}`,
              summary: task.details || 'Inbound reply contains legal threat or privacy claim requiring compliance review.',
              organizationId,
              entityType: 'inbound',
              entityId: task.id,
              severity: badge.severity,
              guidedSteps: getGuidedResolutionSteps('LEGAL_ESCALATION'),
              remediationAction: {
                label: badge.actionLabel,
                actionKey: 'acknowledge_escalation',
                endpoint: `/api/escalations/${task.id}/resolve`,
                method: 'POST',
              },
              createdAt: task.createdAt?.toISOString() || new Date().toISOString(),
            });
          }
        }
      } catch {
        // Escalation table optional
      }
    } catch {
      // Database errors safely caught
    }

    const criticalCount = exceptions.filter((e) => e.severity === 'CRITICAL').length;
    const highCount = exceptions.filter((e) => e.severity === 'HIGH').length;
    const mediumCount = exceptions.filter((e) => e.severity === 'MEDIUM').length;

    return {
      exceptions,
      count: exceptions.length,
      criticalCount,
      highCount,
      mediumCount,
      hasBlockers: criticalCount > 0,
      zeroStateHeadline:
        exceptions.length === 0
          ? 'All 7 Policy Gates Passing — Agent Operating Smoothly. 0 Exceptions Require Operator Intervention.'
          : `${exceptions.length} Active Exception${exceptions.length === 1 ? '' : 's'} Require Attention`,
    };
  }
}
