import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';
import { DeliverabilityService } from '@/lib/deliverability';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('ADMIN', request);
    const { id } = await params;

    const domain = await db.sendingDomain.findFirst({
      where: { id, organizationId: context.organizationId },
    });
    if (!domain) return fail('Domain not found', 404, 'not_found', traceId);

    const dnsStatus = await DeliverabilityService.verifyDomain(id, context.organizationId);
    return ok(dnsStatus, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
