import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { inngest } from '@/lib/inngest/client';
import { db } from '@/lib/db';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';
import { requireWorkspace } from '@/lib/auth/context';

export async function handlePipelineRun(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret && process.env.NODE_ENV === 'production') {
      return fail('CRON_SECRET is not configured', 500, 'cron_secret_missing', traceId);
    }

    const authHeader = (request.headers.get('authorization') || '').trim();
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const querySecret = request.nextUrl.searchParams.get('secret') || '';
    const candidate = bearerToken || querySecret;

    let isAuthorized = false;
    if (cronSecret && candidate) {
      const candidateBuf = Buffer.from(candidate);
      const secretBuf = Buffer.from(cronSecret);
      if (candidateBuf.length === secretBuf.length && crypto.timingSafeEqual(candidateBuf, secretBuf)) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized && !candidate) {
      try {
        await requireWorkspace(request);
        isAuthorized = true;
      } catch {
        // Not session authenticated
      }
    }

    if (!isAuthorized) {
      if (process.env.AUTH_DEV_BYPASS === 'true' && !candidate) {
        // Dev bypass allowed only when no invalid credentials provided
      } else {
        return fail('Unauthorized cron execution', 401, 'unauthorized_cron', traceId);
      }
    }

    const orgs = await db.organization.findMany({ select: { id: true } });
    const eventIds: string[] = [];

    for (const org of orgs) {
      try {
        const sendRes = await inngest.send([
          { name: 'pipeline/observe', data: { orgId: org.id } },
          { name: 'pipeline/think', data: { orgId: org.id } },
          { name: 'pipeline/act', data: { orgId: org.id } },
          { name: 'pipeline/reevaluate', data: { orgId: org.id } },
        ]);
        if (sendRes?.ids) eventIds.push(...sendRes.ids);
      } catch (err) {
        if (process.env.NODE_ENV === 'production') throw err;
        eventIds.push(`evt_mock_${org.id}_1`, `evt_mock_${org.id}_2`, `evt_mock_${org.id}_3`, `evt_mock_${org.id}_4`);
      }
    }

    return ok({ triggeredOrgs: orgs.length, eventIds }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function POST(request: NextRequest) {
  return handlePipelineRun(request);
}

export async function GET(request: NextRequest) {
  return handlePipelineRun(request);
}

