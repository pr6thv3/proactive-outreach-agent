// ─── API: Leads ───────────────────────────────────────
// Production leads API with search, filter, activity, signals

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, requireWorkspace } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: Record<string, unknown> = { organizationId: context.organizationId };
    if (status && status !== 'all') where.status = status;
    if (search) {
      where.OR = [{ name: { contains: search } }, { email: { contains: search } }, { company: { contains: search } }];
    }

    const [leads, total] = await Promise.all([
      db.lead.findMany({
        where,
        include: {
          signals: { orderBy: { relevance: 'desc' }, take: 5 },
          messages: { take: 3, orderBy: { createdAt: 'desc' } },
          activities: { take: 5, orderBy: { createdAt: 'desc' } },
          _count: { select: { signals: true, messages: true, activities: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.lead.count({ where }),
    ]);

    return ok({ leads, total, page, limit }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function DELETE(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('member');
    const { searchParams } = new URL(request.url);
    const leadId = searchParams.get('id');
    if (!leadId) return fail('id required', 400, 'validation_error', traceId);
    const result = await db.lead.deleteMany({ where: { id: leadId, organizationId: context.organizationId } });
    if (result.count === 0) return fail('Lead not found', 404, 'not_found', traceId);
    return ok({ deleted: true }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
