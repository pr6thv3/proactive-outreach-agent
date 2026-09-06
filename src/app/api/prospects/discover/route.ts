import { NextRequest } from 'next/server';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';
import { seedAutonomousProspects, getDiscoveryProspects } from '@/lib/discovery/prospect-discovery';

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const createdCount = await seedAutonomousProspects(context.organizationId);
    const prospects = await getDiscoveryProspects(context.organizationId);

    return ok({
      success: true,
      message: `Autonomous prospecting engine discovered ${createdCount} high-intent prospects based on active ICP signals.`,
      createdCount,
      totalDiscovered: prospects.length,
      prospects,
    }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
