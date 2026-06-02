// ─── API: Campaigns ───────────────────────────────────
// Campaign CRUD with full configuration

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, requireWorkspace } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';

export async function GET() {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace();
    const campaigns = await db.campaign.findMany({
      where: { organizationId: context.organizationId },
      include: { _count: { select: { messages: true } }, messages: { take: 3, orderBy: { createdAt: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return ok(campaigns, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('admin');
    const body = await request.json();
    const { name, goal, targetAudience, offer, senderName, senderEmail, tone, cta, maxDailySends, followUpSchedule, productDescription } = body;
    if (!name) return fail('name required', 400, 'validation_error', traceId);

    const campaign = await db.campaign.create({
      data: {
        organizationId: context.organizationId,
        name, goal, targetAudience, offer, senderName: senderName || 'Alex', senderEmail: senderEmail || 'alex@company.com',
        tone: tone || 'professional', cta, maxDailySends: maxDailySends || 50,
        followUpSchedule: JSON.stringify(followUpSchedule || [3, 7, 14]),
        productDescription, status: 'draft',
        dailySendsCount: 0, dailySendsDate: new Date().toISOString().split('T')[0],
      },
    });
    return ok(campaign, traceId, 201);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function PATCH(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('admin');
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return fail('id required', 400, 'validation_error', traceId);

    if (updates.followUpSchedule) updates.followUpSchedule = JSON.stringify(updates.followUpSchedule);
    const updated = await db.campaign.updateMany({ where: { id, organizationId: context.organizationId }, data: updates });
    if (updated.count === 0) return fail('Campaign not found', 404, 'not_found', traceId);
    const campaign = await db.campaign.findFirst({ where: { id, organizationId: context.organizationId } });
    return ok(campaign, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
