import { orchestrator } from '@/lib/orchestrator';
import { ScrapeJobData } from '@/lib/queue/types';

export async function processScrapeJob(data: ScrapeJobData) {
  if (!data.leadId) throw new Error('leadId is required');
  return orchestrator.runObserve(data.leadId, data.urls);
}
