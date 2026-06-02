import { auth, clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { isClerkConfigured, isDevAuthBypassEnabled } from '@/lib/auth/env';

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface UserContext {
  userId: string;
  email?: string;
  organizationId: string;
  clerkOrgId?: string;
  role: WorkspaceRole;
  isDevBypass: boolean;
}

export class ApiAuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = 'ApiAuthError';
    this.status = status;
  }
}

const ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export function mapClerkRole(role?: string | null): WorkspaceRole {
  if (!role) return 'member';
  if (role.includes('owner')) return 'owner';
  if (role.includes('admin')) return 'admin';
  if (role.includes('viewer')) return 'viewer';
  return 'member';
}

export function hasRole(current: WorkspaceRole, required: WorkspaceRole): boolean {
  return ROLE_RANK[current] >= ROLE_RANK[required];
}

export async function getCurrentUserContext(): Promise<UserContext | null> {
  if (isDevAuthBypassEnabled()) {
    const organization = await upsertWorkspace({
      workspaceKey: 'dev_workspace',
      name: 'Local Development Workspace',
      ownerUserId: 'dev_user',
      role: 'owner',
    });

    return {
      userId: 'dev_user',
      email: 'dev@example.local',
      organizationId: organization.id,
      role: 'owner',
      isDevBypass: true,
    };
  }

  const session = await auth();
  if (!session.userId) return null;

  const role = mapClerkRole(session.orgRole);
  const client = await clerkClient();
  const user = await client.users.getUser(session.userId).catch(() => null);
  const email = user?.primaryEmailAddress?.emailAddress;
  const workspaceKey = session.orgId || `personal_${session.userId}`;

  const organizationName = session.orgId
    ? session.orgSlug || session.orgId
    : email
      ? `${email.split('@')[0]}'s Workspace`
      : 'Personal Workspace';

  const organization = await upsertWorkspace({
    workspaceKey,
    clerkOrgId: session.orgId || undefined,
    name: organizationName,
    ownerUserId: session.userId,
    role: session.orgId ? role : 'owner',
  });

  return {
    userId: session.userId,
    email,
    organizationId: organization.id,
    clerkOrgId: session.orgId || undefined,
    role: session.orgId ? role : 'owner',
    isDevBypass: false,
  };
}

export async function requireAuth(): Promise<UserContext> {
  const context = await getCurrentUserContext();
  if (!context) throw new ApiAuthError('Authentication required', 401);
  return context;
}

export async function requireWorkspace(): Promise<UserContext> {
  const context = await requireAuth();
  if (!context.organizationId) throw new ApiAuthError('Workspace required', 403);
  return context;
}

export async function requireRole(required: WorkspaceRole): Promise<UserContext> {
  const context = await requireWorkspace();
  if (!hasRole(context.role, required)) throw new ApiAuthError('Forbidden', 403);
  return context;
}

async function upsertWorkspace(params: {
  workspaceKey: string;
  clerkOrgId?: string;
  name: string;
  ownerUserId: string;
  role: WorkspaceRole;
}) {
  const organization = await db.organization.upsert({
    where: { workspaceKey: params.workspaceKey },
    create: {
      workspaceKey: params.workspaceKey,
      clerkOrgId: params.clerkOrgId,
      name: params.name,
      ownerUserId: params.ownerUserId,
    },
    update: {
      clerkOrgId: params.clerkOrgId,
      name: params.name,
      ownerUserId: params.ownerUserId,
    },
  });

  await db.workspaceMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: params.ownerUserId,
      },
    },
    create: {
      organizationId: organization.id,
      userId: params.ownerUserId,
      role: params.role,
    },
    update: {
      role: params.role,
    },
  });

  return organization;
}
