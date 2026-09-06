import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const startTime = Date.now();
  try {
    const context = await requireWorkspace(request);

    // Parallel DB queries for maximum speed (< 200ms target)
    const [pendingEnrichment, queuedEmails, sentEmails, failedEmails] = await Promise.all([
      db.enrichmentQueue.count({ where: { organizationId: context.organizationId, status: 'PENDING' } }),
      db.outreachEmail.count({ where: { organizationId: context.organizationId, status: 'QUEUED' } }),
      db.outreachEmail.count({ where: { organizationId: context.organizationId, status: 'SENT' } }),
      db.outreachEmail.count({ where: { organizationId: context.organizationId, status: 'FAILED' } }),
    ]);

    const latencyMs = Date.now() - startTime;

    return ok({
      organizationId: context.organizationId,
      metrics: {
        pendingEnrichment,
        queuedEmails,
        sentEmails,
        failedEmails,
        totalQueueDepth: pendingEnrichment + queuedEmails,
      },
      latencyMs,
    }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
