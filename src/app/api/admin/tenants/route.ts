import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePlatformAdmin } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';
import { getTenantMetrics } from '@/lib/admin/telemetry';

export async function GET(request?: NextRequest) {
  const traceId = createTraceId();
  try {
    await requirePlatformAdmin(request);
    
    const searchParams = request?.nextUrl.searchParams;
    const search = searchParams?.get('search')?.toLowerCase() || '';
    const status = searchParams?.get('status')?.toLowerCase() || 'all';

    const orgs = await db.organization.findMany({
      orderBy: { createdAt: 'desc' },
    });

    let tenants = await Promise.all(orgs.map((org: any) => getTenantMetrics(org)));

    // Apply search filter
    if (search) {
      tenants = tenants.filter(t => 
        t.name.toLowerCase().includes(search) || 
        (t.slug && t.slug.toLowerCase().includes(search)) ||
        t.id.toLowerCase().includes(search)
      );
    }

    // Apply status filter
    if (status !== 'all') {
      if (status === 'healthy') {
        tenants = tenants.filter(t => t.circuitBreakerStatus === 'HEALTHY' && !t.autonomyPaused);
      } else if (status === 'warning') {
        tenants = tenants.filter(t => t.circuitBreakerStatus === 'WARNING');
      } else if (status === 'tripped') {
        tenants = tenants.filter(t => t.circuitBreakerStatus === 'TRIPPED');
      } else if (status === 'paused') {
        tenants = tenants.filter(t => t.autonomyPaused);
      }
    }

    return ok({
      total: tenants.length,
      tenants,
    }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
