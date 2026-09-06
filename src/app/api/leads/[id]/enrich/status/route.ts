import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const { id } = await params;

    const queueItem = await db.enrichmentQueue.findFirst({
      where: { leadId: id, organizationId: context.organizationId },
      orderBy: { updatedAt: 'desc' },
    });

    if (!queueItem) {
      return ok({ status: 'PENDING', mxValid: false, provider: null }, traceId);
    }

    return ok(queueItem, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
