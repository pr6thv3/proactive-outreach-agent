import { NextRequest } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';
import { WebhookStatus } from '@prisma/client';

const CreateWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).default(['lead.created', 'email.sent', 'reply.received']),
});

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('ADMIN', request);
    const webhooks = await db.webhookEndpoint.findMany({
      where: { organizationId: context.organizationId },
      orderBy: { createdAt: 'desc' },
    });

    return ok(webhooks, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('ADMIN', request);
    const body = await request.json();
    const { url, events } = CreateWebhookSchema.parse(body);

    const secret = 'whsec_' + crypto.randomBytes(24).toString('hex');

    const webhook = await db.webhookEndpoint.create({
      data: {
        organizationId: context.organizationId,
        url,
        events: JSON.stringify(events) as any,
        secret,
        status: WebhookStatus.ACTIVE,
      },
    });

    return ok(webhook, traceId, 201);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
