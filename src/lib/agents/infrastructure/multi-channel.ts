// ─── INFRASTRUCTURE: Multi-Channel Outreach ────────────
// Unified channel adapter: email, LinkedIn, Twitter/X, SMS, contact form
// Email adapter now uses DeliverabilityService for real Resend sending

import { AgentContext } from '../types';
import { db } from '@/lib/db';
import { isLeadSafeToContact, checkSendingLimit } from '@/lib/safety';
import { DeliverabilityService } from '@/lib/deliverability';

export type Channel = 'email' | 'linkedin' | 'twitter' | 'sms' | 'contact_form' | 'voice_note';

export interface ChannelMessage {
  id: string;
  subject?: string;
  body: string;
  channel: Channel;
  status: string;
  strategy?: string;
  angle?: string;
  tone?: string;
  cta?: string;
  sequencePos: number;
  campaignId?: string;
  signalTypeUsed?: string;
  urgencyAtGeneration?: number;
  pitchAngleUsed?: string;
}

export interface ChannelSendResult {
  success: boolean;
  channelId?: string;
  deliveredAt?: Date;
  error?: string;
  metadata?: Record<string, unknown>;
}

// ─── Channel Adapter Interface ─────────────────────────
export interface ChannelAdapter {
  channel: Channel;
  send(message: ChannelMessage, context: AgentContext): Promise<ChannelSendResult>;
  canSend(context: AgentContext): Promise<boolean>;
  formatMessage(message: ChannelMessage, context: AgentContext): Promise<ChannelMessage>;
}

// ─── Email Channel Adapter (Real Resend Integration) ───
export class EmailChannelAdapter implements ChannelAdapter {
  channel: Channel = 'email';

  async canSend(context: AgentContext): Promise<boolean> {
    if (!context.organizationId) return false;
    const safety = await isLeadSafeToContact(context.leadId, context.organizationId);
    if (!safety.safe) return false;

    if (context.campaignId) {
      const limitCheck = await checkSendingLimit(context.campaignId);
      if (!limitCheck.allowed) return false;
    }

    return !!context.lead.email;
  }

  async formatMessage(message: ChannelMessage, context: AgentContext): Promise<ChannelMessage> {
    return { ...message, channel: 'email' };
  }

  async send(message: ChannelMessage, context: AgentContext): Promise<ChannelSendResult> {
    if (!context.organizationId) {
      return { success: false, error: 'Workspace context is required to send email' };
    }

    const canSend = await this.canSend(context);
    if (!canSend) {
      return { success: false, error: 'Cannot send email: safety check failed' };
    }

    const formatted = await this.formatMessage(message, context);

    // Find sending domain
    const senderEmail = context.campaignConfig?.senderEmail || process.env.DEFAULT_SENDER_EMAIL || 'outreach@company.com';
    const senderName = context.campaignConfig?.senderName || 'Outreach Team';
    const senderDomain = senderEmail.split('@')[1];

    const sendingDomain = await db.sendingDomain.findFirst({
      where: { domain: senderDomain, status: { in: ['verified', 'verifying'] } },
    });

    const domainId = sendingDomain?.id;

    // Check domain warmup quota
    if (domainId) {
      const quotaCheck = await DeliverabilityService.checkSendingQuota(domainId);
      if (!quotaCheck.allowed) {
        return { success: false, error: `Domain warmup limit: ${quotaCheck.reason}` };
      }
    }

    // Generate HTML version
    const htmlBody = this.generateHtml(formatted.body);

    // Send via DeliverabilityService (uses Resend under the hood)
    const result = await DeliverabilityService.sendEmail({
      organizationId: context.organizationId,
      to: context.lead.email,
      from: senderEmail,
      fromName: senderName,
      subject: formatted.subject || 'Outreach',
      html: htmlBody,
      body: formatted.body,
      leadId: context.leadId,
      campaignId: context.campaignId,
      messageId: message.id,
      replyTo: sendingDomain?.replyTo || undefined,
    });

    if (result.success) {
      const now = new Date();

      await db.lead.update({
        where: { id: context.leadId },
        data: { status: 'sent', lastContacted: now },
      });

      return { success: true, channelId: result.providerId, deliveredAt: now };
    }

    return { success: false, error: result.error || 'Failed to send email' };
  }

  private generateHtml(body: string): string {
    if (/<[a-z][\s\S]*>/i.test(body)) return body;
    const paragraphs = body.split(/\n\n+/);
    return paragraphs
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map(p => `<p style="margin:0 0 12px 0;line-height:1.6;">${p.replace(/\n/g, '<br/>')}</p>`)
      .join('');
  }
}

// ─── LinkedIn Channel Adapter ──────────────────────────
export class LinkedInChannelAdapter implements ChannelAdapter {
  channel: Channel = 'linkedin';

  async canSend(context: AgentContext): Promise<boolean> {
    if (!context.lead.linkedinUrl) return false;
    const safety = await isLeadSafeToContact(context.leadId);
    return safety.safe;
  }

  async formatMessage(message: ChannelMessage, _context: AgentContext): Promise<ChannelMessage> {
    const body = message.body
      .replace(/Dear\s+\w+,/i, '')
      .replace(/Best,?\s*\w+$/m, '')
      .trim();

    return { ...message, subject: undefined, body: body.slice(0, 300), channel: 'linkedin' };
  }

  async send(message: ChannelMessage, context: AgentContext): Promise<ChannelSendResult> {
    const canSend = await this.canSend(context);
    if (!canSend) return { success: false, error: 'Cannot send LinkedIn message' };

    const formatted = await this.formatMessage(message, context);
    const now = new Date();

    await db.outreachMessage.update({
      where: { id: message.id },
      data: { status: 'sent', sentAt: now, body: formatted.body, channel: 'linkedin' },
    });

    await db.lead.update({ where: { id: context.leadId }, data: { lastContacted: now } });

    return {
      success: true,
      channelId: `linkedin_${Date.now()}`,
      deliveredAt: now,
      metadata: { note: 'LinkedIn integration pending — message logged' },
    };
  }
}

// ─── Twitter/X Channel Adapter ─────────────────────────
export class TwitterChannelAdapter implements ChannelAdapter {
  channel: Channel = 'twitter';

  async canSend(context: AgentContext): Promise<boolean> {
    const safety = await isLeadSafeToContact(context.leadId);
    return safety.safe;
  }

  async formatMessage(message: ChannelMessage, _context: AgentContext): Promise<ChannelMessage> {
    const body = message.body.replace(/Dear\s+\w+,/i, 'Hey').replace(/Best,?\s*\w+$/m, '').trim();
    return { ...message, subject: undefined, body: body.slice(0, 280), channel: 'twitter' };
  }

  async send(message: ChannelMessage, context: AgentContext): Promise<ChannelSendResult> {
    const formatted = await this.formatMessage(message, context);
    const now = new Date();

    await db.outreachMessage.update({
      where: { id: message.id },
      data: { status: 'sent', sentAt: now, body: formatted.body, channel: 'twitter' },
    });

    return { success: true, channelId: `twitter_${Date.now()}`, deliveredAt: now, metadata: { note: 'Twitter integration pending' } };
  }
}

// ─── SMS Channel Adapter ───────────────────────────────
export class SMSChannelAdapter implements ChannelAdapter {
  channel: Channel = 'sms';

  async canSend(context: AgentContext): Promise<boolean> {
    const safety = await isLeadSafeToContact(context.leadId);
    return safety.safe;
  }

  async formatMessage(message: ChannelMessage, _context: AgentContext): Promise<ChannelMessage> {
    const firstName = _context.lead.name.split(' ')[0] || 'there';
    const body = `Hi ${firstName}, ${message.body.replace(/Hi\s+\w+[,.]?\s*/i, '').replace(/Best,?\s*\w+$/m, '').trim().slice(0, 120)} Reply STOP to opt out.`;
    return { ...message, subject: undefined, body: body.slice(0, 160), channel: 'sms' };
  }

  async send(message: ChannelMessage, context: AgentContext): Promise<ChannelSendResult> {
    const formatted = await this.formatMessage(message, context);
    const now = new Date();

    await db.outreachMessage.update({
      where: { id: message.id },
      data: { status: 'sent', sentAt: now, body: formatted.body, channel: 'sms' },
    });

    return { success: true, channelId: `sms_${Date.now()}`, deliveredAt: now, metadata: { note: 'SMS integration pending' } };
  }
}

// ─── Contact Form Channel Adapter ──────────────────────
export class ContactFormAdapter implements ChannelAdapter {
  channel: Channel = 'contact_form';

  async canSend(context: AgentContext): Promise<boolean> {
    if (!context.lead.url) return false;
    const safety = await isLeadSafeToContact(context.leadId);
    return safety.safe;
  }

  async formatMessage(message: ChannelMessage, _context: AgentContext): Promise<ChannelMessage> {
    return { ...message, subject: message.subject || 'Partnership Inquiry', body: message.body.slice(0, 500), channel: 'contact_form' };
  }

  async send(message: ChannelMessage, context: AgentContext): Promise<ChannelSendResult> {
    const formatted = await this.formatMessage(message, context);
    const now = new Date();

    await db.outreachMessage.update({
      where: { id: message.id },
      data: { status: 'sent', sentAt: now, body: formatted.body, channel: 'contact_form' },
    });

    return { success: true, channelId: `contact_form_${Date.now()}`, deliveredAt: now, metadata: { note: 'Contact form integration pending' } };
  }
}

// ─── Channel Registry ──────────────────────────────────
const channelAdapters: Record<Channel, ChannelAdapter> = {
  email: new EmailChannelAdapter(),
  linkedin: new LinkedInChannelAdapter(),
  twitter: new TwitterChannelAdapter(),
  sms: new SMSChannelAdapter(),
  contact_form: new ContactFormAdapter(),
  voice_note: new EmailChannelAdapter(),
};

export function getChannelAdapter(channel: Channel): ChannelAdapter {
  return channelAdapters[channel];
}

export function getAvailableChannels(): Channel[] {
  return Object.keys(channelAdapters) as Channel[];
}

/**
 * Select the best channel for a lead based on available data and memory
 */
export async function selectBestChannel(
  context: AgentContext,
  preferredChannel?: Channel,
): Promise<Channel> {
  if (preferredChannel) {
    const adapter = getChannelAdapter(preferredChannel);
    if (await adapter.canSend(context)) return preferredChannel;
  }

  const channelPriority: Array<{ channel: Channel; condition: () => boolean }> = [
    { channel: 'linkedin', condition: () => !!context.lead.linkedinUrl },
    { channel: 'email', condition: () => !!context.lead.email },
    { channel: 'contact_form', condition: () => !!context.lead.url },
  ];

  const memoryRecommendations = await db.agentMemory.findMany({
    where: {
      category: 'channel_effectiveness',
      OR: [
        { industry: context.lead.company || undefined },
        { persona: context.lead.title || undefined },
      ],
      score: { gte: 0.5 },
    },
    orderBy: { score: 'desc' },
    take: 3,
  });

  if (memoryRecommendations.length > 0) {
    const bestChannel = memoryRecommendations[0].channel as Channel;
    if (bestChannel && channelAdapters[bestChannel]) {
      const adapter = channelAdapters[bestChannel];
      if (await adapter.canSend(context)) return bestChannel;
    }
  }

  for (const { channel, condition } of channelPriority) {
    if (condition()) {
      const adapter = getChannelAdapter(channel);
      if (await adapter.canSend(context)) return channel;
    }
  }

  return 'email';
}
