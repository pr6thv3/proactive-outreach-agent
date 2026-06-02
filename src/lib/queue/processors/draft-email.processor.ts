import { orchestrator } from '@/lib/orchestrator';
import { DraftEmailJobData } from '@/lib/queue/types';

export async function processDraftEmailJob(data: DraftEmailJobData) {
  if (!data.leadId) throw new Error('leadId is required');
  return orchestrator.runThink(data.leadId, data.campaignId, data.objective);
}
