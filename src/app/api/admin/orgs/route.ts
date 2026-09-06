import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePlatformAdmin } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';

export async function GET(request?: NextRequest) {
  const traceId = createTraceId();
  try {
    await requirePlatformAdmin(request);
    const orgs = await db.organization.findMany({
      include: {
        _count: {
          select: { members: true, leads: true, campaigns: true, outreachEmails: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return ok(orgs, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
