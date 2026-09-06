// ─── API: Prospects — Automated Prospect Discovery & Intelligence ───────
import { NextRequest } from 'next/server';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';
import { getDiscoveryProspects, seedAutonomousProspects } from '@/lib/discovery/prospect-discovery';

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const { searchParams } = new URL(request.url);

    const tier = searchParams.get('tier') || undefined;
    const search = searchParams.get('search') || undefined;
    const signalType = searchParams.get('signalType') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const prospects = await getDiscoveryProspects(context.organizationId, {
      tier,
      search,
      signalType,
      limit,
    });

    return ok(prospects, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const createdCount = await seedAutonomousProspects(context.organizationId);

    const prospects = await getDiscoveryProspects(context.organizationId);
    return ok({
      message: `Successfully discovered ${createdCount} new qualified prospects.`,
      createdCount,
      prospects,
    }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
