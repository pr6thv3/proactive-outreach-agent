import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePlatformAdmin } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok, notFound } from '@/lib/api/responses';
import { getTenantMetrics } from '@/lib/admin/telemetry';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const traceId = createTraceId();
  try {
    await requirePlatformAdmin(request);
    const orgId = params.id;

    const org = await db.organization.findUnique({
      where: { id: orgId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        },
        userPreferences: true,
        icpCriteria: true,
        sendingDomains: true,
        campaigns: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!org) {
      return notFound('Organization not found', traceId);
    }

    const [
      metrics,
      recentRuns,
      recentAuditLogs,
      enrichmentBreakdown,
      outreachBreakdown,
    ] = await Promise.all([
      getTenantMetrics(org),
      db.pipelineRun.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      db.auditLog.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        take: 15,
      }),
      db.enrichmentQueue.groupBy ? db.enrichmentQueue.groupBy({
        by: ['status'],
        where: { organizationId: orgId },
        _count: { status: true },
      }).catch(() => []) : [],
      db.outreachEmail.groupBy ? db.outreachEmail.groupBy({
        by: ['status'],
        where: { organizationId: orgId },
        _count: { status: true },
      }).catch(() => []) : [],
    ]);

    return ok({
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        subscriptionStatus: org.subscriptionStatus,
        workspaceKey: org.workspaceKey,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt,
      },
      members: org.members.map((m: any) => ({
        id: m.id,
        role: m.role,
        user: m.user,
        joinedAt: m.createdAt,
      })),
      preferences: org.userPreferences?.[0] || null,
      icpCriteria: org.icpCriteria?.[0] || null,
      sendingDomains: org.sendingDomains,
      campaigns: org.campaigns,
      metrics,
      recentRuns,
      recentAuditLogs,
      enrichmentBreakdown,
      outreachBreakdown,
    }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
