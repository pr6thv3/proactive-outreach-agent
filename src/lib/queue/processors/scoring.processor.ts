import { ScoringEngine } from '@/lib/agents/think/scoring-engine';
import { orchestrator } from '@/lib/orchestrator';
import { ScoringJobData } from '@/lib/queue/types';

export async function processScoringJob(data: ScoringJobData) {
  if (!data.leadId) throw new Error('leadId is required');
  const engine = new ScoringEngine();
  const buildContext = (orchestrator as unknown as { buildContext: (leadId: string, campaignId?: string) => Promise<unknown> }).buildContext;
  const context = await buildContext.call(orchestrator, data.leadId, data.campaignId);
  if (!context) throw new Error('Lead not found');
  return engine.run({ forceRescore: data.forceRescore }, context as Parameters<typeof engine.run>[1]);
}
