import { z } from 'zod';
import { db } from '@/lib/db';
import { enqueueJob } from '@/lib/queue/producers';
import { UserContext } from '@/lib/auth/context';

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
  if (message.status !== 'approved') throw new Error(`Message must be approved before sending; current status is ${message.status}`);

  const job = await enqueueJob('send-email', {
    organizationId: context.organizationId,
    userId: context.userId,
    leadId: message.leadId,
    campaignId: message.campaignId || undefined,
    messageId: message.id,
    dryRun: input.dryRun === true,
    traceId,
  });

  return job;
}
