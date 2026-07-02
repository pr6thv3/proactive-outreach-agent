import { db } from '@/lib/db';

export interface CircuitBreakerStatus {
  triggered: boolean;
  status: 'pass' | 'warn' | 'block';
  reason?: string;
  metrics: {
    bounceRate: number;
    complaintRate: number;
    unsubscribeRate: number;
  };
  thresholds: {
    bounceRate: number;
    complaintRate: number;
    unsubscribeRate: number;
  };
  details: {
    bounceExceeded: boolean;
    complaintExceeded: boolean;
    unsubscribeExceeded: boolean;
  };
}

/**
 * Checks the circuit breaker status for a given domain and optionally campaign.
 * Calculates bounce, complaint, and unsubscribe rates, comparing them to thresholds.
 */
export async function checkCircuitBreaker(params: {
  domainId: string;
  campaignId?: string;
  organizationId: string;
}): Promise<CircuitBreakerStatus> {
  const { domainId, campaignId, organizationId } = params;

  // 1. Resolve thresholds (campaign-specific or defaults)
  const thresholds = {
    bounceRate: 0.03, // 3%
    complaintRate: 0.001, // 0.1%
    unsubscribeRate: 0.02, // 2%
  };

  const campaign = campaignId
    ? await db.campaign.findFirst({ where: { id: campaignId, organizationId } })
    : null;

  if (campaign) {
    if (campaign.bounceRatePauseThreshold !== null && campaign.bounceRatePauseThreshold !== undefined) {
      thresholds.bounceRate = campaign.bounceRatePauseThreshold;
    }
    if (campaign.complaintRatePauseThreshold !== null && campaign.complaintRatePauseThreshold !== undefined) {
      thresholds.complaintRate = campaign.complaintRatePauseThreshold;
    }
    if (campaign.unsubscribeRatePauseThreshold !== null && campaign.unsubscribeRatePauseThreshold !== undefined) {
      thresholds.unsubscribeRate = campaign.unsubscribeRatePauseThreshold;
    }
  }

  // Warning thresholds are lower than block thresholds (2/3 of block for bounce/unsub, 1/2 for complaint)
  const warningThresholds = {
    bounceRate: thresholds.bounceRate * (2 / 3),
    complaintRate: thresholds.complaintRate * 0.5,
    unsubscribeRate: thresholds.unsubscribeRate * 0.75,
  };

  // 2. Fetch email events to calculate actual metrics
  const sentCount = await db.emailEvent.count({
    where: { domainId, eventType: 'sent', organizationId },
  });
  const bouncedCount = await db.emailEvent.count({
    where: { domainId, eventType: 'bounced', organizationId },
  });
  const complainedCount = await db.emailEvent.count({
    where: { domainId, eventType: 'complained', organizationId },
  });
  const unsubscribedCount = await db.emailEvent.count({
    where: { domainId, eventType: 'unsubscribed', organizationId },
  });

  const domain = await db.sendingDomain.findFirst({
    where: { id: domainId, organizationId },
  });

  // Apply fallback to domain totals if no live email events are present in this run
  let domainSent = sentCount;
  let domainBounced = bouncedCount;
  let domainComplained = complainedCount;
  let domainUnsubscribed = unsubscribedCount;

  if (domainSent === 0 && domain) {
    domainSent = domain.totalSent > 0 ? domain.totalSent : domain.dailySendsCount;
    domainBounced = domain.totalBounced;
    domainComplained = domain.totalComplained;

    // Retrieve unsubscribes from snapshots as fallback since unsubscribed isn't directly on SendingDomain
    const snapshots = await db.reputationSnapshot.findMany({
      where: { domainId, organizationId },
    });
    if (snapshots.length > 0) {
      const snapshotUnsubscribed = snapshots.reduce((sum, s) => sum + s.emailsUnsubscribed, 0);
      domainUnsubscribed = snapshotUnsubscribed > 0 ? snapshotUnsubscribed : domainUnsubscribed;
      
      const snapshotSent = snapshots.reduce((sum, s) => sum + s.emailsSent, 0);
      if (domainSent === 0 && snapshotSent > 0) {
        domainSent = snapshotSent;
        domainBounced = snapshots.reduce((sum, s) => sum + s.emailsBounced, 0);
        domainComplained = snapshots.reduce((sum, s) => sum + s.emailsComplained, 0);
      }
    }
  }

  const domainBounceRate = domainSent > 0 ? domainBounced / domainSent : 0;
  const domainComplaintRate = domainSent > 0 ? domainComplained / domainSent : 0;
  const domainUnsubscribeRate = domainSent > 0 ? domainUnsubscribed / domainSent : 0;

  // 3. Calculate campaign rates if campaignId is present
  let campaignSent = 0;
  let campaignBounced = 0;
  let campaignComplained = 0;
  let campaignUnsubscribed = 0;

  if (campaignId) {
    const campaignSentCount = await db.emailEvent.count({
      where: { campaignId, eventType: 'sent', organizationId },
    });
    const campaignBouncedCount = await db.emailEvent.count({
      where: { campaignId, eventType: 'bounced', organizationId },
    });
    const campaignComplainedCount = await db.emailEvent.count({
      where: { campaignId, eventType: 'complained', organizationId },
    });
    const campaignUnsubscribedCount = await db.emailEvent.count({
      where: { campaignId, eventType: 'unsubscribed', organizationId },
    });

    campaignSent = campaignSentCount;
    campaignBounced = campaignBouncedCount;
    campaignComplained = campaignComplainedCount;
    campaignUnsubscribed = campaignUnsubscribedCount;

    // Fallback: check OutreachMessages for campaign stats if no events are recorded
    if (campaignSent === 0) {
      const campaignMessages = await db.outreachMessage.findMany({
        where: { campaignId, organizationId },
        select: { status: true, bouncedAt: true, unsubFooter: true },
      });
      if (campaignMessages.length > 0) {
        campaignSent = campaignMessages.filter(m => ['sent', 'delivered'].includes(m.status) || m.bouncedAt !== null).length;
        campaignBounced = campaignMessages.filter(m => m.bouncedAt !== null).length;
        // Approximation: if unsubFooter is used, count those that might have unsubscribed if status indicates
        campaignUnsubscribed = campaignMessages.filter(m => m.unsubFooter !== null && m.status === 'unsubscribed').length;
      }
    }
  }

  const campaignBounceRate = campaignSent > 0 ? campaignBounced / campaignSent : 0;
  const campaignComplaintRate = campaignSent > 0 ? campaignComplained / campaignSent : 0;
  const campaignUnsubscribeRate = campaignSent > 0 ? campaignUnsubscribed / campaignSent : 0;

  // Determine final rates evaluated (pessimistic approach: max of domain-level or campaign-level rates)
  const bounceRate = Math.max(domainBounceRate, campaignBounceRate);
  const complaintRate = Math.max(domainComplaintRate, campaignComplaintRate);
  const unsubscribeRate = Math.max(domainUnsubscribeRate, campaignUnsubscribeRate);

  // Check against thresholds
  const bounceExceeded = bounceRate >= thresholds.bounceRate;
  const complaintExceeded = complaintRate >= thresholds.complaintRate;
  const unsubscribeExceeded = unsubscribeRate >= thresholds.unsubscribeRate;

  // Check warnings
  const bounceWarning = bounceRate >= warningThresholds.bounceRate && !bounceExceeded;
  const complaintWarning = complaintRate >= warningThresholds.complaintRate && !complaintExceeded;
  const unsubscribeWarning = unsubscribeRate >= warningThresholds.unsubscribeRate && !unsubscribeExceeded;

  const triggered = bounceExceeded || complaintExceeded || unsubscribeExceeded;
  const warning = bounceWarning || complaintWarning || unsubscribeWarning;

  let status: 'pass' | 'warn' | 'block' = 'pass';
  if (triggered) {
    status = 'block';
  } else if (warning) {
    status = 'warn';
  }

  let reason: string | undefined;
  if (triggered) {
    const reasons: string[] = [];
    if (bounceExceeded) reasons.push(`bounce rate ${(bounceRate * 100).toFixed(1)}% exceeds threshold ${(thresholds.bounceRate * 100).toFixed(1)}%`);
    if (complaintExceeded) reasons.push(`complaint rate ${(complaintRate * 100).toFixed(2)}% exceeds threshold ${(thresholds.complaintRate * 100).toFixed(2)}%`);
    if (unsubscribeExceeded) reasons.push(`unsubscribe rate ${(unsubscribeRate * 100).toFixed(1)}% exceeds threshold ${(thresholds.unsubscribeRate * 100).toFixed(1)}%`);
    reason = `Circuit breaker triggered: ${reasons.join(', ')}.`;
  } else if (warning) {
    const warnings: string[] = [];
    if (bounceWarning) warnings.push(`bounce rate ${(bounceRate * 100).toFixed(1)}% is elevated (threshold ${(warningThresholds.bounceRate * 100).toFixed(1)}%)`);
    if (complaintWarning) warnings.push(`complaint rate ${(complaintRate * 100).toFixed(2)}% is elevated (threshold ${(warningThresholds.complaintRate * 100).toFixed(2)}%)`);
    if (unsubscribeWarning) warnings.push(`unsubscribe rate ${(unsubscribeRate * 100).toFixed(1)}% is elevated (threshold ${(warningThresholds.unsubscribeRate * 100).toFixed(1)}%)`);
    reason = `Deliverability warning: ${warnings.join(', ')}.`;
  }

  // 4. Handle auto-pausing/suspending as specified in deliverability gates
  try {
    if (triggered) {
      if ((bounceExceeded || unsubscribeExceeded) && campaignId && campaign && campaign.status !== 'paused') {
        await db.campaign.update({
          where: { id: campaignId },
          data: {
            status: 'paused',
            pausedReason: `Circuit breaker triggered: ${reason}`,
          },
        });
      }

      if (complaintExceeded && domain && domain.status !== 'suspended') {
        await db.sendingDomain.update({
          where: { id: domainId },
          data: {
            status: 'suspended',
          },
        });
      }
    }
  } catch (err) {
    // Graceful error logging for read-only or mock database environments
    console.error('[CircuitBreaker] Failed to update campaign/domain status during trigger:', err);
  }

  return {
    triggered,
    status,
    reason,
    metrics: { bounceRate, complaintRate, unsubscribeRate },
    thresholds,
    details: {
      bounceExceeded,
      complaintExceeded,
      unsubscribeExceeded,
    },
  };
}
