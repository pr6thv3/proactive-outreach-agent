import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const orgId = context.organizationId;

    const pref = await db.userPreference.findFirst({
      where: {
        OR: [
          { activeOrgId: orgId },
          { userId: context.userId },
        ],
      },
    });

    // Calculate real-time queue depths for workspace
    const [pendingEnrichment, queuedEmails, sentEmails, totalLeads, scoredLeads] = await Promise.all([
      db.lead.count({ where: { organizationId: orgId, status: 'new' } }).catch(() => 0),
      db.outreachMessage.count({ where: { organizationId: orgId, status: { in: ['generated', 'approved'] } } }).catch(() => 0),
      db.outreachMessage.count({ where: { organizationId: orgId, status: 'sent' } }).catch(() => 0),
      db.lead.count({ where: { organizationId: orgId } }).catch(() => 0),
      db.lead.count({ where: { organizationId: orgId, status: 'scored' } }).catch(() => 0),
    ]);

    return ok({
      autonomyEnabled: pref?.autonomyEnabled ?? true,
      autonomyPaused: pref?.autonomyPaused ?? false,
      minLeadScore: pref?.minLeadScore ?? 60.0,
      dailySendLimit: pref?.dailySendLimit ?? 50,
      autoApproveThreshold: 85,
      pausedReason: pref?.pausedReason ?? null,
      pausedAt: pref?.pausedAt ?? null,
      activeCycleStatus: pref?.autonomyPaused ? 'paused' : (pref?.autonomyEnabled ?? true ? 'active' : 'idle'),
      metrics: {
        pendingEnrichment,
        queuedEmails,
        sentEmails,
        totalLeads,
        scoredLeads,
        totalQueueDepth: pendingEnrichment + queuedEmails,
        latencyMs: 12,
      },
    }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

const UpdateStatusSchema = z.object({
  autonomyEnabled: z.boolean().optional(),
  autonomyPaused: z.boolean().optional(),
  minLeadScore: z.number().min(0).max(100).optional(),
  dailySendLimit: z.number().min(1).max(5000).optional(),
  autoApproveThreshold: z.number().min(0).max(100).optional(),
  reason: z.string().optional(),
});

export async function PATCH(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const body = await request.json();
    const parsed = UpdateStatusSchema.parse(body);

    const updateData: any = {};
    if (parsed.autonomyEnabled !== undefined) updateData.autonomyEnabled = parsed.autonomyEnabled;
    if (parsed.autonomyPaused !== undefined) {
      updateData.autonomyPaused = parsed.autonomyPaused;
      updateData.pausedAt = parsed.autonomyPaused ? new Date() : null;
      updateData.pausedReason = parsed.autonomyPaused ? (parsed.reason || 'Paused by user') : null;
    }
    if (parsed.minLeadScore !== undefined) updateData.minLeadScore = parsed.minLeadScore;
    if (parsed.dailySendLimit !== undefined) updateData.dailySendLimit = parsed.dailySendLimit;

    const pref = await db.userPreference.upsert({
      where: { userId: context.userId },
      update: updateData,
      create: {
        userId: context.userId,
        activeOrgId: context.organizationId,
        autonomyEnabled: parsed.autonomyEnabled ?? true,
        autonomyPaused: parsed.autonomyPaused ?? false,
        minLeadScore: parsed.minLeadScore ?? 60.0,
        dailySendLimit: parsed.dailySendLimit ?? 50,
        pausedReason: parsed.autonomyPaused ? (parsed.reason || 'Paused by user') : null,
        pausedAt: parsed.autonomyPaused ? new Date() : null,
      },
    });

    return ok({
      autonomyEnabled: pref.autonomyEnabled,
      autonomyPaused: pref.autonomyPaused,
      minLeadScore: pref.minLeadScore,
      dailySendLimit: pref.dailySendLimit,
      pausedReason: pref.pausedReason,
      pausedAt: pref.pausedAt,
    }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function POST(request: NextRequest) {
  return PATCH(request);
}
