import { z } from 'zod';
import { db } from '@/lib/db';
import { orchestrator } from '@/lib/orchestrator';
import { UserContext } from '@/lib/auth/context';

export const ClassifyReplySchema = z.object({
  action: z.enum(['classify_reply', 'run_reeval']),
  leadId: z.string().min(1),
  messageId: z.string().min(1),
  replyText: z.string().min(1),
});

export async function classifyReplyAction(input: z.infer<typeof ClassifyReplySchema>, context: UserContext, traceId: string) {
  const message = await db.outreachMessage.findFirst({
    where: {
      id: input.messageId,
      leadId: input.leadId,
      organizationId: context.organizationId,
    },
  });
  if (!message) throw new Error('Message not found');
  return orchestrator.runReEval(input.leadId, input.messageId, input.replyText, context.organizationId, traceId);
}
