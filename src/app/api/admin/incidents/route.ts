import { NextRequest } from 'next/server';
import { requireWorkspace } from '@/lib/auth/context';
import { IncidentCenterService } from '@/lib/admin/incident-center';
import { ok, fail } from '@/lib/api/responses';

export async function GET(request: NextRequest) {
  try {
    const context = await requireWorkspace(request);
    const data = await IncidentCenterService.getActiveIncidents(context.organizationId);
    return ok(data);
  } catch (error: any) {
    return fail(error.message || 'Failed to fetch active incidents', 500);
  }
}
