import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const { id } = await params;

    const lead = await db.lead.findFirst({
      where: { id, organizationId: context.organizationId },
    });
    if (!lead) return fail('Lead not found', 404, 'not_found', traceId);

    const signals = await db.signal.findMany({
      where: { leadId: id, organizationId: context.organizationId },
      orderBy: { observedAt: 'desc' },
    });

    return ok(signals, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
