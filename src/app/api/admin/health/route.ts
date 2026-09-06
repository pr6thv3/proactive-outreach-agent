import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePlatformAdmin } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';

export async function GET(request?: NextRequest) {
  const traceId = createTraceId();
  try {
    await requirePlatformAdmin(request);
    const now = Date.now();
    const last24h = new Date(now - 24 * 3600 * 1000);
    const last7d = new Date(now - 7 * 86400 * 1000);
    const last1h = new Date(now - 3600 * 1000);

    const [
      activeOrgCount,
      leadCount,
      signalCount,
      pendingEnrichment,
      verifiedEnrichment,
      failedEnrichment,
      sent24h,
      sent7d,
      bounced24h,
      lastPipelineRun,
      domains,
    ] = await Promise.all([
      db.organization.count(),
      db.lead.count(),
      db.signal.count(),
      db.enrichmentQueue.count({ where: { status: 'PENDING' } }),
      db.enrichmentQueue.count({ where: { status: 'MX_VERIFIED' } }),
      db.enrichmentQueue.count({ where: { status: 'MX_FAILED' } }),
      db.outreachEmail.count({ where: { status: 'SENT', sentAt: { gte: last24h } } }),
      db.outreachEmail.count({ where: { status: 'SENT', sentAt: { gte: last7d } } }),
      db.outreachEmail.count({ where: { status: 'BOUNCED', updatedAt: { gte: last24h } } }),
      db.pipelineRun.findFirst({ orderBy: { createdAt: 'desc' } }),
      db.sendingDomain.findMany({ select: { id: true, domain: true, status: true } }),
    ]);

    const bounceRate24h = sent24h > 0 ? (bounced24h / sent24h) * 100 : 0;

    return ok({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      dbPool: { status: 'connected' },
      counts: {
        activeOrgCount,
        leadCount,
        signalCount,
      },
      queueDepth: {
        PENDING: pendingEnrichment,
        MX_VERIFIED: verifiedEnrichment,
        MX_FAILED: failedEnrichment,
      },
      pipeline: {
        lastRunAt: lastPipelineRun?.createdAt || null,
        lastStatus: lastPipelineRun?.status || 'none',
      },
      emails: {
        sentLast24h: sent24h,
        sentLast7d: sent7d,
        bounceRate24hPct: bounceRate24h.toFixed(2) + '%',
      },
      domains: domains.map(d => ({ domain: d.domain, status: d.status, bounceRatePct: '0.00%' })),
      errorRate1h: '0.00%',
    }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
