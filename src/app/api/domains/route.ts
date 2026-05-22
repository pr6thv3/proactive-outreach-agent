// ─── API: Domains — Sending Domain Management ─────────
// CRUD for email sending domains with DNS verification and warmup

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { DeliverabilityService } from '@/lib/deliverability';
import { checkDomainDnsStatus } from '@/lib/deliverability/dns-checker';
import { getWarmupStatus, resetWarmup } from '@/lib/deliverability/warmup-manager';

export async function GET() {
  try {
    const domains = await db.sendingDomain.findMany({ orderBy: { reputationScore: 'desc' } });

    // Enrich with DNS status and warmup info
    const enriched = await Promise.all(domains.map(async (d) => {
      let dnsStatus: Awaited<ReturnType<typeof checkDomainDnsStatus>> | undefined;
      let warmupStatus: Awaited<ReturnType<typeof getWarmupStatus>> | undefined;

      try {
        dnsStatus = await checkDomainDnsStatus(d.id);
      } catch { /* Domain may not exist in Resend yet */ }

      try {
        warmupStatus = await getWarmupStatus(d.id);
      } catch { /* Warmup data may not be ready */ }

      return {
        ...d,
        dns: dnsStatus || null,
        warmup: warmupStatus || null,
      };
    }));

    return NextResponse.json({ success: true, data: enriched });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { domain, fromEmail, fromName, replyTo } = body;

    if (!domain || !fromEmail) {
      return NextResponse.json({ error: 'domain and fromEmail are required' }, { status: 400 });
    }

    const result = await DeliverabilityService.addDomain({
      domain,
      fromEmail,
      fromName,
      replyTo,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: { domainId: result.domainId, dnsRecords: result.dnsRecords } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { domainId, action } = body;

    if (!domainId || !action) {
      return NextResponse.json({ error: 'domainId and action are required' }, { status: 400 });
    }

    switch (action) {
      case 'verify': {
        const dnsStatus = await DeliverabilityService.verifyDomain(domainId);
        return NextResponse.json({ success: true, data: dnsStatus });
      }

      case 'pause_warmup': {
        await db.sendingDomain.update({ where: { id: domainId }, data: { warmupEnabled: false } });
        return NextResponse.json({ success: true, data: { warmupEnabled: false } });
      }

      case 'resume_warmup': {
        await db.sendingDomain.update({ where: { id: domainId }, data: { warmupEnabled: true } });
        return NextResponse.json({ success: true, data: { warmupEnabled: true } });
      }

      case 'reset_warmup': {
        await resetWarmup(domainId);
        return NextResponse.json({ success: true, data: { message: 'Warmup reset to day 0' } });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { domainId } = body;

    if (!domainId) {
      return NextResponse.json({ error: 'domainId is required' }, { status: 400 });
    }

    // Soft delete — suspend the domain
    await db.sendingDomain.update({
      where: { id: domainId },
      data: { status: 'suspended' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Server error' }, { status: 500 });
  }
}
