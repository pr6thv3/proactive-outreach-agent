// ─── Deliverability Service — Unified Interface ────────
// The #1 infrastructure: real email sending, domain verification, reputation, warmup

import { sendEmailViaResend, createDomainInResend, isResendConfigured, type SendEmailParams } from './resend-client';
import { checkDomainDnsStatus, updateDomainDnsStatus, type DomainDnsStatus } from './dns-checker';
import { canSendMore, getWarmupStatus, incrementDomainSendCount, updateDomainMetrics, type WarmupStatus } from './warmup-manager';
import { calculateReputation, recordDailySnapshot, getReputationTrend, shouldPauseSending, type ReputationScore } from './reputation-tracker';
import { handleBounce, handleUnsubscribe, classifyBounce, type BounceEvent } from './bounce-handler';
import { addTrackingToHtml, textToHtml, handleTrackedOpen, handleTrackedClick } from './tracking';
import { scheduleSends, isInSendWindow, getOptimalSendTime, MIN_SEND_INTERVAL_MS } from './send-cadence';
import { db } from '@/lib/db';
import { isLeadSafeToContact, appendUnsubscribeFooter } from '@/lib/safety';
import { logger } from '@/lib/agents/infrastructure/observability';

export interface SendResult {
  success: boolean;
  providerId?: string;
  messageId?: string;
  error?: string;
  tracked?: boolean;
}

export interface DomainSetupResult {
  success: boolean;
  domainId?: string;
  dnsRecords?: DomainDnsStatus;
  error?: string;
}

class DeliverabilityServiceClass {
  /**
   * SEND EMAIL — The #1 critical path
   * Real email sending via Resend with full tracking, warmup awareness, and safety
   */
  async sendEmail(params: {
    to: string;
    from?: string;
    fromName?: string;
    subject: string;
    body: string;           // Plain text body
    html?: string;          // Optional HTML (auto-generated from text if not provided)
    replyTo?: string;
    messageId?: string;     // Our internal OutreachMessage ID
    leadId?: string;
    campaignId?: string;
    dryRun?: boolean;
  }): Promise<SendResult> {
    const {
      to, from, fromName, subject, body, html, replyTo,
      messageId, leadId, campaignId, dryRun = false,
    } = params;

    // ═══ SAFETY CHECKS ═══
    if (leadId) {
      const safety = await isLeadSafeToContact(leadId);
      if (!safety.safe) {
        return { success: false, error: `Safety check failed: ${safety.reasons.join(', ')}` };
      }
    }

    // ═══ DOMAIN & WARMUP CHECK ═══
    const domain = await this.getBestSendingDomain();
    if (!domain) {
      return { success: false, error: 'No verified sending domain configured. Add a domain in Deliverability settings.' };
    }

    // Check warmup quota
    const canSend = await canSendMore(domain.id);
    if (!canSend.allowed) {
      return { success: false, error: canSend.reason || 'Daily sending limit reached (domain warmup)' };
    }

    // Check reputation
    const pauseCheck = await shouldPauseSending(domain.id);
    if (pauseCheck.pause) {
      return { success: false, error: `Sending paused: ${pauseCheck.reason}` };
    }

    // ═══ PREPARE EMAIL ═══
    const senderEmail = from || domain.fromEmail || process.env.DEFAULT_SENDER_EMAIL || 'outreach@company.com';
    const senderName = fromName || domain.fromName || process.env.DEFAULT_SENDER_NAME || 'Outreach';
    const replyToEmail = replyTo || domain.replyTo || process.env.DEFAULT_REPLY_TO;
    const fromFormatted = `${senderName} <${senderEmail}>`;

    // Add unsubscribe footer to text
    const bodyWithFooter = appendUnsubscribeFooter(body, senderEmail);

    // Generate HTML version
    const htmlBody = html || textToHtml(bodyWithFooter, senderName);

    // Add tracking if we have a messageId
    const trackedHtml = messageId ? addTrackingToHtml(htmlBody, messageId) : htmlBody;

    // ═══ DRY RUN ═══
    if (dryRun) {
      return {
        success: true,
        messageId,
        tracked: !!messageId,
        providerId: 'dry_run',
      };
    }

    // ═══ CHECK IF RESEND IS CONFIGURED ═══
    if (!isResendConfigured()) {
      // Fallback: mark as sent in DB but don't actually send
      logger.warn('Resend not configured — email not actually sent', {
        agent: 'DeliverabilityService',
        phase: 'act',
        metadata: { to, subject: subject.slice(0, 50) },
      });

      if (messageId) {
        await db.outreachMessage.update({
          where: { id: messageId },
          data: {
            status: 'sent',
            sentAt: new Date(),
            body: bodyWithFooter,
            unsubFooter: 'Unsubscribe link appended',
          },
        });
      }

      return {
        success: true,
        messageId,
        providerId: 'local_only',
        error: 'Resend not configured — email saved but not sent. Configure RESEND_API_KEY in .env',
      };
    }

    // ═══ SEND VIA RESEND ═══
    const result = await sendEmailViaResend({
      to,
      from: fromFormatted,
      subject,
      html: trackedHtml,
      text: bodyWithFooter,
      replyTo: replyToEmail,
      messageId,
      leadId,
      campaignId,
      domainId: domain.id,
    });

    if (!result.success) {
      return { success: false, error: result.error, messageId };
    }

    // ═══ POST-SEND UPDATES ═══
    // Update message status
    if (messageId) {
      await db.outreachMessage.update({
        where: { id: messageId },
        data: {
          status: 'sent',
          sentAt: new Date(),
          body: bodyWithFooter,
          unsubFooter: 'List-Unsubscribe header + footer appended',
        },
      }).catch(() => {});
    }

    // Update lead
    if (leadId) {
      await db.lead.update({
        where: { id: leadId },
        data: { status: 'sent', lastContacted: new Date() },
      }).catch(() => {});
    }

    // Increment domain send count
    await incrementDomainSendCount(domain.id);
    await updateDomainMetrics(domain.id, 'sent');

    // Log activity
    if (leadId) {
      await db.activity.create({
        data: {
          type: 'email_sent',
          description: `Email sent to ${to}: "${subject.slice(0, 50)}"`,
          phase: 'act',
          leadId,
          metadata: JSON.stringify({ messageId, campaignId, providerId: result.providerId, domainId: domain.id }),
        },
      }).catch(() => {});
    }

    logger.info('Email sent successfully', {
      agent: 'DeliverabilityService',
      phase: 'act',
      leadId,
      metadata: { to, providerId: result.providerId, domain: domain.domain },
    });

    return {
      success: true,
      providerId: result.providerId,
      messageId,
      tracked: !!messageId,
    };
  }

  /**
   * Add and verify a new sending domain
   */
  async addDomain(params: {
    domain: string;
    fromEmail: string;
    fromName?: string;
    replyTo?: string;
  }): Promise<DomainSetupResult> {
    const { domain: domainName, fromEmail, fromName, replyTo } = params;

    // Check if domain already exists
    const existing = await db.sendingDomain.findUnique({ where: { domain: domainName } });
    if (existing) {
      return { success: false, error: 'Domain already exists', domainId: existing.id };
    }

    // Create domain in Resend (if configured)
    let resendDomainId: string | undefined;
    let dnsRecords: DomainDnsStatus | undefined;

    if (isResendConfigured()) {
      const result = await createDomainInResend(domainName);
      if (result.success) {
        resendDomainId = result.domainId;
      } else {
        logger.warn('Resend domain creation failed, continuing with local setup', {
          agent: 'DeliverabilityService',
          metadata: { error: result.error },
        });
      }
    }

    // Save to database
    const domain = await db.sendingDomain.create({
      data: {
        domain: domainName,
        status: 'pending',
        provider: 'resend',
        fromEmail,
        fromName: fromName || fromEmail.split('@')[0],
        replyTo: replyTo || fromEmail,
        apiKeyRef: resendDomainId,
        warmupEnabled: true,
        warmupDay: 0,
        warmupDailyLimit: 5,
      },
    });

    // Get DNS records to configure
    dnsRecords = await checkDomainDnsStatus(domain.id);

    return {
      success: true,
      domainId: domain.id,
      dnsRecords,
    };
  }

  /**
   * Verify domain DNS records
   */
  async verifyDomain(domainId: string): Promise<DomainDnsStatus> {
    const status = await checkDomainDnsStatus(domainId);

    // Update our records
    await updateDomainDnsStatus(domainId, {
      spfVerified: status.spf.verified,
      dkimVerified: status.dkim.verified,
      dmarcVerified: status.dmarc.verified,
    });

    return status;
  }

  /**
   * Get the best sending domain to use
   */
  private async getBestSendingDomain() {
    // Find the highest reputation verified domain
    return db.sendingDomain.findFirst({
      where: { status: 'verified' },
      orderBy: { reputationScore: 'desc' },
    }) || db.sendingDomain.findFirst({
      where: { status: 'pending' },
      orderBy: { reputationScore: 'desc' },
    });
  }

  /**
   * Record an email event (from webhook)
   */
  async recordEvent(params: {
    eventType: string;
    providerId?: string;
    recipient: string;
    messageId?: string;
    leadId?: string;
    campaignId?: string;
    domainId?: string;
    bounceType?: string;
    bounceReason?: string;
    clickUrl?: string;
    userAgent?: string;
    ipAddress?: string;
    complaintType?: string;
    rawData?: string;
  }): Promise<void> {
    // Record the event
    await db.emailEvent.create({ data: params });

    // Process based on event type
    switch (params.eventType) {
      case 'delivered':
        if (params.messageId) {
          await db.outreachMessage.update({
            where: { id: params.messageId },
            data: { deliveredAt: new Date(), status: 'delivered' },
          }).catch(() => {});
        }
        if (params.domainId) await updateDomainMetrics(params.domainId, 'delivered');
        break;

      case 'bounced':
        await handleBounce({
          recipient: params.recipient,
          bounceType: params.bounceType,
          bounceReason: params.bounceReason,
          messageId: params.messageId,
          leadId: params.leadId,
          campaignId: params.campaignId,
          domainId: params.domainId,
          providerId: params.providerId,
          rawData: params.rawData,
        });
        break;

      case 'opened':
        if (params.messageId) {
          await db.outreachMessage.update({
            where: { id: params.messageId },
            data: { openedAt: new Date() },
          }).catch(() => {});
        }
        if (params.domainId) await updateDomainMetrics(params.domainId, 'opened');
        break;

      case 'clicked':
        if (params.messageId) {
          await db.outreachMessage.update({
            where: { id: params.messageId },
            data: { clickedAt: new Date() },
          }).catch(() => {});
        }
        if (params.domainId) await updateDomainMetrics(params.domainId, 'clicked');
        break;

      case 'complained':
        await handleBounce({
          recipient: params.recipient,
          bounceType: 'feedback',
          bounceReason: 'Spam complaint',
          messageId: params.messageId,
          leadId: params.leadId,
          campaignId: params.campaignId,
          domainId: params.domainId,
          providerId: params.providerId,
          rawData: params.rawData,
        });
        break;

      case 'unsubscribed':
        await handleUnsubscribe({
          recipient: params.recipient,
          messageId: params.messageId,
          leadId: params.leadId,
          campaignId: params.campaignId,
          domainId: params.domainId,
          providerId: params.providerId,
        });
        break;
    }
  }

  /**
   * Check domain sending quota (considers warmup + reputation)
   */
  async checkSendingQuota(domainId: string): Promise<{ allowed: boolean; remaining: number; reason?: string }> {
    // Check warmup quota
    const warmup = await canSendMore(domainId);
    if (!warmup.allowed) return warmup;

    // Check reputation
    const pause = await shouldPauseSending(domainId);
    if (pause.pause) {
      return { allowed: false, remaining: 0, reason: pause.reason };
    }

    return { allowed: true, remaining: warmup.remaining };
  }

  /**
   * Get deliverability summary for dashboard
   */
  async getDeliverabilitySummary() {
    const domains = await db.sendingDomain.findMany({ orderBy: { reputationScore: 'desc' } });

    // Aggregate email events
    const [
      totalSent, totalDelivered, totalBounced, totalOpened, totalClicked, totalComplained,
    ] = await Promise.all([
      db.emailEvent.count({ where: { eventType: 'sent' } }),
      db.emailEvent.count({ where: { eventType: 'delivered' } }),
      db.emailEvent.count({ where: { eventType: 'bounced' } }),
      db.emailEvent.count({ where: { eventType: 'opened' } }),
      db.emailEvent.count({ where: { eventType: 'clicked' } }),
      db.emailEvent.count({ where: { eventType: 'complained' } }),
    ]);

    const deliveryRate = totalSent > 0 ? totalDelivered / totalSent : 0;
    const bounceRate = totalSent > 0 ? totalBounced / totalSent : 0;
    const openRate = totalDelivered > 0 ? totalOpened / totalDelivered : 0;
    const clickRate = totalDelivered > 0 ? totalClicked / totalDelivered : 0;
    const complaintRate = totalSent > 0 ? totalComplained / totalSent : 0;

    return {
      domains,
      metrics: {
        totalSent, totalDelivered, totalBounced, totalOpened, totalClicked, totalComplained,
        deliveryRate, bounceRate, openRate, clickRate, complaintRate,
      },
      isResendConfigured: isResendConfigured(),
    };
  }
}

// Singleton instance
export const DeliverabilityService = new DeliverabilityServiceClass();

// Re-export sub-modules for direct access
export { isResendConfigured } from './resend-client';
export { checkDomainDnsStatus, type DomainDnsStatus, type DnsRecordStatus } from './dns-checker';
export { getWarmupStatus, canSendMore, getWarmupSchedule, type WarmupStatus } from './warmup-manager';
export { calculateReputation, getReputationTrend, type ReputationScore } from './reputation-tracker';
export { handleBounce, handleUnsubscribe, classifyBounce, type BounceEvent, type BounceClassification } from './bounce-handler';
export { addTrackingToHtml, textToHtml, handleTrackedOpen, handleTrackedClick } from './tracking';
export { scheduleSends, isInSendWindow, getOptimalSendTime, MIN_SEND_INTERVAL_MS } from './send-cadence';
