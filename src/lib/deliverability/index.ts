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
import { isLeadSafeToContact, appendUnsubscribeFooter, checkSendingLimit } from '@/lib/safety';
import { logger } from '@/lib/agents/infrastructure/observability';
import type { Campaign, Lead, OutreachMessage, SenderAccount, SendingDomain } from '@prisma/client';

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
    organizationId: string;
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
      organizationId, to, subject, body, html,
      messageId, leadId, campaignId, dryRun = false,
    } = params;

    let sendContext: Awaited<ReturnType<DeliverabilityServiceClass['assertCanSend']>>;
    try {
      sendContext = await this.assertCanSend({
        organizationId,
        campaignId,
        leadId,
        messageId,
      });
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), messageId };
    }

    // ═══ PREPARE EMAIL ═══
    const { domain, sender } = sendContext;
    const senderEmail = sender.email;
    const senderName = sender.name || domain.fromName || process.env.DEFAULT_SENDER_NAME || 'Outreach';
    const replyToEmail = sender.replyTo || domain.replyTo || process.env.DEFAULT_REPLY_TO;
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
      organizationId,
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
          senderId: sender.id,
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
    await this.incrementSenderSendCount(sender.id);

    // Log activity
    if (leadId) {
      await db.activity.create({
        data: {
          type: 'email_sent',
          description: `Email sent to ${to}: "${subject.slice(0, 50)}"`,
          phase: 'act',
          organizationId,
          leadId,
          metadata: JSON.stringify({ messageId, campaignId, providerId: result.providerId, domainId: domain.id, senderId: sender.id }),
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
    organizationId: string;
    domain: string;
    fromEmail: string;
    fromName?: string;
    replyTo?: string;
  }): Promise<DomainSetupResult> {
    const { organizationId, domain: domainName, fromEmail, fromName, replyTo } = params;

    // Check if domain already exists
    const existing = await db.sendingDomain.findFirst({ where: { organizationId, domain: domainName } });
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
        organizationId,
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

    await db.senderAccount.create({
      data: {
        organizationId,
        domainId: domain.id,
        email: fromEmail,
        name: fromName || fromEmail.split('@')[0],
        replyTo: replyTo || fromEmail,
        provider: 'resend',
        status: 'pending',
        dailyLimit: 25,
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

    if (status.overallStatus === 'verified') {
      await db.senderAccount.updateMany({
        where: { domainId, status: 'pending' },
        data: { status: 'active' },
      });
    }

    return status;
  }

  async assertCanSend(params: {
    organizationId: string;
    campaignId?: string;
    leadId?: string;
    messageId?: string;
    senderId?: string;
  }): Promise<{
    lead?: Lead;
    campaign?: Campaign;
    message?: OutreachMessage;
    sender: SenderAccount;
    domain: SendingDomain;
  }> {
    const { organizationId, campaignId, leadId, messageId, senderId } = params;
    if (!organizationId) throw new Error('organizationId is required');

    const message = messageId
      ? await db.outreachMessage.findFirst({ where: { id: messageId, organizationId } })
      : null;
    if (messageId && !message) throw new Error('Message not found');
    if (message && message.status !== 'approved') {
      throw new Error(`Message must be approved before sending; current status is ${message.status}`);
    }

    const resolvedLeadId = leadId || message?.leadId;
    if (!resolvedLeadId) throw new Error('leadId is required');
    const lead = await db.lead.findFirst({ where: { id: resolvedLeadId, organizationId } });
    if (!lead) throw new Error('Lead not found');

    const safety = await isLeadSafeToContact(lead.id, organizationId);
    if (!safety.safe) {
      throw new Error(`Safety check failed: ${safety.reasons.join(', ')}`);
    }

    const resolvedCampaignId = campaignId || message?.campaignId || undefined;
    const campaign = resolvedCampaignId
      ? await db.campaign.findFirst({ where: { id: resolvedCampaignId, organizationId } })
      : null;
    if (resolvedCampaignId && !campaign) throw new Error('Campaign not found');
    if (campaign?.status && ['paused', 'archived', 'completed'].includes(campaign.status)) {
      throw new Error(`Campaign is not sendable: ${campaign.status}${campaign.pausedReason ? ` (${campaign.pausedReason})` : ''}`);
    }

    if (campaign) {
      const campaignLimit = await checkSendingLimit(campaign.id);
      if (!campaignLimit.allowed) {
        throw new Error('Campaign daily sending limit reached');
      }
    }

    const selection = await this.selectSender({ organizationId, campaignId: resolvedCampaignId, senderId: senderId || message?.senderId || undefined });
    const canSend = await canSendMore(selection.domain.id);
    if (!canSend.allowed) {
      throw new Error(canSend.reason || 'Daily sending limit reached (domain warmup)');
    }

    const pauseCheck = await shouldPauseSending(selection.domain.id);
    if (pauseCheck.pause) {
      throw new Error(`Sending paused: ${pauseCheck.reason}`);
    }

    return {
      lead,
      campaign: campaign || undefined,
      message: message || undefined,
      sender: selection.sender,
      domain: selection.domain,
    };
  }

  private async selectSender(params: {
    organizationId: string;
    campaignId?: string;
    senderId?: string;
  }): Promise<{ sender: SenderAccount; domain: SendingDomain }> {
    const today = new Date().toISOString().split('T')[0];

    if (params.senderId) {
      const sender = await db.senderAccount.findFirst({
        where: { id: params.senderId, organizationId: params.organizationId },
        include: { domain: true },
      });
      if (!sender || !sender.domain) throw new Error('Approved sender not found');
      this.assertSenderHealthy(sender, sender.domain, today);
      return { sender, domain: sender.domain };
    }

    let pooledSenderIds: string[] | undefined;
    if (params.campaignId) {
      const pool = await db.campaignSenderPool.findMany({
        where: { organizationId: params.organizationId, campaignId: params.campaignId, enabled: true, senderId: { not: null } },
        select: { senderId: true },
      });
      pooledSenderIds = pool.map(row => row.senderId).filter((id): id is string => Boolean(id));
    }

    const senders = await db.senderAccount.findMany({
      where: {
        organizationId: params.organizationId,
        ...(pooledSenderIds && pooledSenderIds.length > 0 ? { id: { in: pooledSenderIds } } : {}),
      },
      include: { domain: true },
      orderBy: [{ lastSentAt: 'asc' }, { reputationScore: 'desc' }],
    });

    const eligible = senders.filter(sender => {
      if (!sender.domain) return false;
      try {
        this.assertSenderHealthy(sender, sender.domain, today);
        return true;
      } catch {
        return false;
      }
    });

    if (eligible.length === 0) {
      throw new Error('No active sender with a verified healthy domain is available');
    }

    const sender = eligible[0];
    return { sender, domain: sender.domain! };
  }

  private assertSenderHealthy(sender: SenderAccount, domain: SendingDomain, today: string) {
    if (sender.status !== 'active') throw new Error(`Sender is not active: ${sender.status}`);
    if (domain.status !== 'verified') throw new Error(`Sending domain is not verified: ${domain.status}`);
    if (domain.reputationScore < 30) throw new Error('Domain reputation is too low');
    if (sender.reputationScore < 30) throw new Error('Sender reputation is too low');

    const sentToday = sender.sentTodayDate === today ? sender.sentToday : 0;
    if (sentToday >= sender.dailyLimit) {
      throw new Error('Sender daily limit reached');
    }

    const domainSentToday = domain.dailySendsDate === today ? domain.dailySendsCount : 0;
    if (domainSentToday >= domain.dailyLimit) {
      throw new Error('Domain daily limit reached');
    }
  }

  private async incrementSenderSendCount(senderId: string) {
    const sender = await db.senderAccount.findUnique({ where: { id: senderId } });
    if (!sender) return;

    const today = new Date().toISOString().split('T')[0];
    const sentToday = sender.sentTodayDate === today ? sender.sentToday + 1 : 1;
    await db.senderAccount.update({
      where: { id: senderId },
      data: { sentToday, sentTodayDate: today, lastSentAt: new Date() },
    });
  }

  /**
   * Record an email event (from webhook)
   */
  async recordEvent(params: {
    eventType: string;
    organizationId?: string;
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
          organizationId: params.organizationId,
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
          organizationId: params.organizationId,
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
          organizationId: params.organizationId,
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
  async getDeliverabilitySummary(organizationId: string) {
    const domains = await db.sendingDomain.findMany({ where: { organizationId }, orderBy: { reputationScore: 'desc' } });

    // Aggregate email events
    const [
      totalSent, totalDelivered, totalBounced, totalOpened, totalClicked, totalComplained,
    ] = await Promise.all([
      db.emailEvent.count({ where: { organizationId, eventType: 'sent' } }),
      db.emailEvent.count({ where: { organizationId, eventType: 'delivered' } }),
      db.emailEvent.count({ where: { organizationId, eventType: 'bounced' } }),
      db.emailEvent.count({ where: { organizationId, eventType: 'opened' } }),
      db.emailEvent.count({ where: { organizationId, eventType: 'clicked' } }),
      db.emailEvent.count({ where: { organizationId, eventType: 'complained' } }),
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
