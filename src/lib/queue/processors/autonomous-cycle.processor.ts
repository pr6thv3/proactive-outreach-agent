import { AutonomousWorkflowEngine } from '@/lib/agents/infrastructure/autonomous-engine';
import { AutonomousCycleJobData } from '@/lib/queue/types';

export async function processAutonomousCycleJob(data: AutonomousCycleJobData) {
  const engine = new AutonomousWorkflowEngine({ organizationId: data.organizationId });
  return engine.runCycle();
}
