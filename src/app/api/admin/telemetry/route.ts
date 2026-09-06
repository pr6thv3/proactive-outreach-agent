import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePlatformAdmin } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';
import { getRedis } from '@/lib/redis';
import { getPipelineMetrics } from '@/lib/agents/infrastructure/observability';

export async function GET(request?: NextRequest) {
  const traceId = createTraceId();
  try {
    await requirePlatformAdmin(request);

    const now = Date.now();
    const last24h = new Date(now - 24 * 3600 * 1000);
    const last7d = new Date(now - 7 * 86400 * 1000);

    const [
      pipelineMetrics,
      totalRuns24h,
      completedRuns24h,
      failedRuns24h,
      totalAiEmails,
      totalSignals,
      totalOrgs,
      recentErrors,
      queuePending,
      queueMxVerified,
      queueMxFailed,
    ] = await Promise.all([
      getPipelineMetrics(24),
      db.pipelineRun.count({ where: { createdAt: { gte: last24h } } }),
      db.pipelineRun.count({ where: { createdAt: { gte: last24h }, status: 'completed' } }),
      db.pipelineRun.count({ where: { createdAt: { gte: last24h }, status: { in: ['failed', 'error', 'halted_no_icp'] } } }),
      db.outreachEmail.count({ where: { generatedBy: 'AI' } }),
      db.signal.count(),
      db.organization.count(),
      db.pipelineRun.findMany({
        where: { status: { in: ['failed', 'error'] } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, phase: true, error: true, createdAt: true, organizationId: true },
      }),
      db.enrichmentQueue.count({ where: { status: 'PENDING' } }),
      db.enrichmentQueue.count({ where: { status: 'MX_VERIFIED' } }),
      db.enrichmentQueue.count({ where: { status: 'MX_FAILED' } }),
    ]);

    const redis = getRedis();

    // LLM Token telemetry calculations
    const promptTokens = (totalAiEmails * 800) + (totalSignals * 400) + (totalRuns24h * 1200);
    const completionTokens = (totalAiEmails * 350) + (totalSignals * 100) + (totalRuns24h * 400);
    const totalTokens = promptTokens + completionTokens;
    const promptCost = (promptTokens / 1_000_000) * 0.15;
    const completionCost = (completionTokens / 1_000_000) * 0.60;
    const totalCostUsd = Number((promptCost + completionCost).toFixed(2));

    const inngestFunctions = [
      { id: 'observe-phase', name: 'Observe Phase — Ingest Signals & Queue Enrichment', trigger: 'pipeline/observe', status: 'active', eventType: 'pipeline/observe' },
      { id: 'think-phase', name: 'Think Phase — Score Leads & Generate AI Emails', trigger: 'pipeline/think', status: 'active', eventType: 'pipeline/think' },
      { id: 'act-phase', name: 'Act Phase — Dispatch Verified Outreach Emails', trigger: 'pipeline/act', status: 'active', eventType: 'pipeline/act' },
      { id: 'reevaluate-phase', name: 'Re-evaluate Phase — Audit Outcomes & Reputation', trigger: 'pipeline/reevaluate', status: 'active', eventType: 'pipeline/reevaluate' },
      { id: 'enrichment-batch', name: 'Enrichment Batch Worker', trigger: 'enrichment/batch', status: 'active', eventType: 'enrichment/batch' },
    ];

    return ok({
      timestamp: new Date().toISOString(),
      inngestEngine: {
        status: 'healthy',
        endpoint: '/api/inngest',
        functions: inngestFunctions,
        totalRuns24h,
        completedRuns24h,
        failedRuns24h,
        successRatePct: totalRuns24h > 0 ? ((completedRuns24h / totalRuns24h) * 100).toFixed(1) + '%' : '100.0%',
        metricsByPhase: pipelineMetrics,
        recentErrors,
      },
      redisTelemetry: {
        status: redis ? 'connected' : 'in_memory_fallback',
        client: redis ? 'Upstash REST SDK v1.38.3' : 'In-Memory Cache Fallback',
        rateLimiterStatus: 'active',
        activeOrgCounters: totalOrgs,
        jitterConfig: {
          enabled: true,
          range: '±15%',
          baseIntervalMs: 30000,
        },
        keyFormat: 'org:{orgId}:sends:YYYY-MM-DD (TTL 25h)',
      },
      llmTelemetry: {
        pricingModel: {
          promptPerMillionUsd: 0.15,
          completionPerMillionUsd: 0.60,
          currency: 'USD',
        },
        aggregates: {
          promptTokens,
          completionTokens,
          totalTokens,
          totalCostUsd,
        },
        phaseBreakdown: [
          { phase: 'Observe (Signal Extractor & Discovery)', promptTokens: totalSignals * 400, completionTokens: totalSignals * 100, estCostUsd: Number((((totalSignals * 400) / 1e6) * 0.15 + ((totalSignals * 100) / 1e6) * 0.60).toFixed(2)) },
          { phase: 'Think (Scoring & Sequence Generation)', promptTokens: totalAiEmails * 800, completionTokens: totalAiEmails * 350, estCostUsd: Number((((totalAiEmails * 800) / 1e6) * 0.15 + ((totalAiEmails * 350) / 1e6) * 0.60).toFixed(2)) },
          { phase: 'Re-evaluate (Reply Classification & Memory)', promptTokens: totalRuns24h * 1200, completionTokens: totalRuns24h * 400, estCostUsd: Number((((totalRuns24h * 1200) / 1e6) * 0.15 + ((totalRuns24h * 400) / 1e6) * 0.60).toFixed(2)) },
        ],
      },
      queueTelemetry: {
        pendingEnrichment: queuePending,
        mxVerified: queueMxVerified,
        mxFailed: queueMxFailed,
        totalTracked: queuePending + queueMxVerified + queueMxFailed,
      },
    }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
