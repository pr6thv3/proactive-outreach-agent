import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';
import { CampaignLeadStatus } from '@prisma/client';

const EnrollLeadsSchema = z.object({
  leadIds: z.array(z.string().min(1)),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('MEMBER', request);
    const { id: campaignId } = await params;
    const body = await request.json();
    const { leadIds } = EnrollLeadsSchema.parse(body);

    const campaign = await db.campaign.findFirst({
      where: { id: campaignId, organizationId: context.organizationId },
    });
    if (!campaign) return fail('Campaign not found', 404, 'not_found', traceId);

    let enrolledCount = 0;
    for (const leadId of leadIds) {
      await db.campaignLead.upsert({
        where: { campaignId_leadId: { campaignId, leadId } },
        update: { status: CampaignLeadStatus.ACTIVE },
        create: {
          organizationId: context.organizationId,
          campaignId,
          leadId,
          currentStep: 1,
          status: CampaignLeadStatus.ENROLLED,
        },
      }).catch(() => {});
      enrolledCount++;
    }

    return ok({ enrolledCount, campaignId }, traceId, 201);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
