import { NextRequest } from 'next/server';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';
import { AutonomousWorkflowEngine } from '@/lib/agents/infrastructure/autonomous-engine';

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const engine = new AutonomousWorkflowEngine({ organizationId: context.organizationId });
    const results = await engine.runCycle();

    return ok(results, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
