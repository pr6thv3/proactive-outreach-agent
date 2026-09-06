import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { inngest } from '@/lib/inngest/client';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';
import { requireWorkspace } from '@/lib/auth/context';

export async function handleEnrichmentRun(request: NextRequest) {
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

    let eventId = `evt_${Date.now()}`;
    try {
      const event = await inngest.send({
        name: 'enrichment/batch',
        data: { triggeredAt: new Date().toISOString() },
      });
      if (event?.ids?.[0]) eventId = event.ids[0];
    } catch (err) {
      if (process.env.NODE_ENV === 'production') throw err;
    }

    return ok({ triggered: true, eventId }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function POST(request: NextRequest) {
  return handleEnrichmentRun(request);
}

export async function GET(request: NextRequest) {
  return handleEnrichmentRun(request);
}

