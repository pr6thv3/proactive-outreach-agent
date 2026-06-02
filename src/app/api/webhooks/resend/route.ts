import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';
import { enqueueJob } from '@/lib/queue/producers';

type ResendWebhookPayload = {
  type?: string;
  data?: Record<string, any>;
};

function verifySignature(body: string, headers: Record<string, string>, secret: string): boolean {
  const signature = headers['svix-signature'];
  const timestamp = headers['svix-timestamp'];
  const msgId = headers['svix-id'];

  if (!signature || !timestamp || !msgId) return false;

  const timestampMs = parseInt(timestamp, 10) * 1000;
  if (Number.isNaN(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) return false;

  const signedPayload = `${msgId}.${timestamp}.${body}`;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('base64');

  return signature.split(' ').some(sig => {
    const sigBase64 = sig.replace('v1,', '');
    try {
      return crypto.timingSafeEqual(Buffer.from(sigBase64, 'base64'), Buffer.from(expectedSig, 'base64'));
    } catch {
      return false;
    }
  });
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const rawBody = await request.text();
    const headers = headerMap(request);
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

    if (!webhookSecret || webhookSecret.startsWith('whsec_xxxx')) {
      if (process.env.NODE_ENV === 'production') {
        return fail('Resend webhook secret is not configured', 500, 'webhook_secret_missing', traceId);
      }
    } else if (!verifySignature(rawBody, headers, webhookSecret)) {
      return fail('Invalid signature', 401, 'invalid_signature', traceId);
    }

    const payload = JSON.parse(rawBody) as ResendWebhookPayload;
    if (!payload.type || !payload.data) {
      return fail('Invalid payload', 400, 'validation_error', traceId);
    }

    const webhookId = headers['svix-id'];
    const organizationId = await resolveWebhookOrganizationId(payload);
    if (!organizationId) {
      return ok({ received: true, ignored: 'organization_not_resolved', webhookId }, traceId, 202);
    }

    const job = await enqueueJob('webhook-processing', {
      organizationId,
      userId: 'resend-webhook',
      webhookId,
      payload,
      rawBody,
      traceId,
    });

    return ok({ received: true, job }, traceId, 202);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function GET() {
  return ok({ status: 'ok', endpoint: 'resend-webhook' });
}

function headerMap(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return headers;
}

async function resolveWebhookOrganizationId(payload: ResendWebhookPayload): Promise<string | null> {
  const data = payload.data || {};
  const customHeaders = normalizePayloadHeaders(data.headers);
  const messageId = customHeaders['x-message-id'];
  const campaignId = customHeaders['x-campaign-id'];
  const leadId = customHeaders['x-lead-id'];

  if (messageId) {
    const message = await db.outreachMessage.findUnique({
      where: { id: messageId },
      select: { organizationId: true },
    }).catch(() => null);
    if (message?.organizationId) return message.organizationId;
  }

  if (campaignId) {
    const campaign = await db.campaign.findUnique({
      where: { id: campaignId },
      select: { organizationId: true },
    }).catch(() => null);
    if (campaign?.organizationId) return campaign.organizationId;
  }

  if (leadId) {
    const lead = await db.lead.findUnique({
      where: { id: leadId },
      select: { organizationId: true },
    }).catch(() => null);
    if (lead?.organizationId) return lead.organizationId;
  }

  const fromDomain = typeof data.from === 'string' && data.from.includes('@')
    ? data.from.split('@')[1]?.replace(/[>"]/g, '').trim()
    : null;
  if (fromDomain) {
    const domain = await db.sendingDomain.findFirst({
      where: { domain: fromDomain },
      select: { organizationId: true },
    });
    if (domain?.organizationId) return domain.organizationId;
  }

  const recipient = Array.isArray(data.to) ? data.to[0] : data.to;
  if (typeof recipient === 'string') {
    const lead = await db.lead.findFirst({
      where: { email: recipient.toLowerCase() },
      select: { organizationId: true },
    });
    if (lead?.organizationId) return lead.organizationId;
  }

  return null;
}

function normalizePayloadHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== 'object') return {};
  return Object.fromEntries(
    Object.entries(headers as Record<string, unknown>).map(([key, value]) => [
      key.toLowerCase(),
      typeof value === 'string' ? value : String(value),
    ]),
  );
}
