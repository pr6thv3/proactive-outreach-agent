import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';
import {
  getWorkspaceEmergencyStopStatus,
  setWorkspaceEmergencyStop,
} from '@/lib/safety/emergency-stop';

const EmergencyStopSchema = z.object({
  stopped: z.boolean().optional(),
  action: z.enum(['engage', 'release']).optional(),
  paused: z.boolean().optional(),
  reason: z.string().optional(),
}).refine(
  data => data.stopped !== undefined || data.action !== undefined || data.paused !== undefined,
  {
    message: "Must provide 'stopped' (boolean) or 'action' ('engage' | 'release')",
  }
);

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const status = await getWorkspaceEmergencyStopStatus(context.organizationId);

    return ok({
      emergencyStop: status,
      isStopped: status.isStopped,
      organizationId: context.organizationId,
    }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const body = await request.json();
    const parsed = EmergencyStopSchema.parse(body);

    let stopped: boolean;
    if (parsed.stopped !== undefined) {
      stopped = parsed.stopped;
    } else if (parsed.action !== undefined) {
      stopped = parsed.action === 'engage';
    } else {
      stopped = Boolean(parsed.paused);
    }

    const reason = parsed.reason || (stopped ? 'Emergency stop engaged via API' : 'Emergency stop released via API');

    const status = await setWorkspaceEmergencyStop(
      context.organizationId,
      stopped,
      reason,
      context.userId
    );

    return ok({
      emergencyStop: status,
      isStopped: status.isStopped,
      organizationId: context.organizationId,
      message: stopped
        ? 'Workspace Emergency Stop successfully ENGAGED. All outbound side-effects are blocked.'
        : 'Workspace Emergency Stop successfully RELEASED. Outbound operations resumed.',
    }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
