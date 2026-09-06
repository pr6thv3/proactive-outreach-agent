import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole, requireWorkspace } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';

const IcpSchema = z.object({
  industries: z.union([z.array(z.string()), z.string()]).transform((val) => {
    if (Array.isArray(val)) return val;
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [val];
    } catch {
      return val.split(',').map(s => s.trim()).filter(Boolean);
    }
  }).default([]),
  companySizeMin: z.number().nullable().optional().default(10),
  companySizeMax: z.number().nullable().optional().default(500),
  revenueMin: z.number().nullable().optional(),
  revenueMax: z.number().nullable().optional(),
  techStack: z.union([z.array(z.string()), z.string()]).transform((val) => {
    if (Array.isArray(val)) return val;
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [val];
    } catch {
      return val.split(',').map(s => s.trim()).filter(Boolean);
    }
  }).default([]),
  excludeTechStack: z.union([z.array(z.string()), z.string()]).transform((val) => {
    if (Array.isArray(val)) return val;
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [val];
    } catch {
      return val.split(',').map(s => s.trim()).filter(Boolean);
    }
  }).default([]),
  requiredSignals: z.union([z.array(z.string()), z.string()]).transform((val) => {
    if (Array.isArray(val)) return val;
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [val];
    } catch {
      return val.split(',').map(s => s.trim()).filter(Boolean);
    }
  }).default([]),
  minSignalScore: z.number().default(50.0),
  valueProp: z.string().nullable().optional(),
  painPoints: z.union([z.array(z.string()), z.string()]).transform((val) => {
    if (Array.isArray(val)) return val;
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [val];
    } catch {
      return val.split(',').map(s => s.trim()).filter(Boolean);
    }
  }).default([]),
});

function safeJsonArray(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
      return [val];
    } catch {
      return val.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return [];
}

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    let icp = await db.icpCriteria.findUnique({
      where: { organizationId: context.organizationId },
    });

    if (!icp) {
      icp = await db.icpCriteria.create({
        data: {
          organizationId: context.organizationId,
          industries: JSON.stringify(['B2B SaaS']),
          techStack: JSON.stringify([]),
          excludeTechStack: JSON.stringify([]),
          requiredSignals: JSON.stringify(['hiring_spike', 'funding_round']),
          painPoints: JSON.stringify([]),
          companySizeMin: 10,
          companySizeMax: 500,
          minSignalScore: 50.0,
        } as any,
      });
    }

    const formatted = {
      ...icp,
      industries: safeJsonArray(icp.industries),
      techStack: safeJsonArray(icp.techStack),
      excludeTechStack: safeJsonArray(icp.excludeTechStack),
      requiredSignals: safeJsonArray(icp.requiredSignals),
      painPoints: safeJsonArray(icp.painPoints),
    };

    return ok(formatted, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('MEMBER', request);
    const body = await request.json();
    const validated = IcpSchema.parse(body);

    const dataPayload: any = {
      industries: JSON.stringify(validated.industries),
      companySizeMin: validated.companySizeMin,
      companySizeMax: validated.companySizeMax,
      revenueMin: validated.revenueMin,
      revenueMax: validated.revenueMax,
      techStack: JSON.stringify(validated.techStack),
      excludeTechStack: JSON.stringify(validated.excludeTechStack),
      requiredSignals: JSON.stringify(validated.requiredSignals),
      minSignalScore: validated.minSignalScore,
      valueProp: validated.valueProp,
      painPoints: JSON.stringify(validated.painPoints),
    };

    const icp = await db.icpCriteria.upsert({
      where: { organizationId: context.organizationId },
      update: dataPayload,
      create: {
        organizationId: context.organizationId,
        ...dataPayload,
      },
    });

    const formatted = {
      ...icp,
      industries: safeJsonArray(icp.industries),
      techStack: safeJsonArray(icp.techStack),
      excludeTechStack: safeJsonArray(icp.excludeTechStack),
      requiredSignals: safeJsonArray(icp.requiredSignals),
      painPoints: safeJsonArray(icp.painPoints),
    };

    return ok(formatted, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
