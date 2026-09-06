import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';

const StepSchema = z.object({
  step: z.number().int().min(1).max(4),
});

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    let pref = await db.userPreference.findUnique({
      where: { userId: context.userId },
    });

    if (!pref) {
      pref = await db.userPreference.create({
        data: {
          userId: context.userId,
          activeOrgId: context.organizationId,
          onboardingStep: 1,
          onboardingComplete: false,
        },
      });
    }

    return ok({
      onboardingStep: pref.onboardingStep,
      onboardingComplete: pref.onboardingComplete,
      autonomyEnabled: pref.autonomyEnabled,
      dailySendLimit: pref.dailySendLimit,
      minLeadScore: pref.minLeadScore,
    }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const body = await request.json();
    const { step } = StepSchema.parse(body);

    const pref = await db.userPreference.upsert({
      where: { userId: context.userId },
      update: { onboardingStep: step },
      create: {
        userId: context.userId,
        activeOrgId: context.organizationId,
        onboardingStep: step,
        onboardingComplete: false,
      },
    });

    return ok({
      onboardingStep: pref.onboardingStep,
      onboardingComplete: pref.onboardingComplete,
    }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
