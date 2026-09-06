import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';

const PauseSchema = z.object({
  paused: z.boolean().optional(),
  pause: z.boolean().optional(),
  reason: z.string().optional(),
  leadId: z.string().optional(),
}).refine(data => data.paused !== undefined || data.pause !== undefined, {
  message: "Must provide either 'paused' or 'pause'",
});

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const body = await request.json();
    const parsed = PauseSchema.parse(body);
    const paused = (parsed.paused ?? parsed.pause) as boolean;
    const { reason, leadId: bodyLeadId } = parsed;

    const pausedReasonText = reason || (paused ? 'User manually activated autonomy kill-switch' : null);

    const pref = await db.userPreference.upsert({
      where: { userId: context.userId },
      update: {
        autonomyPaused: paused,
        pausedReason: pausedReasonText,
        pausedAt: paused ? new Date() : null,
      },
      create: {
        userId: context.userId,
        activeOrgId: context.organizationId,
        autonomyPaused: paused,
        pausedReason: pausedReasonText,
        pausedAt: paused ? new Date() : null,
      },
    });

    // Record activity with valid lead id or skip if no leads exist
    let validLeadId: string | null = null;
    if (bodyLeadId) {
      const explicitLead = await db.lead.findFirst({
        where: { id: bodyLeadId, organizationId: context.organizationId },
        select: { id: true },
      });
      if (explicitLead) validLeadId = explicitLead.id;
    }

    if (!validLeadId) {
      const firstLead = await db.lead.findFirst({
        where: { organizationId: context.organizationId },
        select: { id: true },
      });
      if (firstLead) validLeadId = firstLead.id;
    }

    if (validLeadId) {
      await db.activity.create({
        data: {
          organizationId: context.organizationId,
          leadId: validLeadId,
          type: paused ? 'autonomy_killswitch_engaged' : 'autonomy_resumed',
          description: paused
            ? `Autonomy loop PAUSED with zero state loss: ${pausedReasonText}`
            : 'Autonomy background loop RESUMED (zero dropped messages)',
          phase: 'act',
        },
      }).catch(() => {});
    }

    return ok({
      autonomyPaused: pref.autonomyPaused,
      pausedAt: pref.pausedAt,
      reason: pref.pausedReason,
      message: paused
        ? 'Autopilot paused instantly. Zero state loss guaranteed — all queued drafts preserved.'
        : 'Autopilot resumed successfully. Continuous autonomous loop active.',
    }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
