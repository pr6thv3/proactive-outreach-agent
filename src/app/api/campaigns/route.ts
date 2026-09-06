// ─── API: Campaigns ───────────────────────────────────
// Campaign CRUD with full configuration

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, requireWorkspace } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const campaigns = await db.campaign.findMany({
      where: { organizationId: context.organizationId },
      include: { _count: { select: { outreachEmails: true, campaignLeads: true } }, outreachEmails: { take: 3, orderBy: { createdAt: 'desc' } } },
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
    const context = await requireRole('MEMBER', request);
    const body = await request.json();
    const {
      name,
      goal,
      targetAudience,
      offer,
      senderName,
      senderEmail,
      fromName,
      fromEmail,
      tone,
      cta,
      maxDailySends,
      dailyLimit,
      followUpSchedule,
      sequenceSteps,
      productDescription,
      status,
    } = body;

    if (!name) return fail('name required', 400, 'validation_error', traceId);

    const sName = senderName || fromName || 'Alex';
    const sEmail = senderEmail || fromEmail || 'alex@company.com';
    const limit = maxDailySends || dailyLimit || 50;

    const campaign = await db.campaign.create({
      data: {
        organizationId: context.organizationId,
        name,
        goal,
        targetAudience,
        offer,
        senderName: sName,
        senderEmail: sEmail,
        fromName: sName,
        fromEmail: sEmail,
        tone: tone || 'professional',
        cta,
        maxDailySends: limit,
        dailyLimit: limit,
        followUpSchedule: JSON.stringify(followUpSchedule || [3, 7, 14]),
        sequenceSteps: sequenceSteps ? (typeof sequenceSteps === 'string' ? sequenceSteps : JSON.stringify(sequenceSteps)) : undefined,
        productDescription,
        status: status || 'DRAFT',
        dailySendsCount: 0,
        dailySendsDate: new Date(),
      } as any,
    });
    return ok(campaign, traceId, 201);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function PATCH(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('MEMBER', request);
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return fail('id required', 400, 'validation_error', traceId);

    if (updates.followUpSchedule && typeof updates.followUpSchedule !== 'string') {
      updates.followUpSchedule = JSON.stringify(updates.followUpSchedule);
    }
    if (updates.sequenceSteps && typeof updates.sequenceSteps !== 'string') {
      updates.sequenceSteps = JSON.stringify(updates.sequenceSteps);
    }

    const updated = await db.campaign.updateMany({ where: { id, organizationId: context.organizationId }, data: updates });
    if (updated.count === 0) return fail('Campaign not found', 404, 'not_found', traceId);
    const campaign = await db.campaign.findFirst({ where: { id, organizationId: context.organizationId } });
    return ok(campaign, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
