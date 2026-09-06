import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';

const PreferenceSchema = z.object({
  activeOrgId: z.string().optional(),
  autonomyEnabled: z.boolean().optional(),
  autonomyPaused: z.boolean().optional(),
  minLeadScore: z.number().optional(),
  dailySendLimit: z.number().int().optional(),
});

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    let pref = await db.userPreference.findUnique({ where: { userId: context.userId } });

    if (!pref) {
      pref = await db.userPreference.create({
        data: {
          userId: context.userId,
          activeOrgId: context.organizationId,
        },
      });
    }

    return ok(pref, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const body = await request.json();
    const validated = PreferenceSchema.parse(body);

    const pref = await db.userPreference.upsert({
      where: { userId: context.userId },
      update: validated,
      create: {
        userId: context.userId,
        activeOrgId: validated.activeOrgId || context.organizationId,
        ...validated,
      },
    });

    return ok(pref, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function PATCH(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const body = await request.json();
    const validated = PreferenceSchema.parse(body);

    if (validated.activeOrgId) {
      const org = await db.organization.findUnique({
        where: { id: validated.activeOrgId },
      });
      if (!org) {
        return fail('Target workspace not found', 404, 'not_found', traceId);
      }
    }

    const pref = await db.userPreference.upsert({
      where: { userId: context.userId },
      update: validated,
      create: {
        userId: context.userId,
        activeOrgId: validated.activeOrgId || context.organizationId,
        ...validated,
      },
    });

    return ok(pref, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
