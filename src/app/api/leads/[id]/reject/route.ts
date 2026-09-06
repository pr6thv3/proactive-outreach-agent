import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';

const RejectLeadSchema = z.object({
  reason: z.string().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const { id: leadId } = await params;
    const body = await request.json().catch(() => ({}));
    const { reason } = RejectLeadSchema.parse(body);

    const lead = await db.lead.findFirst({
      where: { id: leadId, organizationId: context.organizationId },
    });

    if (!lead) {
      return fail('Lead not found in this workspace', 404, 'not_found', traceId);
    }

    await db.lead.updateMany({
      where: { id: leadId, organizationId: context.organizationId },
      data: { status: 'rejected' },
    });

    await db.outreachMessage.updateMany({
      where: { leadId, organizationId: context.organizationId },
      data: { status: 'rejected' },
    });

    await db.activity.create({
      data: {
        organizationId: context.organizationId,
        leadId,
        type: 'lead_rejected',
        description: `Lead dismissed from queue${reason ? `: ${reason}` : ''}`,
        phase: 'think',
      },
    }).catch(() => {});

    return ok({ success: true, leadId, status: 'rejected' }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
