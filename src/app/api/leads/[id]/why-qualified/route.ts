// ─── Interface Contract: "Why Qualified" Intelligence Card (M2) ────────────
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';
import { calculateWhyQualified } from '@/lib/discovery/prospect-discovery';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const { id } = await params;

    const lead = await db.lead.findFirst({
      where: { id, organizationId: context.organizationId },
      include: {
        signals: { orderBy: { observedAt: 'desc' } },
        enrichmentQueues: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!lead) {
      return fail('Lead not found', 404, 'not_found', traceId);
    }

    const whyQualified = calculateWhyQualified(lead, context.organizationId);

    return ok({
      leadId: lead.id,
      organizationId: context.organizationId,
      triggerSignal: whyQualified.triggerSignal,
      icpMatchBreakdown: {
        firmographicScore: whyQualified.icpMatchBreakdown.firmographicScore,
        technographicScore: whyQualified.icpMatchBreakdown.technographicScore,
        intentScore: whyQualified.icpMatchBreakdown.intentScore,
        mxScore: whyQualified.icpMatchBreakdown.mxScore,
        totalScore: whyQualified.icpMatchBreakdown.totalScore,
        details: whyQualified.icpMatchBreakdown.details,
      },
      outreachAngle: whyQualified.outreachAngle,
      aiConfidence: whyQualified.aiConfidence,
      mxVerified: whyQualified.mxVerified,
      priorityTier: whyQualified.priorityTier,
    }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
