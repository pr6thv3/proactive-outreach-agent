import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('ADMIN', request);
    const { id } = await params;

    const result = await db.webhookEndpoint.deleteMany({
      where: { id, organizationId: context.organizationId },
    });

    if (result.count === 0) return fail('Webhook endpoint not found', 404, 'not_found', traceId);
    return ok({ deleted: true }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
