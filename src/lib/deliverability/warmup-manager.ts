// ─── Warmup Manager — 30-Day Domain Warmup Schedule ────
// Gradual ramp-up to build sender reputation and avoid spam filters

import { db } from '@/lib/db';

// Warmup schedule: day → max daily sends
const WARMUP_SCHEDULE: Record<number, number> = {
  1: 5, 2: 5, 3: 5,       // Days 1-3:   5 emails/day
  4: 10, 5: 10, 6: 10, 7: 10,  // Days 4-7:   10 emails/day
  8: 20, 9: 20, 10: 20, 11: 20, 12: 20, 13: 20, 14: 20, // Days 8-14:  20 emails/day
  15: 40, 16: 40, 17: 40, 18: 40, 19: 40, 20: 40, 21: 40, // Days 15-21: 40 emails/day
  22: 75, 23: 75, 24: 75, 25: 75, 26: 75, 27: 75, 28: 75, // Days 22-28: 75 emails/day
};

const WARMUP_COMPLETE_DAY = 29;

export interface WarmupStatus {
  domainId: string;
  domain: string;
  enabled: boolean;
  currentDay: number;
  dailyLimit: number;
  sentToday: number;
  remaining: number;
  isComplete: boolean;
  progress: number; // 0-1
  nextMilestone: { day: number; limit: number };
  isPaused: boolean;
  pauseReason?: string;
}

/**
 * Get the warmup status for a domain
 */
export async function getWarmupStatus(domainId: string, organizationId?: string): Promise<WarmupStatus> {
  const domain = await db.sendingDomain.findFirst({
    where: { id: domainId, ...(organizationId ? { organizationId } : {}) },
  });
  if (!domain) throw new Error(`Domain ${domainId} not found`);

  const today = new Date().toISOString().split('T')[0];

  // Advance warmup day if a new day has started
  if (domain.dailySendsDate !== today) {
    // It's a new day — advance the warmup counter
    const daysSinceStart = domain.warmupDay > 0
      ? domain.warmupDay + 1
      : 1;

    await db.sendingDomain.updateMany({
      where: { id: domainId, ...(organizationId ? { organizationId } : {}) },
      data: {
        warmupDay: daysSinceStart,
        dailySendsCount: 0,
        dailySendsDate: today,
      },
    });

    domain.warmupDay = daysSinceStart;
    domain.dailySendsCount = 0;
    domain.dailySendsDate = today;
  }

  const currentDay = domain.warmupDay;
  const isComplete = currentDay >= WARMUP_COMPLETE_DAY;
  const dailyLimit = isComplete
    ? 0 // No limit after warmup (use campaign settings)
    : (WARMUP_SCHEDULE[currentDay] || WARMUP_SCHEDULE[WARMUP_COMPLETE_DAY - 1] || 75);
  const sentToday = domain.dailySendsCount || 0;
  const remaining = isComplete ? Infinity : Math.max(0, dailyLimit - sentToday);

  // Find next milestone
  let nextMilestone = { day: WARMUP_COMPLETE_DAY, limit: 0 };
  if (!isComplete) {
    for (let d = currentDay + 1; d <= WARMUP_COMPLETE_DAY; d++) {
      const limit = WARMUP_SCHEDULE[d] || 0;
      if (limit > dailyLimit) {
        nextMilestone = { day: d, limit };
        break;
      }
    }
  }

  // Check if paused due to high bounce/complaint rates
  const isPaused = domain.bounceRate > 0.05 || domain.complaintRate > 0.001;
  const pauseReason = domain.bounceRate > 0.05
    ? `Bounce rate too high (${(domain.bounceRate * 100).toFixed(1)}% > 5%)`
    : domain.complaintRate > 0.001
      ? `Complaint rate too high (${(domain.complaintRate * 100).toFixed(2)}% > 0.1%)`
      : undefined;

  // Calculate progress (0-1)
  const progress = Math.min(1, currentDay / WARMUP_COMPLETE_DAY);

  return {
    domainId,
    domain: domain.domain,
    enabled: domain.warmupEnabled,
    currentDay,
    dailyLimit,
    sentToday,
    remaining: remaining === Infinity ? -1 : remaining,
    isComplete,
    progress,
    nextMilestone,
    isPaused,
    pauseReason,
  };
}

/**
 * Check if a domain can send more emails today
 */
export async function canSendMore(domainId: string, organizationId?: string): Promise<{ allowed: boolean; remaining: number; reason?: string }> {
  const status = await getWarmupStatus(domainId, organizationId);

  if (status.isPaused) {
    return { allowed: false, remaining: 0, reason: `Warmup paused: ${status.pauseReason}` };
  }

  if (!status.enabled) {
    // Warmup not enabled — no domain-level limit
    return { allowed: true, remaining: -1 };
  }

  if (status.isComplete) {
    return { allowed: true, remaining: -1 }; // No limit after warmup
  }

  const remaining = Math.max(0, status.dailyLimit - status.sentToday);
  return {
    allowed: remaining > 0,
    remaining,
    reason: remaining === 0 ? `Daily warmup limit reached (${status.dailyLimit}/day on day ${status.currentDay})` : undefined,
  };
}

/**
 * Increment the send count for a domain today
 */
export async function incrementDomainSendCount(domainId: string, organizationId?: string): Promise<void> {
  const domain = await db.sendingDomain.findFirst({
    where: { id: domainId, ...(organizationId ? { organizationId } : {}) },
  });
  if (!domain) return;

  const today = new Date().toISOString().split('T')[0];
  const count = domain.dailySendsDate === today ? (domain.dailySendsCount || 0) + 1 : 1;

  await db.sendingDomain.updateMany({
    where: { id: domainId, ...(organizationId ? { organizationId } : {}) },
    data: { dailySendsCount: count, dailySendsDate: today },
  });
}

/**
 * Update domain aggregate metrics after an email event
 */
export async function updateDomainMetrics(domainId: string, event: 'sent' | 'delivered' | 'bounced' | 'opened' | 'clicked' | 'complained', organizationId?: string): Promise<void> {
  const domain = await db.sendingDomain.findFirst({
    where: { id: domainId, ...(organizationId ? { organizationId } : {}) },
  });
  if (!domain) return;

  const updates: Record<string, number> = {};
  switch (event) {
    case 'sent': updates.totalSent = domain.totalSent + 1; break;
    case 'delivered': updates.totalDelivered = domain.totalDelivered + 1; break;
    case 'bounced': updates.totalBounced = domain.totalBounced + 1; break;
    case 'opened': updates.totalOpened = domain.totalOpened + 1; break;
    case 'clicked': updates.totalClicked = domain.totalClicked + 1; break;
    case 'complained': updates.totalComplained = domain.totalComplained + 1; break;
  }

  // Recalculate rates
  const totalSent = (updates.totalSent ?? domain.totalSent) || 1;
  const totalDelivered = (updates.totalDelivered ?? domain.totalDelivered) || 1;

  const newMetrics: Record<string, number> = {};
  newMetrics.bounceRate = ((updates.totalBounced ?? domain.totalBounced) / totalSent);
  newMetrics.complaintRate = ((updates.totalComplained ?? domain.totalComplained) / totalSent);
  newMetrics.openRate = ((updates.totalOpened ?? domain.totalOpened) / totalDelivered);
  newMetrics.clickRate = ((updates.totalClicked ?? domain.totalClicked) / totalDelivered);

  await db.sendingDomain.updateMany({
    where: { id: domainId, ...(organizationId ? { organizationId } : {}) },
    data: { ...updates, ...newMetrics },
  });
}

/**
 * Get the full warmup schedule for display
 */
export function getWarmupSchedule(): Array<{ days: string; limit: number; phase: string }> {
  return [
    { days: '1-3', limit: 5, phase: 'Crawl' },
    { days: '4-7', limit: 10, phase: 'Walk' },
    { days: '8-14', limit: 20, phase: 'Jog' },
    { days: '15-21', limit: 40, phase: 'Run' },
    { days: '22-28', limit: 75, phase: 'Sprint' },
    { days: '29+', limit: -1, phase: 'Full Capacity' },
  ];
}

/**
 * Reset warmup for a domain (use with caution)
 */
export async function resetWarmup(domainId: string, organizationId?: string): Promise<void> {
  await db.sendingDomain.updateMany({
    where: { id: domainId, ...(organizationId ? { organizationId } : {}) },
    data: {
      warmupDay: 0,
      warmupDailyLimit: 5,
      dailySendsCount: 0,
      dailySendsDate: null,
    },
  });
}
