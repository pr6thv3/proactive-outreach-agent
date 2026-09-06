// ─── Webhook: Inbound Email ────────────────────────────
// Handle inbound email (replies) from Resend with Svix cryptographic verification
// and tenant-scoped lead resolution to prevent cross-tenant IDOR.

import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { DeliverabilityService } from '@/lib/deliverability';
import { createTraceId, fail, ok } from '@/lib/api/responses';

interface InboundEmail {
  from: string;
  to: string[] | string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

function verifySvixSignature(rawBody: string, headers: Headers, secret: string): boolean {
  const signature = headers.get('svix-signature') || headers.get('x-svix-signature');
  const timestamp = headers.get('svix-timestamp') || headers.get('x-svix-timestamp');
  const msgId = headers.get('svix-id') || headers.get('x-svix-id');

  if (!signature || !timestamp || !msgId) return false;

  const timestampMs = parseInt(timestamp, 10) * 1000;
  if (Number.isNaN(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) return false;

  const signedPayload = `${msgId}.${timestamp}.${rawBody}`;
  const cleanSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(cleanSecret, 'base64').length > 0
    ? Buffer.from(cleanSecret, 'base64')
    : Buffer.from(secret);

  const expectedSig = crypto
    .createHmac('sha256', secretBytes)
    .update(signedPayload)
    .digest('base64');

  return signature.split(' ').some(sig => {
    const sigBase64 = sig.replace('v1,', '');
    try {
      const a = Buffer.from(sigBase64, 'base64');
      const b = Buffer.from(expectedSig, 'base64');
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  });
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const rawBody = await request.text();
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

    // Verify cryptographic webhook signature when secret is configured
    if (webhookSecret && !webhookSecret.startsWith('whsec_xxxx')) {
      const isValid = verifySvixSignature(rawBody, request.headers, webhookSecret);
      if (!isValid) {
        return fail('Invalid webhook signature', 401, 'invalid_signature', traceId);
      }
    } else if (process.env.NODE_ENV === 'production') {
      return fail('Webhook secret is not configured', 500, 'webhook_secret_missing', traceId);
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return fail('Invalid JSON body', 400, 'invalid_json', traceId);
    }

    const email: InboundEmail = body.data || body;

    if (!email.from || !email.subject) {
      return fail('Missing required fields: from, subject', 400, 'validation_error', traceId);
    }

    // 1. Resolve Organization/Tenant Context from headers or recipient domain to prevent IDOR
    let resolvedOrgId: string | null = null;
    let messageByHeader: any = null;

    const customHeaders = normalizeHeaders(email.headers);
    const explicitMsgId = customHeaders['x-message-id'] || customHeaders['in-reply-to'] || customHeaders['references'];

    if (explicitMsgId) {
      messageByHeader = await db.outreachMessage.findFirst({
        where: { id: explicitMsgId.replace(/[<>]/g, '').trim() },
        select: { id: true, organizationId: true, leadId: true, campaignId: true },
      }).catch(() => null);

      if (messageByHeader?.organizationId) {
        resolvedOrgId = messageByHeader.organizationId;
      }
    }

    if (!resolvedOrgId) {
      const recipientAddresses = Array.isArray(email.to) ? email.to : [email.to];
      for (const recipient of recipientAddresses) {
        if (typeof recipient === 'string' && recipient.includes('@')) {
          const domainName = recipient.split('@')[1]?.replace(/[>"]/g, '').trim().toLowerCase();
          if (domainName) {
            const domainRecord = await db.sendingDomain.findFirst({
              where: { domain: domainName },
              select: { organizationId: true },
            });
            if (domainRecord?.organizationId) {
              resolvedOrgId = domainRecord.organizationId;
              break;
            }
          }
        }
      }
    }

    // 2. Scoped Lead Matching
    const fromEmail = email.from.toLowerCase().replace(/.*<([^>]+)>.*/, '$1').trim();
    const leadWhere = resolvedOrgId
      ? { organizationId: resolvedOrgId, email: fromEmail }
      : { email: fromEmail };

    const lead = await db.lead.findFirst({
      where: leadWhere,
    });

    if (!lead) {
      if (process.env.NODE_ENV !== 'production') console.log(`[InboundEmail] No lead found for email: ${fromEmail} (org: ${resolvedOrgId})`);
      return ok({ received: true, matched: false }, traceId, 200);
    }

    const orgId = lead.organizationId;

    // 3. Find matching message scoped to this tenant and lead
    let matchingMessage = messageByHeader || await findMatchingMessage(lead.id, orgId, email);

    const replyText = email.text || email.html?.replace(/<[^>]+>/g, '') || '';

    // Update matching message
    if (matchingMessage) {
      await db.outreachMessage.update({
        where: { id: matchingMessage.id },
        data: {
          status: 'replied',
          repliedAt: new Date(),
        },
      });
    }

    // Update lead status
    await db.lead.update({
      where: { id: lead.id },
      data: { status: 'replied' },
    });

    // Create reply classification entry
    if (matchingMessage) {
      await db.replyClassification.create({
        data: {
          organizationId: orgId,
          leadId: lead.id,
          messageId: matchingMessage.id,
          category: 'neutral',
          confidence: 0,
          replyText: replyText.slice(0, 5000),
          nextAction: 'no_action',
        },
      });
    }

    // Record email event
    await DeliverabilityService.recordEvent({
      organizationId: orgId,
      eventType: 'replied' as never,
      recipient: fromEmail,
      messageId: matchingMessage?.id,
      leadId: lead.id,
      campaignId: matchingMessage?.campaignId || undefined,
      rawData: rawBody,
    });

    // Create activity
    await db.activity.create({
      data: {
        organizationId: orgId,
        type: 'reply_received',
        description: `Reply received from ${lead.name || fromEmail}: "${replyText.slice(0, 100)}..."`,
        phase: 'reeval',
        leadId: lead.id,
        metadata: JSON.stringify({
          messageId: matchingMessage?.id,
          subject: email.subject,
          replyLength: replyText.length,
        }),
      },
    });

    return ok({ received: true, matched: true, leadId: lead.id, organizationId: orgId }, traceId);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') console.error('[InboundEmail] Error processing inbound email:', error);
    return fail('Processing failed', 500, 'inbound_processing_error', traceId);
  }
}

function normalizeHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== 'object') return {};
  return Object.fromEntries(
    Object.entries(headers as Record<string, unknown>).map(([k, v]) => [
      k.toLowerCase(),
      typeof v === 'string' ? v : String(v),
    ]),
  );
}

async function findMatchingMessage(leadId: string, organizationId: string, email: InboundEmail) {
  // 1. Try to match by subject (remove Re: prefix)
  const cleanSubject = email.subject.replace(/^(Re|RE|Fwd|FW):\s*/i, '').trim();
  if (cleanSubject) {
    const messageBySubject = await db.outreachMessage.findFirst({
      where: {
        leadId,
        organizationId,
        subject: { contains: cleanSubject },
        status: { in: ['sent', 'delivered'] },
      },
      orderBy: { sentAt: 'desc' },
    });
    if (messageBySubject) return messageBySubject;
  }

  // 2. Fall back to the most recent sent message to this lead
  const mostRecentMessage = await db.outreachMessage.findFirst({
    where: {
      leadId,
      organizationId,
      status: { in: ['sent', 'delivered'] },
    },
    orderBy: { sentAt: 'desc' },
  });

  return mostRecentMessage;
}
