// ─── API: Messages ────────────────────────────────────
// Messages with approval queue, editing, and status filtering

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, requireWorkspace } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const leadId = searchParams.get('leadId');
    const campaignId = searchParams.get('campaignId');

    const where: Record<string, unknown> = { organizationId: context.organizationId };
    if (status) where.status = status;
    if (leadId) where.leadId = leadId;
    if (campaignId) where.campaignId = campaignId;

    const messages = await db.outreachMessage.findMany({
      where,
      include: {
        lead: { select: { id: true, name: true, email: true, company: true, status: true } },
        followUps: { orderBy: { scheduledAt: 'asc' } },
        replies: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return ok(messages, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function PATCH(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('member');
    const body = await request.json();
    const { id, subject, body: msgBody } = body;
    if (!id) return fail('id required', 400, 'validation_error', traceId);

    const msg = await db.outreachMessage.findFirst({ where: { id, organizationId: context.organizationId } });
    if (!msg) return fail('Message not found', 404, 'not_found', traceId);
    if (msg.status !== 'generated' && msg.status !== 'draft') return fail(`Cannot edit message in "${msg.status}" status`, 400, 'invalid_state', traceId);

    const updated = await db.outreachMessage.update({
      where: { id },
      data: { ...(subject !== undefined && { subject }), ...(msgBody !== undefined && { body: msgBody }) },
    });
    return ok(updated, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
