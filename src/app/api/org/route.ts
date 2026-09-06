import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole, requireWorkspace } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';

const UpdateOrgSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  plan: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const org = await db.organization.findUnique({
      where: { id: context.organizationId },
      include: {
        _count: {
          select: { members: true, leads: true, campaigns: true, sendingDomains: true },
        },
      },
    });

    if (!org) return fail('Organization not found', 404, 'not_found', traceId);
    return ok(org, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function PATCH(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('ADMIN', request);
    const body = await request.json();
    const validated = UpdateOrgSchema.parse(body);

    const updated = await db.organization.update({
      where: { id: context.organizationId },
      data: validated,
    });

    return ok(updated, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
