import { NextRequest } from 'next/server';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';
import { listTrackedJobs } from '@/lib/queue/job-status';

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace();
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('campaignId') || undefined;
    const leadId = searchParams.get('leadId') || undefined;
    const status = searchParams.get('status') || undefined;
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);

    const jobs = await listTrackedJobs({
      organizationId: context.organizationId,
      campaignId,
      leadId,
      status,
      limit,
    });

    return ok({ jobs }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
