import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';

const RoleSchema = z.object({
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']),
});

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('ADMIN', request);
    const { id } = await params;

    const result = await db.organizationMember.deleteMany({
      where: { id, organizationId: context.organizationId },
    });

    if (result.count === 0) return fail('Member not found', 404, 'not_found', traceId);
    return ok({ deleted: true }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('ADMIN', request);
    const { id } = await params;
    const body = await request.json();
    const { role } = RoleSchema.parse(body);

    const updated = await db.organizationMember.updateMany({
      where: { id, organizationId: context.organizationId },
      data: { role: role as any },
    });

    if (updated.count === 0) return fail('Member not found', 404, 'not_found', traceId);
    const member = await db.organizationMember.findFirst({ where: { id } });
    return ok(member, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
