import { z } from 'zod';
import { db } from '@/lib/db';
import { orchestrator } from '@/lib/orchestrator';
import { UserContext } from '@/lib/auth/context';

export const ApproveMessageSchema = z.object({
  action: z.literal('approve_message'),
  messageId: z.string().min(1),
  editedSubject: z.string().optional(),
  editedBody: z.string().optional(),
});

export async function approveMessageAction(input: z.infer<typeof ApproveMessageSchema>, context: UserContext) {
  const message = await db.outreachMessage.findFirst({
    where: { id: input.messageId, organizationId: context.organizationId },
  });
  if (!message) throw new Error('Message not found');

  const result = await orchestrator.approveMessage(input.messageId, input.editedSubject, input.editedBody, context.organizationId);
  if (!result.success) throw new Error(result.error || 'Approval failed');

  await db.outreachMessage.updateMany({
    where: { id: input.messageId, organizationId: context.organizationId },
    data: { approvedBy: context.userId },
  }).catch(() => {});

  return result;
}
