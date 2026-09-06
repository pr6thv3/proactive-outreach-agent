// ─── Bounce Handler — Process Bounce & Complaint Events ─
// Hard bounces → DNC + blacklist, Soft bounces → retry, Complaints → immediate DNC

import { db } from '@/lib/db';
import { addToDncList } from '@/lib/safety';
import { updateDomainMetrics } from './warmup-manager';
import { logger } from '@/lib/agents/infrastructure/observability';
import { checkCircuitBreaker } from '@/lib/risk/circuit-breaker';

export type BounceClassification = 'hard' | 'soft' | 'feedback' | 'unknown';

export interface BounceEvent {
  organizationId?: string;
  recipient: string;
  bounceType?: string;       // hard, soft, feedback
  bounceReason?: string;
  messageId?: string;        // Our internal message ID
  leadId?: string;
  campaignId?: string;
  domainId?: string;
  providerId?: string;       // Resend message ID
  rawData?: string;
}

/**
 * Classify a bounce as hard, soft, or feedback
 */
export function classifyBounce(reason: string): BounceClassification {
  const r = reason.toLowerCase();

  // Hard bounces — permanent failures, never retry
  const hardIndicators = [
    'user not found', 'no such user', 'invalid recipient', 'recipient invalid',
    'mailbox unavailable', 'domain not found', 'no such domain', 'invalid domain',
    'recipient rejected', 'address rejected', 'smtp 550', '550 5.1.1',
    '550 5.2.1', 'permanent failure', 'permanent error',
  ];

  // Soft bounces — temporary failures, can retry
  const softIndicators = [
    'mailbox full', 'quota exceeded', 'temporarily unavailable',
    'try again later', 'smtp 450', 'smtp 451', 'smtp 452',
    'deferred', 'temporary failure', 'rate limit', 'too many recipients',
    'greylisted', 'challenge response',
  ];

  // Feedback / complaints
  const feedbackIndicators = [
    'complaint', 'spam report', 'abuse report', 'this is spam',
    'feedback report', 'report abuse',
  ];

  if (feedbackIndicators.some(i => r.includes(i))) return 'feedback';
  if (hardIndicators.some(i => r.includes(i))) return 'hard';
  if (softIndicators.some(i => r.includes(i))) return 'soft';

  // Default: if SMTP code suggests permanent, classify as hard
  if (r.includes('5.') && !r.includes('4.')) return 'hard';
  if (r.includes('4.')) return 'soft';

  return 'unknown';
}

/**
 * Handle a bounce event
 */
export async function handleBounce(event: BounceEvent): Promise<void> {
  const classification = classifyBounce(event.bounceReason || '');

  // Record the bounce event
  await db.emailEvent.create({
    data: {
      eventType: 'bounced',
      organizationId: event.organizationId,
      providerId: event.providerId,
      recipient: event.recipient,
      bounceType: classification,
      bounceReason: event.bounceReason,
      messageId: event.messageId,
      leadId: event.leadId,
      campaignId: event.campaignId,
      domainId: event.domainId,
      rawData: event.rawData,
    },
  });

  // Update the outreach message
  if (event.messageId) {
    await db.outreachMessage.update({
      where: { id: event.messageId },
      data: {
        status: 'bounced',
        bouncedAt: new Date(),
        bounceReason: event.bounceReason,
      },
    }).catch(() => { /* Message may not exist */ });
  }

  // Update domain metrics
  if (event.domainId) {
    await updateDomainMetrics(event.domainId, 'bounced').catch(() => {});
  }

  switch (classification) {
    case 'hard':
      await handleHardBounce(event);
      break;
    case 'soft':
      await handleSoftBounce(event);
      break;
    case 'feedback':
      await handleComplaint(event);
      break;
    default:
      logger.warn('Unclassified bounce', {
        agent: 'BounceHandler',
        phase: 'act',
        metadata: { recipient: event.recipient, reason: event.bounceReason },
      });
  }

  // Trigger instantaneous circuit breaker evaluation
  if (event.domainId && event.organizationId) {
    await checkCircuitBreaker({
      domainId: event.domainId,
      campaignId: event.campaignId,
      organizationId: event.organizationId,
    }).catch((err) => {
      logger.warn('[BounceHandler] Circuit breaker evaluation warning', { error: err });
    });
  }
}

/**
 * Handle hard bounce — permanent failure, add to DNC + blacklist
 */
async function handleHardBounce(event: BounceEvent): Promise<void> {
  logger.info('Hard bounce — adding to DNC', {
    agent: 'BounceHandler',
    phase: 'act',
    leadId: event.leadId,
    metadata: { recipient: event.recipient, reason: event.bounceReason },
  });

  // Add to Do Not Contact list
  await addToDncList(event.recipient, 'Hard bounce', 'bounce_notification', event.leadId || undefined, event.organizationId);

  // Blacklist the lead
  if (event.leadId) {
    await db.lead.update({
      where: { id: event.leadId },
      data: { isBlacklisted: true, status: 'negative' },
    }).catch(() => { /* Lead may not exist */ });

    // Cancel any pending follow-ups
    const pendingMessages = await db.outreachMessage.findMany({
      where: { organizationId: event.organizationId, leadId: event.leadId, status: { in: ['generated', 'approved'] } },
    });

    for (const msg of pendingMessages) {
      await db.outreachMessage.update({
        where: { id: msg.id },
        data: { status: 'bounced' },
      });

      // Cancel follow-ups for this message
      await db.followUp.updateMany({
        where: { messageId: msg.id, status: 'scheduled' },
        data: { status: 'cancelled' },
      });
    }

    // Log activity
    await db.activity.create({
      data: {
        type: 'lead_blacklisted',
        organizationId: event.organizationId,
        description: `Lead blacklisted: hard bounce (${event.bounceReason?.slice(0, 100)})`,
        phase: 'act',
        leadId: event.leadId,
      },
    });
  }
}

/**
 * Handle soft bounce — temporary failure, schedule retry
 */
async function handleSoftBounce(event: BounceEvent): Promise<void> {
  // Check retry count from the message
  const message = event.messageId
    ? await db.outreachMessage.findUnique({ where: { id: event.messageId } })
    : null;

  const retryCount = (message?.sequencePos || 0) + 1; // Using sequencePos as a proxy

  if (retryCount >= 3) {
    // Max retries reached — treat as hard bounce
    logger.info('Soft bounce max retries reached — adding to DNC', {
      agent: 'BounceHandler',
      phase: 'act',
      metadata: { recipient: event.recipient, retries: retryCount },
    });

    await addToDncList(event.recipient, 'Soft bounce (3+ retries)', 'bounce_notification', event.leadId || undefined, event.organizationId);

    if (event.leadId) {
      await db.lead.update({
        where: { id: event.leadId },
        data: { status: 'negative' },
      }).catch(() => {});
    }
    return;
  }

  // Schedule retry with exponential backoff
  const retryDelayHours = Math.pow(2, retryCount) * 6; // 6h, 12h, 24h
  const retryAt = new Date(Date.now() + retryDelayHours * 3600000);

  logger.info('Soft bounce — scheduling retry', {
    agent: 'BounceHandler',
    phase: 'act',
    metadata: { recipient: event.recipient, retryIn: `${retryDelayHours}h`, attempt: retryCount },
  });

  // Create a job for the retry
  await db.jobQueue.create({
    data: {
      organizationId: event.organizationId,
      queueName: 'send-email',
      type: 'send-email',
      priority: 7, // Lower priority than fresh sends
      payload: JSON.stringify({
        messageId: event.messageId,
        leadId: event.leadId,
        campaignId: event.campaignId,
        retryAttempt: retryCount,
        organizationId: event.organizationId,
      }),
      leadId: event.leadId,
      campaignId: event.campaignId,
      scheduledAt: retryAt,
    },
  });

  if (event.leadId) {
    await db.activity.create({
      data: {
        type: 'email_blocked',
        organizationId: event.organizationId,
        description: `Soft bounce — retry scheduled in ${retryDelayHours}h (attempt ${retryCount}/3)`,
        phase: 'act',
        leadId: event.leadId,
        metadata: JSON.stringify({ bounceReason: event.bounceReason }),
      },
    });
  }
}

/**
 * Handle a spam complaint — immediate DNC + reputation impact
 */
async function handleComplaint(event: BounceEvent): Promise<void> {
  logger.error('SPAM COMPLAINT — immediate DNC', {
    agent: 'BounceHandler',
    phase: 'act',
    leadId: event.leadId,
    metadata: { recipient: event.recipient },
  });

  // Immediately add to DNC
  await addToDncList(event.recipient, 'Spam complaint', 'bounce_notification', event.leadId || undefined, event.organizationId);

  // Mark lead as unsubscribed
  if (event.leadId) {
    await db.lead.update({
      where: { id: event.leadId },
      data: { status: 'unsubscribed', doNotContact: true },
    }).catch(() => {});

    // Cancel all pending messages and follow-ups
    await db.outreachMessage.updateMany({
      where: { organizationId: event.organizationId, leadId: event.leadId, status: { in: ['generated', 'approved'] } },
      data: { status: 'bounced' },
    });

    const messageIds = await db.outreachMessage.findMany({
      where: { leadId: event.leadId },
      select: { id: true },
    });

    for (const msgId of messageIds) {
      await db.followUp.updateMany({
        where: { messageId: msgId.id, status: 'scheduled' },
        data: { status: 'cancelled' },
      });
    }

    await db.activity.create({
      data: {
        type: 'lead_unsubscribed',
        organizationId: event.organizationId,
        description: 'Lead submitted spam complaint — added to DNC',
        phase: 'act',
        leadId: event.leadId,
      },
    });
  }

  // Record complaint event (already done above, but ensure domain metrics update)
  if (event.domainId) {
    await updateDomainMetrics(event.domainId, 'complained').catch(() => {});
  }

  // Record complaint type
  await db.emailEvent.create({
    data: {
      eventType: 'complained',
      organizationId: event.organizationId,
      providerId: event.providerId,
      recipient: event.recipient,
      complaintType: 'abuse',
      messageId: event.messageId,
      leadId: event.leadId,
      campaignId: event.campaignId,
      domainId: event.domainId,
      rawData: event.rawData,
    },
  }).catch(() => {});
}

/**
 * Handle an unsubscribe event from webhook
 */
export async function handleUnsubscribe(params: {
  organizationId?: string;
  recipient: string;
  messageId?: string;
  leadId?: string;
  campaignId?: string;
  domainId?: string;
  providerId?: string;
}): Promise<void> {
  await addToDncList(params.recipient, 'Unsubscribed via email', 'bounce_notification', params.leadId, params.organizationId);

  if (params.leadId) {
    await db.lead.update({
      where: { id: params.leadId },
      data: { status: 'unsubscribed', doNotContact: true },
    }).catch(() => {});

    // Cancel pending sequences
    await db.outreachMessage.updateMany({
      where: { organizationId: params.organizationId, leadId: params.leadId, status: { in: ['generated', 'approved'] } },
      data: { status: 'bounced' },
    });

    await db.activity.create({
      data: {
        type: 'lead_unsubscribed',
        organizationId: params.organizationId,
        description: 'Lead unsubscribed via email',
        phase: 'act',
        leadId: params.leadId,
      },
    });
  }

  await db.emailEvent.create({
    data: {
      eventType: 'unsubscribed',
      organizationId: params.organizationId,
      providerId: params.providerId,
      recipient: params.recipient,
      messageId: params.messageId,
      leadId: params.leadId,
      campaignId: params.campaignId,
      domainId: params.domainId,
    },
  });

  // Trigger instantaneous circuit breaker evaluation on unsubscribe
  if (params.domainId && params.organizationId) {
    await checkCircuitBreaker({
      domainId: params.domainId,
      campaignId: params.campaignId,
      organizationId: params.organizationId,
    }).catch((err) => {
      logger.warn('[BounceHandler] Circuit breaker evaluation warning on unsubscribe', { error: err });
    });
  }
}
