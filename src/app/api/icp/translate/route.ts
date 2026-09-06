// ─── API: ICP / Conversational Goal Translation ──────────────────────────────
// Translates natural language campaign goals into structured ICP, personas, and sequences
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';
import { translateGoalToStrategy } from '@/lib/agents/think/goal-translator';

const GoalTranslationSchema = z.object({
  goalPrompt: z.string().min(1, 'goalPrompt is required'),
  valueProposition: z.string().optional(),
  productDescription: z.string().optional(),
  organizationId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const body = await request.json();
    const validated = GoalTranslationSchema.parse(body);

    const result = translateGoalToStrategy({
      goalPrompt: validated.goalPrompt,
      valueProposition: validated.valueProposition,
      productDescription: validated.productDescription,
      organizationId: validated.organizationId || context.organizationId,
    });

    return ok(result, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
