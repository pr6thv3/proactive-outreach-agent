import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';
import { AutonomyLevel } from '@/lib/policy/types';
import { mapStringToAutonomyLevel } from '@/lib/policy/autonomy-enforcer';
import { mapAutonomyLevelToMode, mapModeToAutonomyLevel, mapLevelToPrisma } from '@/lib/policy/autonomy-mode';

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Body is optional
    }

    // Determine target autonomy level from autonomyMode or autonomyLevel input
    let targetAutonomyLevel = AutonomyLevel.LEVEL_1_ASSISTED;
    if (body.autonomyMode !== undefined) {
      targetAutonomyLevel = mapModeToAutonomyLevel(body.autonomyMode);
    } else if (body.autonomyLevel !== undefined) {
      targetAutonomyLevel = mapStringToAutonomyLevel(body.autonomyLevel);
    }

    const prismaLevel = mapLevelToPrisma(targetAutonomyLevel);

    const pref = await db.userPreference.upsert({
      where: { userId: context.userId },
      update: {
        onboardingStep: 4,
        onboardingComplete: true,
        autonomyLevel: prismaLevel,
        ...(body.dailySendLimit ? { dailySendLimit: Number(body.dailySendLimit) } : {}),
        ...(body.minLeadScore ? { minLeadScore: Number(body.minLeadScore) } : {}),
        ...(typeof body.autonomyEnabled === 'boolean' ? { autonomyEnabled: body.autonomyEnabled } : {}),
      },
      create: {
        userId: context.userId,
        activeOrgId: context.organizationId,
        onboardingStep: 4,
        onboardingComplete: true,
        autonomyLevel: prismaLevel,
        ...(body.dailySendLimit ? { dailySendLimit: Number(body.dailySendLimit) } : {}),
        ...(body.minLeadScore ? { minLeadScore: Number(body.minLeadScore) } : {}),
        ...(typeof body.autonomyEnabled === 'boolean' ? { autonomyEnabled: body.autonomyEnabled } : {}),
      },
    });

    let campaignCreated: any = null;
    if (body.campaignName && (body.sequenceSteps || body.goal)) {
      campaignCreated = await db.campaign.create({
        data: {
          organizationId: context.organizationId,
          name: body.campaignName,
          goal: body.goal || 'Conversational Onboarding Launch',
          targetAudience: body.targetAudience || 'Target ICP Decision Makers',
          offer: body.offer || 'Value Proposition Demo',
          senderName: body.senderName || 'Alex',
          senderEmail: body.senderEmail || 'outreach@company.com',
          fromName: body.senderName || 'Alex',
          fromEmail: body.senderEmail || 'outreach@company.com',
          dailyLimit: Number(body.dailySendLimit) || 50,
          maxDailySends: Number(body.dailySendLimit) || 50,
          status: 'ACTIVE',
          productDescription: body.productDescription || '',
          sequenceSteps: body.sequenceSteps
            ? typeof body.sequenceSteps === 'string'
              ? body.sequenceSteps
              : JSON.stringify(body.sequenceSteps)
            : undefined,
          followUpSchedule: JSON.stringify([3, 7, 12]),
        } as any,
      });
    }

    return ok({
      onboardingComplete: pref.onboardingComplete,
      onboardingStep: pref.onboardingStep,
      autonomyLevel: pref.autonomyLevel,
      autonomyMode: mapAutonomyLevelToMode(pref.autonomyLevel),
      campaignId: campaignCreated?.id || null,
    }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
