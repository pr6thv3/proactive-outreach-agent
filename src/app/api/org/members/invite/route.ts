import { NextRequest } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';

const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER'),
});

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('ADMIN', request);
    const body = await request.json();
    const { email, role } = InviteSchema.parse(body);

    // Find or create user
    let user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      const defaultPassword = await bcrypt.hash('temporary123!', 10);
      user = await db.user.create({
        data: {
          email: email.toLowerCase(),
          name: email.split('@')[0],
          passwordHash: defaultPassword,
        },
      });
    }

    // Check if membership exists
    const existing = await db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: context.organizationId, userId: user.id } },
    });

    if (existing) {
      return fail('User is already a member of this organization', 400, 'already_member', traceId);
    }

    const membership = await db.organizationMember.create({
      data: {
        organizationId: context.organizationId,
        userId: user.id,
        role: role as any,
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    return ok(membership, traceId, 201);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
