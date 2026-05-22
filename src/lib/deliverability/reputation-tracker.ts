// ─── Reputation Tracker — Domain Sending Reputation ────
// Monitors bounce rates, complaint rates, and calculates reputation scores

import { db } from '@/lib/db';

export interface ReputationScore {
  score: number;            // 0-100 (higher is better)
  level: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  factors: {
    bounceRate: { value: number; impact: number; label: string };
    complaintRate: { value: number; impact: number; label: string };
    openRate: { value: number; impact: number; label: string };
    clickRate: { value: number; impact: number; label: string };
  };
  shouldPause: boolean;
  pauseReason?: string;
  recommendation: string;
}

/**
 * Calculate the reputation score for a sending domain
 */
export async function calculateReputation(domainId: string): Promise<ReputationScore> {
  const domain = await db.sendingDomain.findUnique({ where: { id: domainId } });
  if (!domain) throw new Error(`Domain ${domainId} not found`);

  let score = 100; // Start at 100, deduct for issues

  // ─── Bounce Rate Impact ───
  const bounceRate = domain.totalSent > 0 ? domain.totalBounced / domain.totalSent : 0;
  let bounceImpact = 0;
  if (bounceRate > 0.10) { bounceImpact = -40; }
  else if (bounceRate > 0.05) { bounceImpact = -30; }
  else if (bounceRate > 0.03) { bounceImpact = -15; }
  else if (bounceRate > 0.02) { bounceImpact = -5; }
  else if (bounceRate < 0.01 && domain.totalSent > 50) { bounceImpact = 5; } // Bonus for very low bounce
  score += bounceImpact;

  // ─── Complaint Rate Impact ───
  const complaintRate = domain.totalSent > 0 ? domain.totalComplained / domain.totalSent : 0;
  let complaintImpact = 0;
  if (complaintRate > 0.01) { complaintImpact = -30; }
  else if (complaintRate > 0.005) { complaintImpact = -20; }
  else if (complaintRate > 0.001) { complaintImpact = -10; }
  else if (complaintRate < 0.0005 && domain.totalSent > 100) { complaintImpact = 5; }
  score += complaintImpact;

  // ─── Open Rate Impact ───
  const openRate = domain.totalDelivered > 0 ? domain.totalOpened / domain.totalDelivered : 0;
  let openImpact = 0;
  if (openRate > 0.30) { openImpact = 10; }
  else if (openRate > 0.20) { openImpact = 5; }
  else if (openRate > 0.10) { openImpact = 0; }
  else if (openRate < 0.05 && domain.totalSent > 50) { openImpact = -10; }
  score += openImpact;

  // ─── Click Rate Impact ───
  const clickRate = domain.totalDelivered > 0 ? domain.totalClicked / domain.totalDelivered : 0;
  let clickImpact = 0;
  if (clickRate > 0.05) { clickImpact = 5; }
  else if (clickRate > 0.02) { clickImpact = 3; }
  else if (clickRate < 0.005 && domain.totalSent > 50) { clickImpact = -5; }
  score += clickImpact;

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  // Determine level
  let level: ReputationScore['level'];
  if (score >= 85) level = 'excellent';
  else if (score >= 70) level = 'good';
  else if (score >= 50) level = 'fair';
  else if (score >= 30) level = 'poor';
  else level = 'critical';

  // Should we pause sending?
  const shouldPause = bounceRate > 0.10 || complaintRate > 0.01;
  const pauseReason = bounceRate > 0.10
    ? `Bounce rate critically high: ${(bounceRate * 100).toFixed(1)}% (threshold: 10%)`
    : complaintRate > 0.01
      ? `Complaint rate critically high: ${(complaintRate * 100).toFixed(2)}% (threshold: 1%)`
      : undefined;

  // Recommendation
  let recommendation: string;
  if (level === 'excellent') {
    recommendation = 'Domain reputation is excellent. Maintain current sending practices and continue warmup schedule.';
  } else if (level === 'good') {
    recommendation = 'Reputation is good. Monitor bounce rates closely and ensure email content is relevant.';
  } else if (level === 'fair') {
    recommendation = 'Reputation needs attention. Review email list quality, reduce sending volume, and improve personalization.';
  } else if (level === 'poor') {
    recommendation = 'Reputation is poor. Pause cold outreach, clean your email list, and focus on engaged contacts only.';
  } else {
    recommendation = 'CRITICAL: Stop sending immediately. Domain is at risk of being blacklisted. Audit entire email program.';
  }

  return {
    score,
    level,
    factors: {
      bounceRate: { value: bounceRate, impact: bounceImpact, label: bounceRate > 0.05 ? 'High bounce rate' : 'Acceptable bounce rate' },
      complaintRate: { value: complaintRate, impact: complaintImpact, label: complaintRate > 0.001 ? 'Elevated complaints' : 'Low complaint rate' },
      openRate: { value: openRate, impact: openImpact, label: openRate > 0.20 ? 'Strong engagement' : 'Needs improvement' },
      clickRate: { value: clickRate, impact: clickImpact, label: clickRate > 0.02 ? 'Good click engagement' : 'Low click rate' },
    },
    shouldPause,
    pauseReason,
    recommendation,
  };
}

/**
 * Record a daily reputation snapshot for trend tracking
 */
export async function recordDailySnapshot(domainId: string): Promise<void> {
  const domain = await db.sendingDomain.findUnique({ where: { id: domainId } });
  if (!domain) return;

  const today = new Date().toISOString().split('T')[0];

  // Get today's events from the EmailEvent table
  const todayStart = new Date(today);
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  const events = await db.emailEvent.findMany({
    where: {
      domainId,
      createdAt: { gte: todayStart, lt: todayEnd },
    },
  });

  const sent = events.filter(e => e.eventType === 'sent').length;
  const delivered = events.filter(e => e.eventType === 'delivered').length;
  const bounced = events.filter(e => e.eventType === 'bounced').length;
  const opened = events.filter(e => e.eventType === 'opened').length;
  const clicked = events.filter(e => e.eventType === 'clicked').length;
  const complained = events.filter(e => e.eventType === 'complained').length;

  // Get reply and positive reply counts
  const replied = events.filter(e => e.eventType === 'replied').length;
  const positiveReplies = await db.replyClassification.count({
    where: {
      createdAt: { gte: todayStart, lt: todayEnd },
      category: 'interested',
    },
  });

  // Calculate rates
  const deliveryRate = sent > 0 ? delivered / sent : 0;
  const bounceRate = sent > 0 ? bounced / sent : 0;
  const openRate = delivered > 0 ? opened / delivered : 0;
  const clickRate = opened > 0 ? clicked / opened : 0;
  const complaintRate = sent > 0 ? complained / sent : 0;
  const replyRate = delivered > 0 ? replied / delivered : 0;
  const positiveReplyRate = replied > 0 ? positiveReplies / replied : 0;

  // Calculate reputation score
  const reputation = await calculateReputation(domainId);

  // Upsert the daily snapshot
  await db.reputationSnapshot.upsert({
    where: { domainId_date: { domainId, date: today } },
    create: {
      domainId,
      date: today,
      emailsSent: sent,
      emailsDelivered: delivered,
      emailsBounced: bounced,
      emailsOpened: opened,
      emailsClicked: clicked,
      emailsComplained: complained,
      emailsUnsubscribed: events.filter(e => e.eventType === 'unsubscribed').length,
      deliveryRate,
      bounceRate,
      openRate,
      clickRate,
      complaintRate,
      replyRate,
      positiveReplyRate,
      reputationScore: reputation.score,
    },
    update: {
      emailsSent: sent,
      emailsDelivered: delivered,
      emailsBounced: bounced,
      emailsOpened: opened,
      emailsClicked: clicked,
      emailsComplained: complained,
      emailsUnsubscribed: events.filter(e => e.eventType === 'unsubscribed').length,
      deliveryRate,
      bounceRate,
      openRate,
      clickRate,
      complaintRate,
      replyRate,
      positiveReplyRate,
      reputationScore: reputation.score,
    },
  });

  // Update the domain's reputation score
  await db.sendingDomain.update({
    where: { id: domainId },
    data: { reputationScore: reputation.score },
  });
}

/**
 * Get reputation trend over time
 */
export async function getReputationTrend(domainId: string, days: number = 30): Promise<Array<{
  date: string;
  reputationScore: number;
  deliveryRate: number;
  bounceRate: number;
  openRate: number;
  replyRate: number;
}>> {
  const snapshots = await db.reputationSnapshot.findMany({
    where: { domainId },
    orderBy: { date: 'desc' },
    take: days,
  });

  return snapshots.map(s => ({
    date: s.date,
    reputationScore: s.reputationScore,
    deliveryRate: s.deliveryRate,
    bounceRate: s.bounceRate,
    openRate: s.openRate,
    replyRate: s.replyRate,
  }));
}

/**
 * Check if sending should be paused for a domain
 */
export async function shouldPauseSending(domainId: string): Promise<{ pause: boolean; reason?: string }> {
  const reputation = await calculateReputation(domainId);
  if (reputation.shouldPause) {
    return { pause: true, reason: reputation.pauseReason };
  }
  return { pause: false };
}
