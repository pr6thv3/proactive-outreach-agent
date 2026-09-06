import { NextRequest } from 'next/server';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';
import { getJobHealth } from '@/lib/queue/health';

export async function GET(request?: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const health = await getJobHealth(context.organizationId);
    return ok({ ...health, traceId }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
