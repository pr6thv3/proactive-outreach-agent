import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';
import { orchestrator } from '@/lib/orchestrator';

const ApproveLeadSchema = z.object({
  subject: z.string().optional(),
  body: z.string().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const { id: leadId } = await params;
    const body = await request.json().catch(() => ({}));
    const { subject, body: customBody } = ApproveLeadSchema.parse(body);

    const lead = await db.lead.findFirst({
      where: { id: leadId, organizationId: context.organizationId },
    });

    if (!lead) {
      return fail('Lead not found in this workspace', 404, 'not_found', traceId);
    }

    // Find latest draft/generated message for this lead
    let message = await db.outreachMessage.findFirst({
      where: {
        leadId,
        organizationId: context.organizationId,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!message) {
      // Create new outreach draft if none exists yet
      message = await db.outreachMessage.create({
        data: {
          organizationId: context.organizationId,
          leadId,
          subject: subject || `${lead.firstName || lead.name}, quick thought for ${lead.company}`,
          body: customBody || `Hi ${lead.firstName || lead.name},\n\nWould next Tuesday work for a brief intro?`,
          status: 'draft',
          channel: 'email',
          sequencePos: 0,
        },
      });
    }

    // Use orchestrator to approve message and record edit tracking into memory
    const approveResult = await orchestrator.approveMessage(
      message.id,
      subject,
      customBody,
      context.organizationId
    );

    if (!approveResult.success) {
      // Direct update fallback if status was already approved/queued
      await db.outreachMessage.updateMany({
        where: { id: message.id, organizationId: context.organizationId },
        data: {
          ...(subject ? { subject } : {}),
          ...(customBody ? { body: customBody } : {}),
          status: 'approved',
          approvedAt: new Date(),
          approvedBy: context.userId,
        },
      });
      await db.lead.updateMany({
        where: { id: leadId, organizationId: context.organizationId },
        data: { status: 'approved' },
      });
    }

    const updatedMessage = await db.outreachMessage.findUnique({
      where: { id: message.id },
    });

    return ok({
      success: true,
      messageId: message.id,
      leadId,
      status: 'approved',
      subject: updatedMessage?.subject || subject,
      body: updatedMessage?.body || customBody,
    }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
