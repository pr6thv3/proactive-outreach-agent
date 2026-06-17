// ─── API: Domains — Sending Domain Management ─────────
// CRUD for email sending domains with DNS verification and warmup

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { DeliverabilityService } from '@/lib/deliverability';
import { checkDomainDnsStatus } from '@/lib/deliverability/dns-checker';
import { getWarmupStatus, resetWarmup } from '@/lib/deliverability/warmup-manager';
import { requireRole, requireWorkspace } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';

export async function GET() {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace();
    const domains = await db.sendingDomain.findMany({
      where: { organizationId: context.organizationId },
      orderBy: { reputationScore: 'desc' },
    });

    // Enrich with DNS status and warmup info
    const enriched = await Promise.all(domains.map(async (d) => {
      let dnsStatus: Awaited<ReturnType<typeof checkDomainDnsStatus>> | undefined;
      let warmupStatus: Awaited<ReturnType<typeof getWarmupStatus>> | undefined;

      try {
        dnsStatus = await checkDomainDnsStatus(d.id, context.organizationId);
      } catch { /* Domain may not exist in Resend yet */ }

      try {
        warmupStatus = await getWarmupStatus(d.id, context.organizationId);
      } catch { /* Warmup data may not be ready */ }

      return {
        ...d,
        dns: dnsStatus || null,
        warmup: warmupStatus || null,
      };
    }));

    return ok(enriched, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('admin');
    const body = await request.json();
    const { domain, fromEmail, fromName, replyTo } = body;

    if (!domain || !fromEmail) {
      return fail('domain and fromEmail are required', 400, 'validation_error', traceId);
    }

    const result = await DeliverabilityService.addDomain({
      organizationId: context.organizationId,
      domain,
      fromEmail,
      fromName,
      replyTo,
    });

    if (!result.success) {
      return fail(result.error || 'Failed to add domain', 400, 'domain_error', traceId);
    }

    return ok({ domainId: result.domainId, dnsRecords: result.dnsRecords }, traceId, 201);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function PATCH(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('admin');
    const body = await request.json();
    const { domainId, action } = body;

    if (!domainId || !action) {
      return fail('domainId and action are required', 400, 'validation_error', traceId);
    }

    const domain = await db.sendingDomain.findFirst({ where: { id: domainId, organizationId: context.organizationId } });
    if (!domain) return fail('Domain not found', 404, 'not_found', traceId);

    switch (action) {
      case 'verify': {
        const dnsStatus = await DeliverabilityService.verifyDomain(domainId, context.organizationId);
        return ok(dnsStatus, traceId);
      }

      case 'pause_warmup': {
        await db.sendingDomain.updateMany({ where: { id: domainId, organizationId: context.organizationId }, data: { warmupEnabled: false } });
        return ok({ warmupEnabled: false }, traceId);
      }

      case 'resume_warmup': {
        await db.sendingDomain.updateMany({ where: { id: domainId, organizationId: context.organizationId }, data: { warmupEnabled: true } });
        return ok({ warmupEnabled: true }, traceId);
      }

      case 'reset_warmup': {
        await resetWarmup(domainId, context.organizationId);
        return ok({ message: 'Warmup reset to day 0' }, traceId);
      }

      default:
        return fail(`Unknown action: ${action}`, 400, 'unknown_action', traceId);
    }
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function DELETE(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('admin');
    const body = await request.json();
    const { domainId } = body;

    if (!domainId) {
      return fail('domainId is required', 400, 'validation_error', traceId);
    }

    // Soft delete — suspend the domain
    const updated = await db.sendingDomain.updateMany({
      where: { id: domainId, organizationId: context.organizationId },
      data: { status: 'suspended' },
    });
    if (updated.count === 0) return fail('Domain not found', 404, 'not_found', traceId);

    return ok({ suspended: true }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
