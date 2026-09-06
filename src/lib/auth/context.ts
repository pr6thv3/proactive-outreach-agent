import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { auth } from '@/auth';
import { db } from '@/lib/db';

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' | 'owner' | 'admin' | 'member' | 'viewer';

export interface UserContext {
  userId: string;
  organizationId: string;
  role: WorkspaceRole;
  isApiKey?: boolean;
  scopes?: string[];
  onboardingComplete?: boolean;
}

export class ApiAuthError extends Error {
  constructor(message: string, public statusCode: number = 401, public code: string = 'unauthorized') {
    super(message);
    this.name = 'ApiAuthError';
  }
}

const ROLE_RANK: Record<string, number> = {
  VIEWER: 1, viewer: 1,
  MEMBER: 2, member: 2,
  ADMIN: 3, admin: 3,
  OWNER: 4, owner: 4,
};

export function hasRole(currentRole: WorkspaceRole, requiredRole: WorkspaceRole): boolean {
  const currentRank = ROLE_RANK[currentRole] || 0;
  const requiredRank = ROLE_RANK[requiredRole] || 0;
  return currentRank >= requiredRank;
}

/**
 * Authenticate request via NextAuth Session or X-API-Key header.
 */
export async function requireWorkspace(req?: NextRequest): Promise<UserContext> {
  // 1. Check X-API-Key header if request object is passed with x-api-key
  if (req) {
    const hasApiKeyHeader = req.headers.has('x-api-key') || req.headers.has('X-API-Key');
    if (hasApiKeyHeader) {
      const apiKeyHeader = (req.headers.get('x-api-key') || req.headers.get('X-API-Key') || '').trim();
      if (!apiKeyHeader) {
        throw new ApiAuthError('Invalid API Key', 401, 'invalid_api_key');
      }
      const keyHash = crypto.createHash('sha256').update(apiKeyHeader).digest('hex');
      const apiKeyRecord = await db.apiKey.findUnique({
        where: { keyHash },
        include: { organization: true },
      });

      if (apiKeyRecord) {
        if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
          throw new ApiAuthError('API Key expired', 401, 'api_key_expired');
        }

        // Update last used timestamp
        await db.apiKey.update({
          where: { id: apiKeyRecord.id },
          data: { lastUsedAt: new Date() },
        }).catch(() => {});

        let scopes: string[] = [];
        try {
          scopes = typeof apiKeyRecord.scopes === 'string' ? JSON.parse(apiKeyRecord.scopes) : apiKeyRecord.scopes;
        } catch {
          scopes = ['read', 'write'];
        }

        return {
          userId: `api_key:${apiKeyRecord.id}`,
          organizationId: apiKeyRecord.organizationId,
          role: 'ADMIN',
          isApiKey: true,
          scopes,
          onboardingComplete: true,
        };
      } else {
        throw new ApiAuthError('Invalid API Key', 401, 'invalid_api_key');
      }
    }
  }

  // 2. Dev Bypass mode (local/testing without explicit API key header)
  if (process.env.AUTH_DEV_BYPASS === 'true') {
    const orgIdHeader = req?.headers.get('x-organization-id') || req?.headers.get('X-Organization-Id');
    if (orgIdHeader) {
      return {
        userId: 'dev_user_123',
        organizationId: orgIdHeader,
        role: 'OWNER',
        isApiKey: false,
        onboardingComplete: true,
      };
    }
    const defaultOrg = await db.organization.findFirst({ orderBy: { createdAt: 'desc' } });
    const defaultUser = await db.user.findFirst({ orderBy: { createdAt: 'asc' } });
    const orgId = defaultOrg?.id || 'dev_org_123';
    return {
      userId: defaultUser?.id || 'dev_user_123',
      organizationId: orgId,
      role: 'OWNER',
      isApiKey: false,
      onboardingComplete: true,
    };
  }

  // 3. Check NextAuth Session
  const session = await auth();
  if (session?.user?.id) {
    const activeOrgId = (session.user as any).activeOrgId;
    const role = ((session.user as any).role || 'MEMBER') as WorkspaceRole;
    const onboardingComplete = (session.user as any).onboardingComplete ?? true;

    if (!activeOrgId) {
      // Find user's first org membership
      const membership = await db.organizationMember.findFirst({
        where: { userId: session.user.id },
      });

      if (!membership) {
        throw new ApiAuthError('User does not belong to any organization', 403, 'no_organization');
      }

      return {
        userId: session.user.id,
        organizationId: membership.organizationId,
        role: membership.role as WorkspaceRole,
        isApiKey: false,
        onboardingComplete,
      };
    }

    return {
      userId: session.user.id,
      organizationId: activeOrgId,
      role,
      isApiKey: false,
      onboardingComplete,
    };
  }

  // 3. Dev Bypass mode (local testing)
  if (process.env.AUTH_DEV_BYPASS === 'true') {
    const defaultOrg = await db.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    const defaultUser = await db.user.findFirst({ orderBy: { createdAt: 'asc' } });

    if (defaultOrg && defaultUser) {
      return {
        userId: defaultUser.id,
        organizationId: defaultOrg.id,
        role: 'OWNER',
        isApiKey: false,
        onboardingComplete: true,
      };
    }
  }

  throw new ApiAuthError('Authentication required', 401, 'unauthenticated');
}

/**
 * Require specific workspace role (e.g., ADMIN, OWNER)
 */
export async function requireRole(requiredRole: WorkspaceRole, req?: NextRequest): Promise<UserContext> {
  const context = await requireWorkspace(req);
  if (!hasRole(context.role, requiredRole)) {
    throw new ApiAuthError(`Forbidden: requires ${requiredRole} role`, 403, 'forbidden');
  }
  return context;
}

export interface PlatformAdminContext extends UserContext {
  isSuperAdmin: boolean;
}

/**
 * Require platform-wide superadmin privileges or valid platform admin secret.
 * Standard workspace owners/admins are rejected with 403 Forbidden.
 */
export async function requirePlatformAdmin(req?: NextRequest): Promise<PlatformAdminContext> {
  // 1. Check Platform Admin Secret / CRON Secret header or Bearer token
  let candidateSecret = '';
  if (req) {
    const secretHeader = (req.headers.get('x-platform-admin-secret') || req.headers.get('x-admin-secret') || '').trim();
    const authHeader = (req.headers.get('authorization') || '').trim();
    const bearerSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    candidateSecret = secretHeader || bearerSecret;

    if (candidateSecret) {
      const validSecrets = [
        process.env.PLATFORM_ADMIN_SECRET,
        process.env.ADMIN_SECRET,
        process.env.CRON_SECRET,
      ].filter((s): s is string => typeof s === 'string' && s.length > 0);

      for (const expected of validSecrets) {
        const candidateBuf = Buffer.from(candidateSecret);
        const expectedBuf = Buffer.from(expected);
        if (candidateBuf.length === expectedBuf.length && crypto.timingSafeEqual(candidateBuf, expectedBuf)) {
          return {
            userId: 'platform_admin',
            organizationId: 'platform',
            role: 'OWNER',
            isApiKey: false,
            isSuperAdmin: true,
            onboardingComplete: true,
          };
        }
      }
    }
  }

  // 2. Check NextAuth Session
  let session: any = null;
  try {
    session = await auth();
  } catch {
    // NextAuth session lookup gracefully handled
  }

  if (session?.user?.id) {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, isSuperAdmin: true },
    });

    if (user?.isSuperAdmin === true || session.user.isSuperAdmin === true) {
      return {
        userId: user?.id || session.user.id,
        organizationId: session.user.activeOrgId || 'platform',
        role: 'OWNER',
        isApiKey: false,
        isSuperAdmin: true,
        onboardingComplete: true,
      };
    }

    // Standard tenant owner or admin attempting to access platform admin
    throw new ApiAuthError('Platform SuperAdmin authorization required', 403, 'forbidden_platform_admin');
  }

  // 3. Dev Bypass mode (when explicit and no invalid candidate was sent)
  if (process.env.AUTH_DEV_BYPASS === 'true') {
    if (candidateSecret) {
      throw new ApiAuthError('Invalid platform admin secret', 401, 'invalid_secret');
    }
    return {
      userId: 'dev_superadmin',
      organizationId: 'platform',
      role: 'OWNER',
      isApiKey: false,
      isSuperAdmin: true,
      onboardingComplete: true,
    };
  }

  if (candidateSecret) {
    throw new ApiAuthError('Invalid platform admin secret', 401, 'invalid_secret');
  }

  throw new ApiAuthError('Authentication required', 401, 'unauthenticated');
}

