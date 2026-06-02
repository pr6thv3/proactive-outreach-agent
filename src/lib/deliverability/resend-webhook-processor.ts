import { db } from '@/lib/db';
import { DeliverabilityService } from '@/lib/deliverability';

export interface ResendWebhookPayload {
  type?: string;
  data?: Record<string, any>;
}

export async function processResendWebhookEvent(params: {
  organizationId?: string;
  webhookId?: string;
  payload: ResendWebhookPayload;
  rawBody: string;
}) {
  const { payload, rawBody, webhookId, organizationId } = params;
  const { type, data } = payload;

  if (!type || !data) {
    throw new Error('Invalid Resend webhook payload');
  }

  if (webhookId) {
    const existing = await db.emailEvent.findUnique({ where: { webhookId } }).catch(() => null);
    if (existing) {
      return { duplicate: true, webhookId };
    }
  }

  const customHeaders = data.headers || {};
  const messageId = customHeaders['x-message-id'] || customHeaders['X-Message-Id'] || null;
  const campaignId = customHeaders['x-campaign-id'] || customHeaders['X-Campaign-Id'] || null;
  const leadIdFromHeader = customHeaders['x-lead-id'] || customHeaders['X-Lead-Id'] || null;

  let leadId = leadIdFromHeader;
  if (!leadId && data.to) {
    const email = (Array.isArray(data.to) ? data.to[0] : data.to).toLowerCase();
    const lead = await db.lead.findFirst({
      where: {
        email,
        ...(organizationId ? { organizationId } : {}),
      },
    });
    leadId = lead?.id || null;
  }

  let domainId: string | null = null;
  if (data.from) {
    const fromDomain = String(data.from).includes('@') ? String(data.from).split('@')[1]?.replace('>', '') : null;
    if (fromDomain) {
      const domain = await db.sendingDomain.findFirst({
        where: {
          domain: fromDomain,
          ...(organizationId ? { organizationId } : {}),
        },
      });
      domainId = domain?.id || null;
    }
  }

  const recipient = Array.isArray(data.to) ? data.to[0] : (data.to || '');
  const baseEvent = {
    organizationId,
    webhookId,
    providerId: data.email_id,
    recipient,
    messageId: messageId || undefined,
    leadId: leadId || undefined,
    campaignId: campaignId || undefined,
    domainId: domainId || undefined,
  };

  switch (type) {
    case 'email.sent':
      return { received: true, ignored: 'sent_already_recorded' };
    case 'email.delivered':
      await DeliverabilityService.recordEvent({ ...baseEvent, eventType: 'delivered' });
      break;
    case 'email.bounced':
      await DeliverabilityService.recordEvent({
        ...baseEvent,
        eventType: 'bounced',
        bounceType: data.bounce_type || undefined,
        bounceReason: data.bounce_reason || undefined,
        rawData: rawBody,
      });
      break;
    case 'email.opened':
      await DeliverabilityService.recordEvent({
        ...baseEvent,
        eventType: 'opened',
        userAgent: data.user_agent || undefined,
        ipAddress: data.ip_address || undefined,
      });
      break;
    case 'email.clicked':
      await DeliverabilityService.recordEvent({
        ...baseEvent,
        eventType: 'clicked',
        clickUrl: data.click_url || undefined,
        userAgent: data.user_agent || undefined,
        ipAddress: data.ip_address || undefined,
      });
      break;
    case 'email.complained':
      await DeliverabilityService.recordEvent({
        ...baseEvent,
        eventType: 'complained',
        complaintType: 'abuse',
        rawData: rawBody,
      });
      break;
    default:
      await db.emailEvent.create({
        data: {
          ...baseEvent,
          eventType: type.replace('email.', ''),
          rawData: rawBody.slice(0, 10000),
        },
      }).catch(() => {});
  }

  return { received: true, eventType: type, webhookId };
}
