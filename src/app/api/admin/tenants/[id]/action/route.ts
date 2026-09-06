import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePlatformAdmin } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok, badRequest, notFound } from '@/lib/api/responses';
import { getRedis } from '@/lib/redis';
import { calculateTenantDeliverabilityAndCircuitBreaker } from '@/lib/admin/telemetry';

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const traceId = createTraceId();
  try {
    const adminContext = await requirePlatformAdmin(request);
    const orgId = params.id;

    const isSystemOrSecret = !adminContext.userId ||
      adminContext.userId.startsWith('api_key') ||
      adminContext.userId === 'platform_admin' ||
      adminContext.userId === 'dev_superadmin';

    const realUser = !isSystemOrSecret ? await db.user.findUnique({ where: { id: adminContext.userId } }) : null;
    const auditUserId = realUser ? realUser.id : null;

    const org = await db.organization.findUnique({
      where: { id: orgId },
      include: { userPreferences: true, members: true },
    });

    if (!org) {
      return notFound('Organization not found', traceId);
    }

    const fallbackUserId = realUser?.id || org.members?.[0]?.userId || (await db.user.findFirst({ where: { memberships: { some: { organizationId: orgId } } } }))?.id || 'admin';

    const body = await request.json().catch(() => ({}));
    const action = body.action;

    if (!action) {
      return badRequest('Action is required', traceId);
    }

    if (action === 'toggle_autonomy') {
      const currentPref = org.userPreferences?.[0];
      const newPausedState = body.paused !== undefined ? Boolean(body.paused) : !(currentPref?.autonomyPaused ?? false);
      const reason = body.reason || (newPausedState ? 'Administrative killswitch triggered by platform admin' : null);

      if (currentPref) {
        await db.userPreference.update({
          where: { id: currentPref.id },
          data: {
            autonomyPaused: newPausedState,
            pausedReason: reason,
            pausedAt: newPausedState ? new Date() : null,
          },
        });
      } else {
        await db.userPreference.create({
          data: {
            userId: fallbackUserId,
            activeOrgId: orgId,
            autonomyPaused: newPausedState,
            pausedReason: reason,
            pausedAt: newPausedState ? new Date() : null,
          },
        });
      }

      await db.auditLog.create({
        data: {
          organizationId: orgId,
          userId: auditUserId,
          action: newPausedState ? 'ADMIN_PAUSE_AUTONOMY' : 'ADMIN_RESUME_AUTONOMY',
          entityType: 'Organization',
          entityId: orgId,
          metadata: { reason, triggeredBy: adminContext.userId },
        },
      });

      return ok({
        success: true,
        action: 'toggle_autonomy',
        autonomyPaused: newPausedState,
        reason,
      }, traceId);
    }

    if (action === 'trigger_health_check') {
      const deliverability = await calculateTenantDeliverabilityAndCircuitBreaker(orgId);
      const activeDomains = await db.sendingDomain.findMany({
        where: { organizationId: orgId },
      });

      await db.auditLog.create({
        data: {
          organizationId: orgId,
          userId: auditUserId,
          action: 'ADMIN_TRIGGER_HEALTH_CHECK',
          entityType: 'Organization',
          entityId: orgId,
          metadata: { deliverabilityScore: deliverability.deliverabilityScore, circuitBreakerStatus: deliverability.circuitBreakerStatus },
        },
      });

      return ok({
        success: true,
        action: 'trigger_health_check',
        deliverability,
        domains: activeDomains.map((d: any) => ({
          domain: d.domain,
          status: d.status,
          reputationScore: d.reputationScore,
          dkimVerified: d.dkimVerified,
          spfVerified: d.spfVerified,
          dmarcVerified: d.dmarcVerified,
        })),
      }, traceId);
    }

    if (action === 'reset_daily_sends') {
      const redis = getRedis();
      const dateStr = new Date().toISOString().split('T')[0];
      const key = `org:${orgId}:sends:${dateStr}`;

      if (redis) {
        try {
          await redis.del(key);
        } catch {
          // Ignore redis error
        }
      }

      await db.sendingDomain.updateMany({
        where: { organizationId: orgId },
        data: { dailySendsCount: 0, dailySendsDate: dateStr },
      });

      await db.auditLog.create({
        data: {
          organizationId: orgId,
          userId: auditUserId,
          action: 'ADMIN_RESET_DAILY_SENDS',
          entityType: 'Organization',
          entityId: orgId,
          metadata: { dateStr },
        },
      });

      return ok({
        success: true,
        action: 'reset_daily_sends',
        message: `Daily send counters reset for ${org.name}`,
      }, traceId);
    }

    if (action === 'update_limits') {
      const currentPref = org.userPreferences?.[0];
      const dailySendLimit = body.dailySendLimit !== undefined ? Number(body.dailySendLimit) : undefined;
      const minLeadScore = body.minLeadScore !== undefined ? Number(body.minLeadScore) : undefined;

      const dataToUpdate: any = {};
      if (dailySendLimit !== undefined && !isNaN(dailySendLimit)) dataToUpdate.dailySendLimit = dailySendLimit;
      if (minLeadScore !== undefined && !isNaN(minLeadScore)) dataToUpdate.minLeadScore = minLeadScore;

      if (currentPref) {
        await db.userPreference.update({
          where: { id: currentPref.id },
          data: dataToUpdate,
        });
      } else {
        await db.userPreference.create({
          data: {
            userId: fallbackUserId,
            activeOrgId: orgId,
            ...dataToUpdate,
          },
        });
      }

      await db.auditLog.create({
        data: {
          organizationId: orgId,
          userId: auditUserId,
          action: 'ADMIN_UPDATE_LIMITS',
          entityType: 'Organization',
          entityId: orgId,
          metadata: dataToUpdate,
        },
      });

      return ok({
        success: true,
        action: 'update_limits',
        updated: dataToUpdate,
      }, traceId);
    }

    if (action === 'clear_failed_queue') {
      const updated = await db.enrichmentQueue.updateMany({
        where: { organizationId: orgId, status: 'MX_FAILED' },
        data: { status: 'PENDING', retryCount: 0, lastError: null },
      });

      await db.auditLog.create({
        data: {
          organizationId: orgId,
          userId: auditUserId,
          action: 'ADMIN_CLEAR_FAILED_QUEUE',
          entityType: 'Organization',
          entityId: orgId,
          metadata: { resetCount: updated.count },
        },
      });

      return ok({
        success: true,
        action: 'clear_failed_queue',
        resetCount: updated.count,
      }, traceId);
    }

    return badRequest(`Unsupported action: ${action}`, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
