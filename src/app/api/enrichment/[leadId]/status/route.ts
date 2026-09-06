import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const { leadId } = await params;

    if (!leadId) {
      return fail('Lead ID is required', 400, 'bad_request', traceId);
    }

    const lead = await db.lead.findFirst({
      where: {
        id: leadId,
        organizationId: context.organizationId,
      },
      include: {
        enrichmentQueues: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!lead) {
      return fail('Lead not found in workspace', 404, 'not_found', traceId);
    }

    const queueRecord = lead.enrichmentQueues?.[0] || null;
    const verificationStatus = lead.emailVerified
      ? 'VERIFIED'
      : (queueRecord?.status || 'PENDING');
    const errorDetails = queueRecord?.lastError || null;

    return ok({
      leadId: lead.id,
      organizationId: context.organizationId,
      email: lead.email,
      emailVerified: lead.emailVerified,
      verificationStatus,
      status: verificationStatus,
      mxValid: queueRecord ? queueRecord.mxValid : lead.emailVerified,
      errorDetails,
      lastError: errorDetails,
      retryCount: queueRecord?.retryCount ?? 0,
      nextRetryAt: queueRecord?.nextRetryAt ?? null,
      provider: queueRecord?.provider ?? null,
      providerData: queueRecord?.providerData ?? null,
      queueRecord,
    }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
