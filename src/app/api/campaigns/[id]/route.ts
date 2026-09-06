import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole, requireWorkspace } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';


const UpdateCampaignSchema = z.object({
  name: z.string().optional(),
  fromEmail: z.string().optional(),
  fromName: z.string().optional(),
  dailyLimit: z.number().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
  sequenceSteps: z.array(z.record(z.string(), z.unknown())).optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const { id } = await params;

    const campaign = await db.campaign.findFirst({
      where: { id, organizationId: context.organizationId },
      include: {
        campaignLeads: { include: { lead: true } },
        outreachEmails: { orderBy: { createdAt: 'desc' }, take: 20 },
        _count: { select: { campaignLeads: true, outreachEmails: true } },
      },
    });

    if (!campaign) return fail('Campaign not found', 404, 'not_found', traceId);
    return ok(campaign, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('ADMIN', request);
    const { id } = await params;
    const body = await request.json();
    const validated = UpdateCampaignSchema.parse(body);

    const dataPayload: any = { ...validated };
    if (validated.sequenceSteps) {
      dataPayload.sequenceSteps = JSON.stringify(validated.sequenceSteps);
    }

    const updated = await db.campaign.updateMany({
      where: { id, organizationId: context.organizationId },
      data: dataPayload,
    });

    if (updated.count === 0) return fail('Campaign not found', 404, 'not_found', traceId);
    const campaign = await db.campaign.findFirst({ where: { id } });
    return ok(campaign, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('ADMIN', request);
    const { id } = await params;

    const updated = await db.campaign.updateMany({
      where: { id, organizationId: context.organizationId },
      data: { status: 'ARCHIVED' },
    });

    if (updated.count === 0) return fail('Campaign not found', 404, 'not_found', traceId);
    return ok({ archived: true }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
