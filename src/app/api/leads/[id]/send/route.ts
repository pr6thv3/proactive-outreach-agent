import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';
import { DeliverabilityService } from '@/lib/deliverability';
import { EnrichmentStatus, OutreachEmailStatus, EmailGeneratedBy } from '@prisma/client';

const SendEmailSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  campaignId: z.string().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('MEMBER', request);
    const { id: leadId } = await params;
    const body = await request.json();
    const { subject, body: emailBody, campaignId } = SendEmailSchema.parse(body);

    const lead = await db.lead.findFirst({
      where: { id: leadId, organizationId: context.organizationId },
      include: { enrichmentQueues: { orderBy: { updatedAt: 'desc' } } },
    });

    if (!lead) return fail('Lead not found', 404, 'not_found', traceId);

    // ═══ MANDATORY ENRICHMENT GATE CHECK ═══
    const latestQueue = lead.enrichmentQueues[0];
    const isEnrichmentSafe = lead.emailVerified || (latestQueue && [
      EnrichmentStatus.MX_VERIFIED,
      EnrichmentStatus.ENRICHED,
      EnrichmentStatus.SKIPPED,
    ].includes(latestQueue.status));

    if (!isEnrichmentSafe) {
      return fail(
        `Email address (${lead.email}) is not verified. Current status: ${latestQueue?.status || 'UNVERIFIED'}. Run MX verification before sending.`,
        422,
        'unverified_email_gate',
        traceId
      );
    }

    // Create OutreachEmail record
    const emailRecord = await db.outreachEmail.create({
      data: {
        organizationId: context.organizationId,
        leadId,
        campaignId,
        subject,
        body: emailBody,
        status: OutreachEmailStatus.QUEUED,
        generatedBy: EmailGeneratedBy.HUMAN,
      },
    });

    // Send via Resend
    const sendResult = await DeliverabilityService.sendEmail({
      to: lead.email,
      from: 'outreach@acmesaas.com',
      fromName: 'Alex from Acme',
      subject,
      body: emailBody,
      messageId: emailRecord.id,
      leadId,
      campaignId,
      organizationId: context.organizationId,
      dryRun: false,
    });

    if (sendResult.success) {
      const updated = await db.outreachEmail.update({
        where: { id: emailRecord.id },
        data: {
          status: OutreachEmailStatus.SENT,
          sentAt: new Date(),
          resendMessageId: sendResult.providerId || `msg_${Date.now()}`,
        },
      });

      return ok(updated, traceId);
    } else {
      await db.outreachEmail.update({
        where: { id: emailRecord.id },
        data: { status: OutreachEmailStatus.FAILED },
      });
      return fail(`Failed to dispatch email: ${sendResult.error}`, 500, 'dispatch_failed', traceId);
    }
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
