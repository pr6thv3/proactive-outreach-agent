import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';
import { verifyLeadMx } from '@/lib/deliverability/mx-verifier';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('MEMBER', request);
    const { id } = await params;

    const lead = await db.lead.findFirst({
      where: { id, organizationId: context.organizationId },
    });
    if (!lead) return fail('Lead not found', 404, 'not_found', traceId);

    const verification = await verifyLeadMx(id, context.organizationId);

    const queueItem = await db.enrichmentQueue.findFirst({
      where: { leadId: id, organizationId: context.organizationId },
    });

    return ok({
      ...(queueItem || {}),
      verification,
      valid: verification.valid,
      mxValid: verification.valid,
      status: verification.valid ? 'MX_VERIFIED' : 'MX_FAILED',
    }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
