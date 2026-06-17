import { NextRequest } from 'next/server';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';
import { evaluateSendReadiness } from '@/lib/deliverability/send-readiness';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace();
    const { id } = await params;
    const readiness = await evaluateSendReadiness({
      organizationId: context.organizationId,
      messageId: id,
      traceId,
    });

    return ok(readiness, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
