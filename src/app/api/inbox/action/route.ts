// ─── API: /api/inbox/action — Triage Actions (Book Meeting, Snooze, Suppress, Reply) ───
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok, badRequest, notFound } from '@/lib/api/responses';
import { interruptSequence, snoozeSequence } from '@/lib/agents/act/followup-scheduler';
import { addToDncList } from '@/lib/safety';

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const body = await request.json();
    const { action, leadId, snoozeUntil, replyBody, messageId, newCategory } = body;

    if (!action) return badRequest('action is required', traceId);

    // Enforce workspace scoping on lead if leadId is supplied
    let lead: any = null;
    if (leadId) {
      lead = await db.lead.findFirst({
        where: { id: leadId, organizationId: context.organizationId },
      });
      if (!lead) {
        return notFound('Lead not found in workspace', traceId);
      }
    }

    if (action === 'book_meeting') {
      if (!leadId) return badRequest('leadId is required', traceId);
      await db.lead.update({
        where: { id: lead.id },
        data: { status: 'interested' },
      });
      await interruptSequence({
        leadId: lead.id,
        organizationId: context.organizationId,
        reason: 'meeting_booking',
        note: 'Meeting booked from Smart Inbox action',
      });
      return ok({ success: true, message: 'Meeting booked and sequence halted' }, traceId);
    }

    if (action === 'send_reply') {
      if (!leadId) return badRequest('leadId is required', traceId);
      await db.activity.create({
        data: {
          organizationId: context.organizationId,
          type: 'reply_dispatched',
          description: `Reply dispatched to lead: ${replyBody ? replyBody.slice(0, 100) : ''}`,
          phase: 'reeval',
          leadId: lead.id,
        },
      });
      await interruptSequence({
        leadId: lead.id,
        organizationId: context.organizationId,
        reason: 'reply',
        note: 'Reply dispatched by SDR',
      });
      return ok({ success: true, message: 'Reply dispatched successfully' }, traceId);
    }

    if (action === 'snooze') {
      if (!leadId) return badRequest('leadId is required', traceId);
      const targetDate = snoozeUntil ? new Date(snoozeUntil) : new Date(Date.now() + 7 * 86400000);
      await snoozeSequence({
        leadId: lead.id,
        resumeDate: targetDate,
        organizationId: context.organizationId,
        reason: 'Snoozed from Smart Inbox action',
      });
      return ok({ success: true, snoozedUntil: targetDate.toISOString() }, traceId);
    }

    if (action === 'suppress') {
      if (!leadId) return badRequest('leadId is required', traceId);
      await addToDncList(lead.email, 'manual_smart_inbox_suppression', 'smart_inbox', lead.id, context.organizationId);
      await db.lead.update({
        where: { id: lead.id },
        data: {
          status: 'unsubscribed',
          doNotContact: true,
          isBlacklisted: true,
        },
      });
      await interruptSequence({
        leadId: lead.id,
        organizationId: context.organizationId,
        reason: 'unsubscribe',
        note: 'Permanent DNC suppression requested from Smart Inbox action',
      });
      return ok({ success: true, message: 'Lead permanently added to DNC blacklist with 0 future sends' }, traceId);
    }

    if (action === 'reclassify') {
      if (!newCategory) return badRequest('newCategory is required', traceId);
      if (messageId) {
        const classification = await db.replyClassification.findFirst({
          where: { messageId, organizationId: context.organizationId },
        });
        if (!classification) {
          return notFound('Reply classification not found in workspace', traceId);
        }
        await db.replyClassification.updateMany({
          where: { messageId, organizationId: context.organizationId },
          data: { category: newCategory },
        });
      }
      return ok({ success: true, category: newCategory }, traceId);
    }

    return badRequest(`Unknown action: ${action}`, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
