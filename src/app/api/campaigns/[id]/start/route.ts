import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';
import { CampaignStatus } from '@prisma/client';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('ADMIN', request);
    const { id } = await params;

    const updated = await db.campaign.updateMany({
      where: { id, organizationId: context.organizationId },
      data: { status: CampaignStatus.ACTIVE, startedAt: new Date() },
    });

    if (updated.count === 0) return fail('Campaign not found', 404, 'not_found', traceId);
    return ok({ status: 'ACTIVE', startedAt: new Date() }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
