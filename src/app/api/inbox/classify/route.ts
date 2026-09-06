// ─── API: /api/inbox/classify — 6-Category Reply Classifier ───────────────────
import { NextRequest } from 'next/server';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok, badRequest } from '@/lib/api/responses';
import { classifyReply } from '@/lib/agents/reeval/reply-classifier';

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const body = await request.json();
    const { replyText, messageId, leadId } = body;

    if (!replyText || typeof replyText !== 'string') {
      return badRequest('replyText is required', traceId);
    }

    const result = await classifyReply({
      replyText: replyText.trim(),
      messageId,
      leadId,
      organizationId: context.organizationId,
    });

    return ok(result, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
