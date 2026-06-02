import { z } from 'zod';
import { db } from '@/lib/db';
import { UserContext } from '@/lib/auth/context';
import { enqueueJob } from '@/lib/queue/producers';

export const RunPipelineSchema = z.object({
  action: z.enum(['run_full_pipeline', 'run_pipeline']),
  leadId: z.string().min(1),
  campaignId: z.string().optional(),
  objective: z.string().optional(),
});

export async function runPipelineAction(input: z.infer<typeof RunPipelineSchema>, context: UserContext, traceId: string) {
  const lead = await db.lead.findFirst({
    where: { id: input.leadId, organizationId: context.organizationId },
  });
  if (!lead) throw new Error('Lead not found');

  if (input.campaignId) {
    const campaign = await db.campaign.findFirst({
      where: { id: input.campaignId, organizationId: context.organizationId },
    });
    if (!campaign) throw new Error('Campaign not found');
  }

  const observeJob = await enqueueJob('scrape', {
    organizationId: context.organizationId,
    userId: context.userId,
    leadId: input.leadId,
    campaignId: input.campaignId,
    traceId,
  });

  const scoringJob = await enqueueJob('scoring', {
    organizationId: context.organizationId,
    userId: context.userId,
    leadId: input.leadId,
    campaignId: input.campaignId,
    traceId,
  });

  const draftJob = await enqueueJob('draft-email', {
    organizationId: context.organizationId,
    userId: context.userId,
    leadId: input.leadId,
    campaignId: input.campaignId,
    objective: input.objective,
    traceId,
  });

  return { jobs: [observeJob, scoringJob, draftJob] };
}
