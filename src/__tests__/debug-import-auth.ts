import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { db } from '../lib/db';
import { requireRole, requireWorkspace } from '../lib/auth/context';
import { POST as handleLeadImport } from '../app/api/leads/import/route';

async function test() {
  const org = await db.organization.create({
    data: {
      workspaceKey: `debug_org_${Date.now()}`,
      name: 'Debug Org',
    },
  });

  const rawKey = `key_${Date.now()}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const record = await db.apiKey.create({
    data: {
      organizationId: org.id,
      name: 'Debug Key',
      keyHash,
      scopes: JSON.stringify(['read', 'write']),
    },
  });
  console.log('Created ApiKey record:', record);

  const req = new NextRequest('http://localhost:3000/api/leads/import', {
    method: 'POST',
    headers: {
      'x-api-key': rawKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      csvText: 'email,name\ntest@example.com,Test Lead',
    }),
  });

  try {
    const ws = await requireWorkspace(req);
    console.log('requireWorkspace returned:', ws);
    const role = await requireRole('MEMBER', req);
    console.log('requireRole returned:', role);
  } catch (e) {
    console.error('requireWorkspace/requireRole threw:', e);
  }

  const res = await handleLeadImport(req);
  console.log('handleLeadImport status:', res.status);
  const json = await res.json();
  console.log('handleLeadImport json:', json);
}

test().catch(console.error);
