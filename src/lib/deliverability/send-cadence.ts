// ─── Send Cadence — Randomized Timing for Deliverability ─
// Prevents spam filters by adding natural delays and jitter

export interface SendSchedule {
  messageId: string;
  scheduledAt: Date;
  position: number;  // Position in the batch
}

export interface SendWindow {
  startHour: number;  // 0-23
  endHour: number;    // 0-23
  days: number[];     // 0=Sun, 1=Mon, ..., 6=Sat
}

// Optimal send windows (business hours in recipient's timezone)
const DEFAULT_SEND_WINDOWS: SendWindow[] = [
  { startHour: 8, endHour: 11, days: [2, 3, 4] },   // Tue-Thu 8-11am (best)
  { startHour: 9, endHour: 12, days: [1, 5] },       // Mon, Fri 9-12pm (good)
  { startHour: 13, endHour: 15, days: [2, 3, 4] },   // Tue-Thu 1-3pm (decent)
];

/**
 * Calculate a randomized delay between sends
 * Base: 30-120 seconds, with ±15% jitter
 */
export function calculateSendDelay(position: number, _total: number): number {
  // Base delay increases slightly with position
  const baseDelay = 30 + Math.min(position * 5, 90); // 30s to 120s

  // Add jitter: ±15%
  const jitter = baseDelay * 0.15 * (Math.random() * 2 - 1);

  return Math.round((baseDelay + jitter) * 1000); // Return in milliseconds
}

/**
 * Calculate delay between batches of emails
 * 2-5 minutes between batches of 5
 */
export function calculateBatchDelay(batchIndex: number): number {
  const baseMinutes = 2 + Math.random() * 3; // 2-5 minutes
  const jitter = baseMinutes * 0.1 * (Math.random() * 2 - 1);
  return Math.round((baseMinutes + jitter) * 60 * 1000); // Return in ms
}

/**
 * Get the optimal send time for a lead based on their timezone
 * Returns the next best time to send
 */
export function getOptimalSendTime(recipientTimezone?: string): Date {
  const now = new Date();

  // Default to UTC if no timezone provided
  const tz = recipientTimezone || 'UTC';

  try {
    // Get current time in recipient's timezone
    const recipientNow = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const currentHour = recipientNow.getHours();
    const currentDay = recipientNow.getDay();

    // Find the next available send window
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const checkDay = (currentDay + dayOffset) % 7;

      for (const window of DEFAULT_SEND_WINDOWS) {
        if (!window.days.includes(checkDay)) continue;

        let sendHour: number;
        if (dayOffset === 0 && currentHour < window.endHour) {
          // Today — use the next available hour in the window
          sendHour = Math.max(currentHour + 1, window.startHour);
          if (sendHour >= window.endHour) continue;
        } else if (dayOffset > 0) {
          // Future day — use the start of the window
          sendHour = window.startHour;
        } else {
          continue;
        }

        // Calculate the target date
        const targetDate = new Date(recipientNow);
        targetDate.setDate(targetDate.getDate() + dayOffset);
        targetDate.setHours(sendHour, Math.floor(Math.random() * 30), Math.floor(Math.random() * 60), 0);

        return targetDate;
      }
    }
  } catch {
    // Timezone lookup failed, fall through to default
  }

  // Fallback: send tomorrow at 9am UTC
  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(9, Math.floor(Math.random() * 30), 0, 0);
  return fallback;
}

/**
 * Create a sending schedule for a batch of messages
 * Ensures proper spacing, respects warmup limits, and adds jitter
 */
export function scheduleSends(
  messageIds: string[],
  dailyLimit: number,
  alreadySentToday: number = 0,
): SendSchedule[] {
  const schedules: SendSchedule[] = [];
  const remainingQuota = Math.max(0, dailyLimit - alreadySentToday);
  const toSchedule = messageIds.slice(0, remainingQuota);

  let cumulativeDelay = 0;

  for (let i = 0; i < toSchedule.length; i++) {
    // First email can go immediately
    if (i === 0) {
      schedules.push({
        messageId: toSchedule[i],
        scheduledAt: new Date(Date.now() + 5000), // 5s from now
        position: i,
      });
      continue;
    }

    // Add delay between emails
    const batchPosition = i % 5;
    if (batchPosition === 0 && i > 0) {
      // New batch — add batch delay
      cumulativeDelay += calculateBatchDelay(Math.floor(i / 5));
    }

    // Add individual email delay
    cumulativeDelay += calculateSendDelay(i, toSchedule.length);

    schedules.push({
      messageId: toSchedule[i],
      scheduledAt: new Date(Date.now() + cumulativeDelay),
      position: i,
    });
  }

  return schedules;
}

/**
 * Check if current time is within a good send window
 */
export function isInSendWindow(timezone?: string): boolean {
  const now = new Date();
  const tz = timezone || 'UTC';

  try {
    const recipientNow = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const currentHour = recipientNow.getHours();
    const currentDay = recipientNow.getDay();

    return DEFAULT_SEND_WINDOWS.some(
      window => window.days.includes(currentDay) && currentHour >= window.startHour && currentHour < window.endHour,
    );
  } catch {
    // Default: assume it's a good time
    return true;
  }
}

/**
 * Minimum time between consecutive emails from the same domain (ms)
 * 30 seconds minimum to avoid rate limiting and spam triggers
 */
export const MIN_SEND_INTERVAL_MS = 30_000;
