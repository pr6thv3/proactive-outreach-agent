import { orchestrator } from '@/lib/orchestrator';
import { SignalIntelligenceJobData } from '@/lib/queue/types';

export async function processSignalIntelligenceJob(data: SignalIntelligenceJobData) {
  if (!data.leadId) throw new Error('leadId is required');
  return orchestrator.runObserve(data.leadId);
}
