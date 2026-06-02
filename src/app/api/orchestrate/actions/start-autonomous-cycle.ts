import { z } from 'zod';
import { enqueueJob } from '@/lib/queue/producers';
import { UserContext } from '@/lib/auth/context';

export const StartAutonomousCycleSchema = z.object({
  action: z.enum(['start_autonomous_cycle', 'run_autonomous_cycle']),
  campaignId: z.string().optional(),
});

export async function startAutonomousCycleAction(input: z.infer<typeof StartAutonomousCycleSchema>, context: UserContext, traceId: string) {
  return enqueueJob('autonomous-cycle', {
    organizationId: context.organizationId,
    userId: context.userId,
    campaignId: input.campaignId,
    traceId,
  }, {
    userId: context.userId,
    traceId,
    dedupeKey: `autonomous-cycle:${context.organizationId}`,
  });
}
