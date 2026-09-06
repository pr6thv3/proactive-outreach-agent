import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';

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

    const pref = await db.userPreference.upsert({
      where: { userId: context.userId },
      update: {
        onboardingStep: 4,
        onboardingComplete: true,
        ...(body.dailySendLimit ? { dailySendLimit: Number(body.dailySendLimit) } : {}),
        ...(body.minLeadScore ? { minLeadScore: Number(body.minLeadScore) } : {}),
        ...(typeof body.autonomyEnabled === 'boolean' ? { autonomyEnabled: body.autonomyEnabled } : {}),
      },
      create: {
        userId: context.userId,
        activeOrgId: context.organizationId,
        onboardingStep: 4,
        onboardingComplete: true,
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
          sequenceSteps: body.sequenceSteps ? (typeof body.sequenceSteps === 'string' ? body.sequenceSteps : JSON.stringify(body.sequenceSteps)) : undefined,
          followUpSchedule: JSON.stringify([3, 7, 12]),
        } as any,
      });
    }

    return ok({
      onboardingComplete: pref.onboardingComplete,
      onboardingStep: pref.onboardingStep,
      campaignId: campaignCreated?.id || null,
    }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
