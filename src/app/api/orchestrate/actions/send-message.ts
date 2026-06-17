import { z } from 'zod';
import { db } from '@/lib/db';
import { enqueueJob } from '@/lib/queue/producers';
import { UserContext } from '@/lib/auth/context';
import { evaluateSendReadiness } from '@/lib/deliverability/send-readiness';

export const SendMessageSchema = z.object({
  action: z.literal('send_message'),
  messageId: z.string().min(1),
  dryRun: z.boolean().optional(),
});

export async function sendMessageAction(input: z.infer<typeof SendMessageSchema>, context: UserContext, traceId: string) {
  const message = await db.outreachMessage.findFirst({
    where: { id: input.messageId, organizationId: context.organizationId },
  });
  if (!message) throw new Error('Message not found');

  const readiness = await evaluateSendReadiness({
    organizationId: context.organizationId,
    messageId: input.messageId,
    traceId,
  });

  if (!readiness.ready) {
    return {
      ok: false,
      readiness,
      job: null,
    };
  }

  const job = await enqueueJob('send-email', {
    organizationId: context.organizationId,
    userId: context.userId,
    leadId: message.leadId,
    campaignId: message.campaignId || undefined,
    messageId: message.id,
    dryRun: input.dryRun === true,
    traceId,
  });

  const queuedWithoutRedis = job.status === 'queued_without_redis';

  return {
    ok: true,
    readiness,
    queued_without_redis: queuedWithoutRedis,
    job: {
      id: job.jobId,
      providerJobId: job.providerJobId,
      type: 'send-email',
      status: job.status,
      traceId: job.traceId,
      backend: job.backend,
    },
  };
}
