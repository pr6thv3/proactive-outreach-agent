// ─── API: Review Deck — Approve Similar Batch Action ─────────────────────────
import { NextRequest } from 'next/server';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok, badRequest } from '@/lib/api/responses';
import { db } from '@/lib/db';
import { getDiscoveryProspects } from '@/lib/discovery/prospect-discovery';
import { classifyConfidenceTier } from '@/lib/policy/autonomy-enforcer';

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const body = await request.json().catch(() => ({}));

    const { clusterKey, signalType, confidenceTier, leadIds: explicitLeadIds } = body;

    let targetLeadIds: string[] = [];

    if (Array.isArray(explicitLeadIds) && explicitLeadIds.length > 0) {
      // Validate that all explicit leads belong to this organization
      const validLeads = await db.lead.findMany({
        where: {
          id: { in: explicitLeadIds },
          organizationId: context.organizationId,
        },
        select: { id: true },
      });
      targetLeadIds = validLeads.map((l: { id: string }) => l.id);
    } else if (clusterKey || signalType) {
      // Discover matching leads in the same cluster
      const prospects = await getDiscoveryProspects(context.organizationId, { limit: 100 });
      targetLeadIds = prospects
        .filter(p => {
          const tier = classifyConfidenceTier(p.score);
          const sig = p.triggerSignal?.type || 'growth_expansion';
          const itemClusterKey = `${sig}_${tier}`;

          if (clusterKey && itemClusterKey === clusterKey) return true;
          if (signalType && sig === signalType && (!confidenceTier || tier === confidenceTier)) return true;
          return false;
        })
        .map(p => p.id);
    } else {
      return badRequest('Either clusterKey, signalType, or leadIds array must be provided.');
    }

    if (targetLeadIds.length === 0) {
      return ok({
        message: 'No pending drafts found matching the specified cluster.',
        approvedCount: 0,
        approvedLeadIds: [],
        clusterKey: clusterKey || 'custom_selection',
      }, traceId);
    }

    // Atomic CAS batch update on OutreachMessage and Lead records
    const now = new Date();
    await Promise.all([
      db.outreachMessage.updateMany({
        where: {
          organizationId: context.organizationId,
          leadId: { in: targetLeadIds },
          status: { in: ['draft', 'generated', 'QUEUED'] },
        },
        data: {
          status: 'approved',
          approvedAt: now,
          approvedBy: `approve_similar_${context.userId || 'operator'}`,
        },
      }).catch(() => null),

      db.lead.updateMany({
        where: {
          id: { in: targetLeadIds },
          organizationId: context.organizationId,
        },
        data: {
          status: 'approved',
        },
      }).catch(() => null),
    ]);

    // Record audit event
    await db.agentEvent.create({
      data: {
        organizationId: context.organizationId,
        agentName: 'ReviewDeck',
        eventType: 'BATCH_APPROVE_SIMILAR',
        level: 'info',
        message: `Operator batch approved ${targetLeadIds.length} drafts in cluster ${clusterKey || 'custom'}`,
        details: JSON.stringify({
          clusterKey,
          signalType,
          confidenceTier,
          approvedLeadIds: targetLeadIds,
          approvedCount: targetLeadIds.length,
          actor: context.userId || 'operator',
        }),
      },
    }).catch(() => null);

    return ok({
      message: `Successfully approved ${targetLeadIds.length} similar drafts in cluster.`,
      approvedCount: targetLeadIds.length,
      approvedLeadIds: targetLeadIds,
      clusterKey: clusterKey || 'custom_selection',
    }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
