import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createTraceId, badRequest, handleApiError, ok } from '@/lib/api/responses';
import { addToDncList } from '@/lib/safety';
import { interruptSequence } from '@/lib/agents/act/followup-scheduler';

async function processUnsubscribe(
  emailParam?: string | null,
  leadIdParam?: string | null,
  orgIdParam?: string | null,
  domainParam?: string | null,
  traceId = createTraceId()
) {
  let email = emailParam ? emailParam.trim().toLowerCase() : null;
  let leadId = leadIdParam ? leadIdParam.trim() : null;
  let organizationId = orgIdParam ? orgIdParam.trim() : null;
  let domain = domainParam ? domainParam.trim().toLowerCase() : null;

  if (!email && !leadId && !domain) {
    return { error: badRequest('Email, leadId, or domain is required to unsubscribe', traceId) };
  }

  // If leadId is provided, resolve lead details
  if (leadId) {
    const lead = await db.lead.findUnique({ where: { id: leadId } });
    if (lead) {
      if (!email) email = lead.email.toLowerCase();
      if (!organizationId) organizationId = lead.organizationId;
    }
  }

  // If email is provided but no organizationId, resolve from existing lead
  if (email && !organizationId) {
    const lead = await db.lead.findFirst({ where: { email } });
    if (lead) organizationId = lead.organizationId;
  }

  // Extract domain from email if not provided
  if (!domain && email && email.includes('@')) {
    domain = email.split('@')[1];
  }

  // 1. Add email to DoNotContact table
  if (email) {
    await addToDncList(
      email,
      'Recipient requested unsubscribe',
      'unsubscribe_route',
      leadId || undefined,
      organizationId || undefined
    );
  }

  // 2. Add domain to DoNotContact table with organizationId
  if (domain) {
    const domainPattern = domain.startsWith('@') ? domain : `@${domain}`;
    const existingDomainDnc = await db.doNotContact.findFirst({
      where: {
        email: domainPattern,
        ...(organizationId ? { organizationId } : {}),
      },
    });

    if (!existingDomainDnc) {
      await db.doNotContact.create({
        data: {
          organizationId: organizationId || null,
          email: domainPattern,
          reason: 'Domain-wide unsubscribe via recipient request',
          source: 'unsubscribe_route',
        },
      });
    }
  }

  // 3. Mark matching lead as unsubscribed and halt active sequences
  if (leadId) {
    await db.lead.updateMany({
      where: { id: leadId },
      data: { doNotContact: true, isBlacklisted: true, status: 'unsubscribed' },
    }).catch(() => {});

    await interruptSequence({
      leadId,
      organizationId: organizationId || undefined,
      reason: 'unsubscribe',
      note: 'Recipient opted out via unsubscribe route',
    }).catch(() => {});
  } else if (email) {
    await db.lead.updateMany({
      where: { email },
      data: { doNotContact: true, isBlacklisted: true, status: 'unsubscribed' },
    }).catch(() => {});

    const matchedLeads = await db.lead.findMany({
      where: { email },
      select: { id: true, organizationId: true },
    }).catch(() => []);

    for (const matched of matchedLeads) {
      await interruptSequence({
        leadId: matched.id,
        organizationId: matched.organizationId,
        reason: 'unsubscribe',
        note: 'Recipient opted out via unsubscribe route',
      }).catch(() => {});
    }
  }

  return {
    data: {
      unsubscribed: true,
      email: email || null,
      domain: domain || null,
      organizationId: organizationId || null,
      message: 'You have been successfully unsubscribed from all future communications.',
    },
  };
}

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const { searchParams } = request.nextUrl;
    const email = searchParams.get('email');
    const leadId = searchParams.get('leadId');
    const orgId = searchParams.get('orgId') || searchParams.get('organizationId');
    const domain = searchParams.get('domain');

    const result = await processUnsubscribe(email, leadId, orgId, domain, traceId);
    if (result.error) return result.error;

    const acceptHeader = request.headers.get('accept') || '';
    const wantsHtml =
      acceptHeader.includes('text/html') &&
      !acceptHeader.includes('application/json') &&
      !acceptHeader.includes('*/*');

    if (wantsHtml) {
      const displayTarget = result.data.email || result.data.domain || 'your address';
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Unsubscribed — ProactiveReach</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background-color: #f9fafb; color: #111827; }
    .card { background: white; padding: 2.5rem; border-radius: 0.75rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); max-width: 440px; text-align: center; }
    .icon { width: 48px; height: 48px; color: #10b981; margin: 0 auto 1rem; }
    h1 { font-size: 1.25rem; font-weight: 600; margin: 0 0 0.5rem; color: #111827; }
    p { color: #6b7280; font-size: 0.875rem; line-height: 1.5; margin: 0 0 1rem; }
    .badge { display: inline-block; padding: 0.25rem 0.75rem; background-color: #f3f4f6; border-radius: 9999px; font-size: 0.875rem; font-weight: 500; color: #374151; }
  </style>
</head>
<body>
  <div class="card">
    <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
    <h1>You Have Been Unsubscribed</h1>
    <p>We have received your unsubscribe request. You will no longer receive outreach emails from this organization.</p>
    <div class="badge">${displayTarget}</div>
  </div>
</body>
</html>`;
      return new NextResponse(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    return ok(result.data, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const { searchParams } = request.nextUrl;
    let bodyData: Record<string, any> = {};

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        bodyData = await request.json();
      } catch {
        // Invalid json body gracefully handled
      }
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      try {
        const formData = await request.formData();
        bodyData = Object.fromEntries(formData.entries());
      } catch {
        // Form data parse handled
      }
    }

    const email = bodyData.email || searchParams.get('email');
    const leadId = bodyData.leadId || searchParams.get('leadId');
    const orgId = bodyData.organizationId || bodyData.orgId || searchParams.get('orgId') || searchParams.get('organizationId');
    const domain = bodyData.domain || searchParams.get('domain');

    const result = await processUnsubscribe(email, leadId, orgId, domain, traceId);
    if (result.error) return result.error;

    return ok(result.data, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
