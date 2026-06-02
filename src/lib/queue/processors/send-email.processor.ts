import { orchestrator } from '@/lib/orchestrator';
import { SendEmailJobData } from '@/lib/queue/types';

export async function processSendEmailJob(data: SendEmailJobData) {
  if (!data.messageId) throw new Error('messageId is required');
  return orchestrator.sendMessage(data.messageId, data.dryRun === true);
}
