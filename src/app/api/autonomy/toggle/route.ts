import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';

const ToggleSchema = z.object({
  enabled: z.boolean(),
});

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const body = await request.json();
    const { enabled } = ToggleSchema.parse(body);

    const pref = await db.userPreference.upsert({
      where: { userId: context.userId },
      update: {
        autonomyEnabled: enabled,
      },
      create: {
        userId: context.userId,
        activeOrgId: context.organizationId,
        autonomyEnabled: enabled,
      },
    });

    await db.activity.create({
      data: {
        organizationId: context.organizationId,
        leadId: context.userId,
        type: enabled ? 'autopilot_mode_enabled' : 'autopilot_mode_disabled',
        description: enabled
          ? '1-Click Autopilot Mode ACTIVATED: Agent autonomously discovering, qualifying, drafting, safety-auditing, and dispatching.'
          : 'HITL Review Mode ACTIVATED: Outreach drafts await human confirmation.',
        phase: 'act',
      },
    }).catch(() => {});

    return ok({
      autonomyEnabled: pref.autonomyEnabled,
      mode: enabled ? 'autopilot' : 'review',
    }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
