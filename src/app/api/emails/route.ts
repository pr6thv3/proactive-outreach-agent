import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';
import { OutreachEmailStatus } from '@prisma/client';

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as OutreachEmailStatus | null;
    const campaignId = searchParams.get('campaignId');
    const leadId = searchParams.get('leadId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);

    const where: Record<string, unknown> = { organizationId: context.organizationId };
    if (status) where.status = status;
    if (campaignId) where.campaignId = campaignId;
    if (leadId) where.leadId = leadId;

    const emails = await db.outreachEmail.findMany({
      where,
      include: {
        lead: { select: { id: true, name: true, email: true, company: true, score: true } },
        campaign: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return ok(emails, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
