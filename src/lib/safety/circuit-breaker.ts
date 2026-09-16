// ─── DELIVERABILITY CIRCUIT BREAKER (SAFETY LAYER) ──────────────────
// Non-negotiable deliverability guardrail (R3).
// Customer-configurable thresholds per organization and campaign.
// Prevents domain reputation destruction by halting outreach when
// bounce rate, spam complaint rate, or unsubscribe rate exceed thresholds.
// ───────────────────────────────────────────────────────────────────

import { db } from '@/lib/db';

export interface CircuitBreakerThresholds {
  bounceRateThreshold: number;      // Default: 0.03 (3%)
  complaintRateThreshold: number;   // Default: 0.001 (0.1%)
  unsubscribeRateThreshold: number; // Default: 0.02 (2%)
}

export interface CircuitBreakerEvaluationResult {
  triggered: boolean;
  status: 'pass' | 'warn' | 'block';
  reason?: string;
  metrics: {
    bounceRate: number;
    complaintRate: number;
    unsubscribeRate: number;
  };
  thresholds: CircuitBreakerThresholds;
  source: 'campaign' | 'organization' | 'default';
  details: {
    bounceExceeded: boolean;
    complaintExceeded: boolean;
    unsubscribeExceeded: boolean;
  };
}

export const DEFAULT_CIRCUIT_BREAKER_THRESHOLDS: CircuitBreakerThresholds = {
  bounceRateThreshold: 0.03,     // 3.0%
  complaintRateThreshold: 0.001,  // 0.1%
  unsubscribeRateThreshold: 0.02, // 2.0%
};

// In-memory store for customer organization overrides during runtime / tests
const orgThresholdStore = new Map<string, Partial<CircuitBreakerThresholds>>();

/**
 * Reset stored thresholds for test isolation.
 */
export function resetCircuitBreakerForTesting(): void {
  orgThresholdStore.clear();
}

/**
 * Configure deliverability circuit breaker thresholds for an organization.
 */
export async function setOrganizationCircuitBreakerThresholds(
  orgId: string,
  thresholds: Partial<CircuitBreakerThresholds>
): Promise<CircuitBreakerThresholds> {
  if (!orgId) throw new Error('organizationId is required');

  const existing = orgThresholdStore.get(orgId) || {};
  const updated = {
    ...existing,
    ...thresholds,
  };

  orgThresholdStore.set(orgId, updated);

  try {
    await db.circuitBreakerConfig.upsert({
      where: { organizationId: orgId },
      update: {
        bounceRateThreshold: updated.bounceRateThreshold,
        complaintRateThreshold: updated.complaintRateThreshold,
        unsubscribeRateThreshold: updated.unsubscribeRateThreshold,
      },
      create: {
        organizationId: orgId,
        bounceRateThreshold: updated.bounceRateThreshold,
        complaintRateThreshold: updated.complaintRateThreshold,
        unsubscribeRateThreshold: updated.unsubscribeRateThreshold,
      },
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[CircuitBreaker] Failed to persist config to DB, in-memory updated:', err);
    }
  }

  return {
    bounceRateThreshold: updated.bounceRateThreshold ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLDS.bounceRateThreshold,
    complaintRateThreshold: updated.complaintRateThreshold ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLDS.complaintRateThreshold,
    unsubscribeRateThreshold: updated.unsubscribeRateThreshold ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLDS.unsubscribeRateThreshold,
  };
}

/**
 * Retrieve configured circuit breaker thresholds for an organization.
 */
export async function getOrganizationCircuitBreakerThresholds(
  orgId: string
): Promise<Partial<CircuitBreakerThresholds> | null> {
  if (!orgId) return null;

  if (orgThresholdStore.has(orgId)) {
    return orgThresholdStore.get(orgId)!;
  }

  try {
    const record = await db.circuitBreakerConfig.findFirst({
      where: { organizationId: orgId },
    });
    if (record) {
      const thresholds: Partial<CircuitBreakerThresholds> = {};
      if (record.bounceRateThreshold !== null && record.bounceRateThreshold !== undefined) {
        thresholds.bounceRateThreshold = Number(record.bounceRateThreshold);
      }
      if (record.complaintRateThreshold !== null && record.complaintRateThreshold !== undefined) {
        thresholds.complaintRateThreshold = Number(record.complaintRateThreshold);
      }
      if (record.unsubscribeRateThreshold !== null && record.unsubscribeRateThreshold !== undefined) {
        thresholds.unsubscribeRateThreshold = Number(record.unsubscribeRateThreshold);
      }
      orgThresholdStore.set(orgId, thresholds);
      return thresholds;
    }
  } catch {
    // Fall back to memory
  }

  return null;
}

/**
 * Resolve hierarchical thresholds:
 * Campaign override (if explicitly customized) -> Organization override -> Platform baseline default
 */
export async function resolveCircuitBreakerThresholds(
  orgId: string,
  campaignId?: string
): Promise<{ thresholds: CircuitBreakerThresholds; source: 'campaign' | 'organization' | 'default' }> {
  // Fetch organization configuration first to evaluate inheritance
  const orgConfig = await getOrganizationCircuitBreakerThresholds(orgId);

  // 1. Check Campaign override
  if (campaignId) {
    try {
      const campaign = await db.campaign.findFirst({
        where: { id: campaignId, organizationId: orgId },
      });

      if (campaign) {
        // A campaign threshold is only treated as an explicit override if it is defined AND:
        // - It differs from the default baseline, OR
        // - The organization has no custom threshold configured for that metric
        const hasCampaignBounce =
          campaign.bounceRatePauseThreshold !== null &&
          campaign.bounceRatePauseThreshold !== undefined &&
          (orgConfig?.bounceRateThreshold === undefined ||
            Number(campaign.bounceRatePauseThreshold) !== DEFAULT_CIRCUIT_BREAKER_THRESHOLDS.bounceRateThreshold);

        const hasCampaignComplaint =
          campaign.complaintRatePauseThreshold !== null &&
          campaign.complaintRatePauseThreshold !== undefined &&
          (orgConfig?.complaintRateThreshold === undefined ||
            Number(campaign.complaintRatePauseThreshold) !== DEFAULT_CIRCUIT_BREAKER_THRESHOLDS.complaintRateThreshold);

        const hasCampaignUnsub =
          campaign.unsubscribeRatePauseThreshold !== null &&
          campaign.unsubscribeRatePauseThreshold !== undefined &&
          (orgConfig?.unsubscribeRateThreshold === undefined ||
            Number(campaign.unsubscribeRatePauseThreshold) !== DEFAULT_CIRCUIT_BREAKER_THRESHOLDS.unsubscribeRateThreshold);

        if (hasCampaignBounce || hasCampaignComplaint || hasCampaignUnsub) {
          return {
            thresholds: {
              bounceRateThreshold: hasCampaignBounce
                ? Number(campaign.bounceRatePauseThreshold)
                : (orgConfig?.bounceRateThreshold ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLDS.bounceRateThreshold),
              complaintRateThreshold: hasCampaignComplaint
                ? Number(campaign.complaintRatePauseThreshold)
                : (orgConfig?.complaintRateThreshold ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLDS.complaintRateThreshold),
              unsubscribeRateThreshold: hasCampaignUnsub
                ? Number(campaign.unsubscribeRatePauseThreshold)
                : (orgConfig?.unsubscribeRateThreshold ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLDS.unsubscribeRateThreshold),
            },
            source: 'campaign',
          };
        }
      }
    } catch {
      // Fall through to org
    }
  }

  // 2. Check Organization override
  if (orgConfig && Object.keys(orgConfig).length > 0) {
    return {
      thresholds: {
        bounceRateThreshold: orgConfig.bounceRateThreshold ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLDS.bounceRateThreshold,
        complaintRateThreshold: orgConfig.complaintRateThreshold ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLDS.complaintRateThreshold,
        unsubscribeRateThreshold: orgConfig.unsubscribeRateThreshold ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLDS.unsubscribeRateThreshold,
      },
      source: 'organization',
    };
  }

  // 3. Platform Defaults
  return {
    thresholds: { ...DEFAULT_CIRCUIT_BREAKER_THRESHOLDS },
    source: 'default',
  };
}

/**
 * Evaluates deliverability circuit breaker against resolved thresholds.
 */
export async function evaluateCircuitBreaker(params: {
  organizationId: string;
  domainId?: string;
  campaignId?: string;
  metricsOverride?: Partial<{ bounceRate: number; complaintRate: number; unsubscribeRate: number }>;
}): Promise<CircuitBreakerEvaluationResult> {
  const { organizationId, campaignId, domainId, metricsOverride } = params;

  const { thresholds, source } = await resolveCircuitBreakerThresholds(organizationId, campaignId);

  // Compute metrics (use metricsOverride if provided, otherwise compute from domain/campaign events)
  let bounceRate = metricsOverride?.bounceRate ?? 0;
  let complaintRate = metricsOverride?.complaintRate ?? 0;
  let unsubscribeRate = metricsOverride?.unsubscribeRate ?? 0;

  if (!metricsOverride && (domainId || campaignId)) {
    try {
      const filter: any = { organizationId };
      if (campaignId) filter.campaignId = campaignId;
      if (domainId) filter.domainId = domainId;

      const [sent, bounced, complained, unsubscribed] = await Promise.all([
        db.emailEvent.count({ where: { ...filter, eventType: 'sent' } }).catch(() => 0),
        db.emailEvent.count({ where: { ...filter, eventType: 'bounced' } }).catch(() => 0),
        db.emailEvent.count({ where: { ...filter, eventType: 'complained' } }).catch(() => 0),
        db.emailEvent.count({ where: { ...filter, eventType: 'unsubscribed' } }).catch(() => 0),
      ]);

      if (sent > 0) {
        bounceRate = bounced / sent;
        complaintRate = complained / sent;
        unsubscribeRate = unsubscribed / sent;
      }
    } catch {
      // Keep defaults
    }
  }

  const bounceExceeded = bounceRate >= thresholds.bounceRateThreshold;
  const complaintExceeded = complaintRate >= thresholds.complaintRateThreshold;
  const unsubscribeExceeded = unsubscribeRate >= thresholds.unsubscribeRateThreshold;

  const triggered = bounceExceeded || complaintExceeded || unsubscribeExceeded;

  let status: 'pass' | 'warn' | 'block' = 'pass';
  let reason: string | undefined;

  if (triggered) {
    status = 'block';
    const violations: string[] = [];
    if (bounceExceeded) {
      violations.push(
        `Bounce rate ${(bounceRate * 100).toFixed(2)}% exceeds threshold ${(thresholds.bounceRateThreshold * 100).toFixed(2)}%`
      );
    }
    if (complaintExceeded) {
      violations.push(
        `Spam complaint rate ${(complaintRate * 100).toFixed(3)}% exceeds threshold ${(thresholds.complaintRateThreshold * 100).toFixed(3)}%`
      );
    }
    if (unsubscribeExceeded) {
      violations.push(
        `Unsubscribe rate ${(unsubscribeRate * 100).toFixed(2)}% exceeds threshold ${(thresholds.unsubscribeRateThreshold * 100).toFixed(2)}%`
      );
    }
    reason = `Circuit breaker triggered (${source} thresholds): ${violations.join('; ')}`;
  } else {
    // Check warning thresholds (e.g. 75% of threshold)
    const bounceWarn = bounceRate >= thresholds.bounceRateThreshold * 0.75;
    const complaintWarn = complaintRate >= thresholds.complaintRateThreshold * 0.75;
    const unsubWarn = unsubscribeRate >= thresholds.unsubscribeRateThreshold * 0.75;

    if (bounceWarn || complaintWarn || unsubWarn) {
      status = 'warn';
      reason = 'Metrics approaching circuit breaker thresholds';
    }
  }

  return {
    triggered,
    status,
    reason,
    metrics: { bounceRate, complaintRate, unsubscribeRate },
    thresholds,
    source,
    details: {
      bounceExceeded,
      complaintExceeded,
      unsubscribeExceeded,
    },
  };
}
