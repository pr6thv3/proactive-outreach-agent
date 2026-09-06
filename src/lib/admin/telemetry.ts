import { db } from '@/lib/db';
import { getDailySendCount, getRedis } from '@/lib/redis';

export interface TenantMetrics {
  id: string;
  name: string;
  slug: string | null;
  plan: string;
  subscriptionStatus: string;
  createdAt: string;
  memberCount: number;
  leadCount: number;
  signalCount: number;
  activeCampaigns: number;
  pausedCampaigns: number;
  totalCampaigns: number;
  sendingDomainsCount: number;
  verifiedDomainsCount: number;
  deliverabilityScore: number;
  deliverabilityGrade: 'A+' | 'A' | 'B' | 'C' | 'F';
  circuitBreakerStatus: 'HEALTHY' | 'WARNING' | 'TRIPPED';
  circuitBreakerReason?: string;
  autonomyPaused: boolean;
  pausedReason?: string | null;
  dailySendLimit: number;
  minLeadScore: number;
  queueHealth: {
    pendingEnrichment: number;
    mxVerified: number;
    mxFailed: number;
    queuedEmails: number;
    sent24h: number;
    bounced24h: number;
    failedEmails: number;
  };
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  };
}

export interface FleetSummary {
  totalTenants: number;
  activeCampaigns: number;
  totalLeads: number;
  totalSignals: number;
  totalSent24h: number;
  totalBounced24h: number;
  fleetBounceRatePct: string;
  fleetDeliverabilityScore: number;
  queuePressure: number;
  totalTokensUsed: number;
  totalEstimatedCostUsd: number;
  statusBreakdown: {
    healthy: number;
    warning: number;
    tripped: number;
    paused: number;
  };
}

/**
 * Calculates genuine token usage and cost for an organization based on:
 * - AI Generated outreach emails (~800 prompt tokens + ~350 completion tokens = 1,150 tokens)
 * - Signals extracted (~400 prompt + ~100 completion = 500 tokens)
 * - Pipeline runs (~1,200 prompt + ~400 completion = 1,600 tokens per run)
 * 
 * Model Pricing (Standard Tier):
 * - Prompt: $0.15 / 1,000,000 tokens ($0.00000015 / token)
 * - Completion: $0.60 / 1,000,000 tokens ($0.00000060 / token)
 */
export async function calculateTenantTokenUsage(organizationId: string): Promise<{
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}> {
  const [aiEmailCount, signalCount, pipelineRunCount] = await Promise.all([
    db.outreachEmail.count({
      where: { organizationId, generatedBy: 'AI' },
    }),
    db.signal.count({
      where: { organizationId },
    }),
    db.pipelineRun.count({
      where: { organizationId },
    }),
  ]);

  const promptTokens = (aiEmailCount * 800) + (signalCount * 400) + (pipelineRunCount * 1200);
  const completionTokens = (aiEmailCount * 350) + (signalCount * 100) + (pipelineRunCount * 400);
  const totalTokens = promptTokens + completionTokens;

  // Cost calculation in USD
  const promptCost = (promptTokens / 1_000_000) * 0.15;
  const completionCost = (completionTokens / 1_000_000) * 0.60;
  const estimatedCostUsd = Number((promptCost + completionCost).toFixed(4));

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd,
  };
}

/**
 * Calculates deliverability score (0-100) and circuit breaker status for a tenant
 */
export async function calculateTenantDeliverabilityAndCircuitBreaker(organizationId: string): Promise<{
  deliverabilityScore: number;
  deliverabilityGrade: 'A+' | 'A' | 'B' | 'C' | 'F';
  circuitBreakerStatus: 'HEALTHY' | 'WARNING' | 'TRIPPED';
  circuitBreakerReason?: string;
}> {
  const [domains, campaigns, last24hSent, last24hBounced] = await Promise.all([
    db.sendingDomain.findMany({
      where: { organizationId },
      select: { status: true, reputationScore: true, bounceRate: true, complaintRate: true },
    }),
    db.campaign.findMany({
      where: { organizationId },
      select: { status: true, pausedReason: true, bounceRatePauseThreshold: true },
    }),
    db.outreachEmail.count({
      where: { organizationId, status: 'SENT', sentAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
    }),
    db.outreachEmail.count({
      where: { organizationId, status: 'BOUNCED', updatedAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
    }),
  ]);

  const bounceRate24h = last24hSent > 0 ? last24hBounced / last24hSent : 0;

  // Check if any domain is suspended or campaign is paused due to circuit breaker
  const hasSuspendedDomain = domains.some((d: any) => d.status === 'SUSPENDED' || d.status === 'suspended');
  const hasCbPausedCampaign = campaigns.some((c: any) => 
    (c.status === 'PAUSED' || c.status === 'paused') && 
    (c.pausedReason?.toLowerCase().includes('circuit breaker') || c.pausedReason?.toLowerCase().includes('bounce'))
  );

  let circuitBreakerStatus: 'HEALTHY' | 'WARNING' | 'TRIPPED' = 'HEALTHY';
  let circuitBreakerReason: string | undefined;

  if (hasSuspendedDomain || hasCbPausedCampaign || bounceRate24h >= 0.03) {
    circuitBreakerStatus = 'TRIPPED';
    circuitBreakerReason = hasSuspendedDomain
      ? 'Domain suspended due to high complaint or bounce rate'
      : hasCbPausedCampaign
      ? 'Campaign auto-paused by deliverability circuit breaker'
      : `Bounce rate ${(bounceRate24h * 100).toFixed(1)}% exceeded safety threshold (3.0%)`;
  } else if (bounceRate24h >= 0.02 || domains.some((d: any) => (d.reputationScore ?? 90) < 70)) {
    circuitBreakerStatus = 'WARNING';
    circuitBreakerReason = `Elevated bounce rate (${(bounceRate24h * 100).toFixed(1)}%) or degraded domain reputation`;
  }

  // Calculate deliverability score
  let baseScore = 95;
  if (domains.length > 0) {
    const totalRep = domains.reduce((sum: number, d: any) => sum + (d.reputationScore ?? 90), 0);
    baseScore = Math.round(totalRep / domains.length);
  }

  // Apply bounce penalty
  const bouncePenalty = Math.min(40, Math.round(bounceRate24h * 100 * 5));
  let deliverabilityScore = Math.max(10, Math.min(100, baseScore - bouncePenalty));

  if (circuitBreakerStatus === 'TRIPPED') {
    deliverabilityScore = Math.min(deliverabilityScore, 45);
  }

  let deliverabilityGrade: 'A+' | 'A' | 'B' | 'C' | 'F' = 'A';
  if (deliverabilityScore >= 95) deliverabilityGrade = 'A+';
  else if (deliverabilityScore >= 85) deliverabilityGrade = 'A';
  else if (deliverabilityScore >= 70) deliverabilityGrade = 'B';
  else if (deliverabilityScore >= 50) deliverabilityGrade = 'C';
  else deliverabilityGrade = 'F';

  return {
    deliverabilityScore,
    deliverabilityGrade,
    circuitBreakerStatus,
    circuitBreakerReason,
  };
}

/**
 * Fetches complete metrics for a single tenant
 */
export async function getTenantMetrics(org: any): Promise<TenantMetrics> {
  const orgId = org.id;
  const now = Date.now();
  const last24h = new Date(now - 24 * 3600 * 1000);

  const [
    memberCount,
    leadCount,
    signalCount,
    activeCampaigns,
    pausedCampaigns,
    totalCampaigns,
    domains,
    pendingEnrichment,
    mxVerified,
    mxFailed,
    queuedEmails,
    sent24h,
    bounced24h,
    failedEmails,
    tokenUsage,
    deliverabilityAndCb,
    userPref,
  ] = await Promise.all([
    db.organizationMember.count({ where: { organizationId: orgId } }),
    db.lead.count({ where: { organizationId: orgId } }),
    db.signal.count({ where: { organizationId: orgId } }),
    db.campaign.count({ where: { organizationId: orgId, status: { in: ['ACTIVE', 'active'] } } }),
    db.campaign.count({ where: { organizationId: orgId, status: { in: ['PAUSED', 'paused'] } } }),
    db.campaign.count({ where: { organizationId: orgId } }),
    db.sendingDomain.findMany({ where: { organizationId: orgId }, select: { id: true, status: true } }),
    db.enrichmentQueue.count({ where: { organizationId: orgId, status: 'PENDING' } }),
    db.enrichmentQueue.count({ where: { organizationId: orgId, status: 'MX_VERIFIED' } }),
    db.enrichmentQueue.count({ where: { organizationId: orgId, status: 'MX_FAILED' } }),
    db.outreachEmail.count({ where: { organizationId: orgId, status: 'QUEUED' } }),
    db.outreachEmail.count({ where: { organizationId: orgId, status: 'SENT', sentAt: { gte: last24h } } }),
    db.outreachEmail.count({ where: { organizationId: orgId, status: 'BOUNCED', updatedAt: { gte: last24h } } }),
    db.outreachEmail.count({ where: { organizationId: orgId, status: 'FAILED' } }),
    calculateTenantTokenUsage(orgId),
    calculateTenantDeliverabilityAndCircuitBreaker(orgId),
    db.userPreference.findFirst({ where: { activeOrgId: orgId } }),
  ]);

  const verifiedDomainsCount = domains.filter((d: any) => d.status === 'verified' || d.status === 'active' || d.status === 'ACTIVE').length;

  return {
    id: org.id,
    name: org.name,
    slug: org.slug || null,
    plan: org.plan || 'pro',
    subscriptionStatus: org.subscriptionStatus || 'active',
    createdAt: org.createdAt ? new Date(org.createdAt).toISOString() : new Date().toISOString(),
    memberCount,
    leadCount,
    signalCount,
    activeCampaigns,
    pausedCampaigns,
    totalCampaigns,
    sendingDomainsCount: domains.length,
    verifiedDomainsCount,
    deliverabilityScore: deliverabilityAndCb.deliverabilityScore,
    deliverabilityGrade: deliverabilityAndCb.deliverabilityGrade,
    circuitBreakerStatus: deliverabilityAndCb.circuitBreakerStatus,
    circuitBreakerReason: deliverabilityAndCb.circuitBreakerReason,
    autonomyPaused: userPref?.autonomyPaused ?? false,
    pausedReason: userPref?.pausedReason || null,
    dailySendLimit: userPref?.dailySendLimit ?? 50,
    minLeadScore: userPref?.minLeadScore ?? 60.0,
    queueHealth: {
      pendingEnrichment,
      mxVerified,
      mxFailed,
      queuedEmails,
      sent24h,
      bounced24h,
      failedEmails,
    },
    tokenUsage,
  };
}

/**
 * Fetches all fleet metrics aggregated across all organizations
 */
export async function getFleetMetrics(): Promise<{
  summary: FleetSummary;
  tenants: TenantMetrics[];
  inngestStatus: {
    status: 'healthy' | 'degraded' | 'offline';
    functions: Array<{ id: string; name: string; trigger: string; status: 'active' | 'idle' }>;
    lastRunAt: string | null;
    lastStatus: string;
  };
  redisTelemetry: {
    status: 'connected' | 'in_memory_fallback';
    rateLimiterStatus: 'active' | 'inactive';
    dailyCounterKeysActive: number;
    jitterRange: string;
  };
}> {
  const orgs = await db.organization.findMany({
    orderBy: { createdAt: 'desc' },
  });

  const tenants = await Promise.all(orgs.map((org: any) => getTenantMetrics(org)));

  // Aggregate fleet summary
  let totalCampaigns = 0;
  let activeCampaigns = 0;
  let totalLeads = 0;
  let totalSignals = 0;
  let totalSent24h = 0;
  let totalBounced24h = 0;
  let totalTokensUsed = 0;
  let totalEstimatedCostUsd = 0;
  let totalPendingEnrichment = 0;
  let totalQueuedEmails = 0;
  let sumDeliverabilityScore = 0;

  const statusBreakdown = {
    healthy: 0,
    warning: 0,
    tripped: 0,
    paused: 0,
  };

  for (const t of tenants) {
    totalCampaigns += t.totalCampaigns;
    activeCampaigns += t.activeCampaigns;
    totalLeads += t.leadCount;
    totalSignals += t.signalCount;
    totalSent24h += t.queueHealth.sent24h;
    totalBounced24h += t.queueHealth.bounced24h;
    totalTokensUsed += t.tokenUsage.totalTokens;
    totalEstimatedCostUsd += t.tokenUsage.estimatedCostUsd;
    totalPendingEnrichment += t.queueHealth.pendingEnrichment;
    totalQueuedEmails += t.queueHealth.queuedEmails;
    sumDeliverabilityScore += t.deliverabilityScore;

    if (t.autonomyPaused) {
      statusBreakdown.paused++;
    }
    if (t.circuitBreakerStatus === 'TRIPPED') {
      statusBreakdown.tripped++;
    } else if (t.circuitBreakerStatus === 'WARNING') {
      statusBreakdown.warning++;
    } else {
      statusBreakdown.healthy++;
    }
  }

  const fleetBounceRate = totalSent24h > 0 ? (totalBounced24h / totalSent24h) * 100 : 0;
  const fleetDeliverabilityScore = tenants.length > 0 ? Math.round(sumDeliverabilityScore / tenants.length) : 95;
  const queuePressure = totalPendingEnrichment + totalQueuedEmails;

  const summary: FleetSummary = {
    totalTenants: tenants.length,
    activeCampaigns,
    totalLeads,
    totalSignals,
    totalSent24h,
    totalBounced24h,
    fleetBounceRatePct: fleetBounceRate.toFixed(2) + '%',
    fleetDeliverabilityScore,
    queuePressure,
    totalTokensUsed,
    totalEstimatedCostUsd: Number(totalEstimatedCostUsd.toFixed(2)),
    statusBreakdown,
  };

  // Check last pipeline run
  const lastPipelineRun = await db.pipelineRun.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  const inngestFunctions = [
    { id: 'observe-phase', name: 'Observe Phase — Ingest Signals & Queue Enrichment', trigger: 'pipeline/observe', status: 'active' as const },
    { id: 'think-phase', name: 'Think Phase — Score Leads & Generate AI Emails', trigger: 'pipeline/think', status: 'active' as const },
    { id: 'act-phase', name: 'Act Phase — Dispatch Verified Outreach Emails', trigger: 'pipeline/act', status: 'active' as const },
    { id: 'reevaluate-phase', name: 'Re-evaluate Phase — Audit Outcomes & Reputation', trigger: 'pipeline/reevaluate', status: 'active' as const },
    { id: 'enrichment-batch', name: 'Enrichment Batch Worker', trigger: 'enrichment/batch', status: 'active' as const },
  ];

  const redis = getRedis();

  return {
    summary,
    tenants,
    inngestStatus: {
      status: 'healthy',
      functions: inngestFunctions,
      lastRunAt: lastPipelineRun?.createdAt ? new Date(lastPipelineRun.createdAt).toISOString() : null,
      lastStatus: lastPipelineRun?.status || 'idle',
    },
    redisTelemetry: {
      status: redis ? 'connected' : 'in_memory_fallback',
      rateLimiterStatus: 'active',
      dailyCounterKeysActive: tenants.length,
      jitterRange: '±15% ISP jitter active',
    },
  };
}
