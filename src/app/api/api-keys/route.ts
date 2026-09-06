import { NextRequest } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';

const CreateKeySchema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.string()).default(['read', 'write']),
});

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('ADMIN', request);
    const keys = await db.apiKey.findMany({
      where: { organizationId: context.organizationId },
      select: { id: true, name: true, scopes: true, lastUsedAt: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    return ok(keys, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('ADMIN', request);
    const body = await request.json();
    const { name, scopes } = CreateKeySchema.parse(body);

    const rawKey = 'pr_live_' + crypto.randomBytes(24).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await db.apiKey.create({
      data: {
        organizationId: context.organizationId,
        name,
        keyHash,
        scopes: JSON.stringify(scopes) as any,
      },
    });

    // Return rawKey EXACTLY ONCE to the caller
    return ok({
      id: apiKey.id,
      name: apiKey.name,
      rawKey,
      scopes,
      createdAt: apiKey.createdAt,
    }, traceId, 201);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
