import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole, requireWorkspace } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';

const CreateSignalSchema = z.object({
  leadId: z.string().min(1),
  type: z.string().min(1),
  content: z.string().min(1),
  source: z.string().default('agent'),
  score: z.number().default(50.0),
  relevance: z.number().default(0.5),
  confidence: z.number().default(0.5),
  urgency: z.number().optional(),
  reasoning: z.string().optional(),
  recommendedPitchAngle: z.string().optional(),
  recommendedOffer: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const leadId = searchParams.get('leadId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: Record<string, unknown> = { organizationId: context.organizationId };
    if (type) where.type = type;
    if (leadId) where.leadId = leadId;

    const [signals, total] = await Promise.all([
      db.signal.findMany({
        where,
        include: { lead: { select: { id: true, name: true, company: true, email: true } } },
        orderBy: { observedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.signal.count({ where }),
    ]);

    return ok({ signals, total, page, limit }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('MEMBER', request);
    const body = await request.json();
    const validated = CreateSignalSchema.parse(body);

    const lead = await db.lead.findFirst({
      where: { id: validated.leadId, organizationId: context.organizationId },
    });
    if (!lead) return fail('Lead not found', 404, 'not_found', traceId);

    const signal = await db.signal.create({
      data: {
        organizationId: context.organizationId,
        ...validated,
      },
    });

    return ok(signal, traceId, 201);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
