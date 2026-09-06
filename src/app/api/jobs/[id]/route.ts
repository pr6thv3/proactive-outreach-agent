import { NextRequest } from 'next/server';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';
import { getTrackedJob } from '@/lib/queue/job-status';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const { id } = await params;
    const job = await getTrackedJob(id, context.organizationId);
    if (!job) return fail('Job not found', 404, 'not_found', traceId);
    return ok(job, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
