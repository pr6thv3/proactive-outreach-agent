// ─── Webhook: Resend Events ────────────────────────────
// Handles delivery events: sent, delivered, bounced, opened, clicked, complained

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { DeliverabilityService } from '@/lib/deliverability';
import { db } from '@/lib/db';

function verifySignature(body: string, headers: Record<string, string>, secret: string): boolean {
  const signature = headers['svix-signature'];
  const timestamp = headers['svix-timestamp'];
  const msgId = headers['svix-id'];

  if (!signature || !timestamp || !msgId) return false;

  // Check timestamp is recent (within 5 minutes)
  const timestampMs = parseInt(timestamp) * 1000;
  if (isNaN(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) return false;

  const signedPayload = `${msgId}.${timestamp}.${body}`;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('base64');

  // The signature header can contain multiple space-separated signatures
  const signatures = signature.split(' ');
  return signatures.some(sig => {
    const sigBase64 = sig.replace('v1,', '');
    try {
      return crypto.timingSafeEqual(Buffer.from(sigBase64, 'base64'), Buffer.from(expectedSig, 'base64'));
    } catch {
      return false;
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });

    // Verify webhook signature (skip if secret not configured)
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (webhookSecret && !webhookSecret.startsWith('whsec_xxxx')) {
      if (!verifySignature(body, headers, webhookSecret)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const payload = JSON.parse(body);
    const { type, data } = payload;

    if (!type || !data) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Extract our custom tracking headers
    const customHeaders = data.headers || {};
    const messageId = customHeaders['x-message-id'] || null;
    const campaignId = customHeaders['x-campaign-id'] || null;
    const leadIdFromHeader = customHeaders['x-lead-id'] || null;

    // Find the lead by email if not in headers
    let leadId = leadIdFromHeader;
    if (!leadId && data.to) {
      const lead = await db.lead.findFirst({ where: { email: (Array.isArray(data.to) ? data.to[0] : data.to).toLowerCase() } });
      leadId = lead?.id || null;
    }

    // Find the domain
    let domainId: string | null = null;
    if (data.from) {
      const fromDomain = data.from.includes('@') ? data.from.split('@')[1]?.replace('>', '') : null;
      if (fromDomain) {
        const domain = await db.sendingDomain.findFirst({ where: { domain: fromDomain } });
        domainId = domain?.id || null;
      }
    }

    // Process the event
    const recipient = Array.isArray(data.to) ? data.to[0] : (data.to || '');

    switch (type) {
      case 'email.sent':
        // Already recorded in sendEmailViaResend, just acknowledge
        break;

      case 'email.delivered':
        await DeliverabilityService.recordEvent({
          eventType: 'delivered',
          providerId: data.email_id,
          recipient,
          messageId: messageId || undefined,
          leadId: leadId || undefined,
          campaignId: campaignId || undefined,
          domainId: domainId || undefined,
        });
        break;

      case 'email.bounced':
        await DeliverabilityService.recordEvent({
          eventType: 'bounced',
          providerId: data.email_id,
          recipient,
          messageId: messageId || undefined,
          leadId: leadId || undefined,
          campaignId: campaignId || undefined,
          domainId: domainId || undefined,
          bounceType: data.bounce_type || undefined,
          bounceReason: data.bounce_reason || undefined,
          rawData: body,
        });
        break;

      case 'email.opened':
        await DeliverabilityService.recordEvent({
          eventType: 'opened',
          providerId: data.email_id,
          recipient,
          messageId: messageId || undefined,
          leadId: leadId || undefined,
          campaignId: campaignId || undefined,
          domainId: domainId || undefined,
          userAgent: data.user_agent || undefined,
          ipAddress: data.ip_address || undefined,
        });
        break;

      case 'email.clicked':
        await DeliverabilityService.recordEvent({
          eventType: 'clicked',
          providerId: data.email_id,
          recipient,
          messageId: messageId || undefined,
          leadId: leadId || undefined,
          campaignId: campaignId || undefined,
          domainId: domainId || undefined,
          clickUrl: data.click_url || undefined,
          userAgent: data.user_agent || undefined,
          ipAddress: data.ip_address || undefined,
        });
        break;

      case 'email.complained':
        await DeliverabilityService.recordEvent({
          eventType: 'complained',
          providerId: data.email_id,
          recipient,
          messageId: messageId || undefined,
          leadId: leadId || undefined,
          campaignId: campaignId || undefined,
          domainId: domainId || undefined,
          complaintType: 'abuse',
          rawData: body,
        });
        break;

      default:
        // Unknown event type — still record it
        await db.emailEvent.create({
          data: {
            eventType: type.replace('email.', ''),
            providerId: data.email_id,
            recipient,
            messageId: messageId,
            leadId: leadId,
            campaignId: campaignId,
            domainId: domainId,
            rawData: body.slice(0, 10000),
          },
        }).catch(() => {});
    }

    // Always return 200 quickly to acknowledge the webhook
    return NextResponse.json({ received: true });
  } catch (error) {
    // Still return 200 to prevent Resend from retrying
    if (process.env.NODE_ENV !== 'production') console.error('Webhook error:', error);
    return NextResponse.json({ received: true, error: 'Processing error' });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'resend-webhook' });
}
