import { NextRequest } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';
import { checkRateLimit } from '@/lib/redis';
import { OrganizationRole } from '@prisma/client';

const SignUpSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  orgName: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'ip_unknown';
    const rateLimit = await checkRateLimit(`signup:${clientIp}`, 10, 600);
    if (!rateLimit.allowed) {
      return fail('Too many registration attempts. Please try again in a few minutes.', 429, 'rate_limit_exceeded', traceId);
    }

    const body = await request.json();
    const { name, email, password, orgName } = SignUpSchema.parse(body);

    const existingUser = await db.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return fail('User with this email already exists', 400, 'user_exists', traceId);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Generate unique slug
    const baseSlug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'org';
    let slug = baseSlug;
    const existingOrgWithSlug = await db.organization.findUnique({
      where: { slug },
    });
    if (existingOrgWithSlug) {
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`;
    }

    // Create Org & User
    const org = await db.organization.create({
      data: {
        name: orgName,
        slug,
      },
    });

    const user = await db.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        passwordHash,
      },
    });

    // Create Membership
    await db.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        role: OrganizationRole.OWNER,
      },
    });

    // Initialize Preferences & ICP
    await db.userPreference.create({
      data: {
        userId: user.id,
        activeOrgId: org.id,
        onboardingStep: 1,
        onboardingComplete: false,
      },
    });

    await db.icpCriteria.create({
      data: {
        organizationId: org.id,
        industries: JSON.stringify(['B2B SaaS']),
      } as any,
    });

    return ok({ userId: user.id, organizationId: org.id }, traceId, 201);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
