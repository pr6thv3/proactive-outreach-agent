import { NextRequest } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';
import { getFleetMetrics } from '@/lib/admin/telemetry';

export async function GET(request?: NextRequest) {
  const traceId = createTraceId();
  try {
    await requirePlatformAdmin(request);
    const fleet = await getFleetMetrics();
    return ok(fleet, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
