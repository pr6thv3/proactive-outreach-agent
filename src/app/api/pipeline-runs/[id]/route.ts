import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const { id } = await params;
    const run = await db.pipelineRun.findFirst({
      where: { id, organizationId: context.organizationId },
    });

    if (!run) return fail('Pipeline run not found', 404, 'not_found', traceId);
    return ok(run, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
