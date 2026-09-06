import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole, requireWorkspace } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';

const UpdateLeadSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  linkedinUrl: z.string().optional(),
  website: z.string().optional(),
  status: z.string().optional(),
  score: z.number().optional(),
  isBlacklisted: z.boolean().optional(),
  doNotContact: z.boolean().optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const { id } = await params;

    const lead = await db.lead.findFirst({
      where: { id, organizationId: context.organizationId },
      include: {
        signals: { orderBy: { observedAt: 'desc' } },
        enrichmentQueues: { orderBy: { createdAt: 'desc' } },
        outreachEmails: { orderBy: { createdAt: 'desc' } },
        activities: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });

    if (!lead) return fail('Lead not found', 404, 'not_found', traceId);
    return ok(lead, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('MEMBER', request);
    const { id } = await params;
    const body = await request.json();
    const validated = UpdateLeadSchema.parse(body);

    const updated = await db.lead.updateMany({
      where: { id, organizationId: context.organizationId },
      data: validated,
    });

    if (updated.count === 0) return fail('Lead not found', 404, 'not_found', traceId);
    const lead = await db.lead.findFirst({ where: { id } });
    return ok(lead, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('MEMBER', request);
    const { id } = await params;

    const result = await db.lead.deleteMany({
      where: { id, organizationId: context.organizationId },
    });

    if (result.count === 0) return fail('Lead not found', 404, 'not_found', traceId);
    return ok({ deleted: true }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
