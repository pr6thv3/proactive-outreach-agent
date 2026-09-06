import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';
import { parseCsv, validateEmail } from '@/lib/safety';
import { checkRateLimit } from '@/lib/redis';
import { EnrichmentStatus } from '@prisma/client';

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireRole('MEMBER', request);

    // Rate limit lead imports per organization
    const rateLimit = await checkRateLimit(`import:${context.organizationId}`, 20, 60);
    if (!rateLimit.allowed) {
      return fail('Lead import rate limit exceeded. Please wait before uploading another file.', 429, 'rate_limit_exceeded', traceId);
    }

    const contentType = request.headers.get('content-type') || '';
    let csvText = '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      if (!file) return fail('No file uploaded', 400, 'validation_error', traceId);
      csvText = await file.text();
    } else {
      const body = await request.json().catch(() => ({}));
      csvText = body.csvText || '';
    }

    if (!csvText) return fail('CSV content required', 400, 'validation_error', traceId);

    const parsed = parseCsv(csvText);
    let created = 0;
    let updated = 0;
    let skipped = parsed.errors.length;

    for (const leadData of parsed.leads) {
      const email = leadData.email.trim().toLowerCase();
      const val = validateEmail(email);
      if (!val.valid) {
        skipped++;
        continue;
      }

      const existing = await db.lead.findFirst({
        where: { organizationId: context.organizationId, email },
      });

      const parts = leadData.name.trim().split(' ');
      const firstName = parts[0] || 'Prospect';
      const lastName = parts.slice(1).join(' ') || undefined;

      if (existing) {
        await db.lead.update({
          where: { id: existing.id },
          data: {
            company: existing.company || leadData.company,
            title: existing.title || leadData.title,
            linkedinUrl: existing.linkedinUrl || leadData.linkedinUrl,
            website: existing.website || leadData.url,
          },
        });
        updated++;
      } else {
        const newLead = await db.lead.create({
          data: {
            organizationId: context.organizationId,
            firstName,
            lastName,
            name: leadData.name.trim(),
            email,
            company: leadData.company,
            title: leadData.title,
            linkedinUrl: leadData.linkedinUrl,
            website: leadData.url,
            source: 'csv_import',
          },
        });

        // Create pending enrichment queue record
        await db.enrichmentQueue.create({
          data: {
            organizationId: context.organizationId,
            leadId: newLead.id,
            email: newLead.email,
            status: EnrichmentStatus.PENDING,
          },
        });

        created++;
      }
    }

    return ok({ created, updated, skipped, errors: parsed.errors }, traceId, 201);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
