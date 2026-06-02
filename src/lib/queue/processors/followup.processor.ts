import { db } from '@/lib/db';
import { FollowupJobData } from '@/lib/queue/types';

export async function processFollowupJob(data: FollowupJobData) {
  if (!data.followUpId) throw new Error('followUpId is required');
  const followUp = await db.followUp.findFirst({
    where: {
      id: data.followUpId,
      organizationId: data.organizationId,
    },
  });

  if (!followUp) throw new Error('Follow-up not found');
  return { success: true, followUpId: followUp.id, status: followUp.status };
}
