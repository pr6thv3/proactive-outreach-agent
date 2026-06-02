import { z } from 'zod';
import { db } from '@/lib/db';
import { UserContext } from '@/lib/auth/context';
import { isOnDncList, parseCsv } from '@/lib/safety';

export const ImportCsvSchema = z.object({
  action: z.literal('import_csv'),
  csvText: z.string().min(1),
  source: z.string().optional(),
});

export async function importCsvAction(input: z.infer<typeof ImportCsvSchema>, context: UserContext) {
  const parsed = parseCsv(input.csvText);
  let created = 0;
  let updated = 0;
  let skipped = parsed.errors.length;
  let dncBlocked = 0;

  for (const leadData of parsed.leads) {
    const email = leadData.email.trim().toLowerCase();
    if (await isOnDncList(email, context.organizationId)) {
      dncBlocked++;
      skipped++;
      continue;
    }

    const existing = await db.lead.findFirst({
      where: { organizationId: context.organizationId, email },
    });

    if (existing) {
      await db.lead.update({
        where: { id: existing.id },
        data: {
          company: existing.company || leadData.company,
          title: existing.title || leadData.title,
          url: existing.url || leadData.url,
          linkedinUrl: existing.linkedinUrl || leadData.linkedinUrl,
        },
      });
      updated++;
      continue;
    }

    const lead = await db.lead.create({
      data: {
        organizationId: context.organizationId,
        name: leadData.name.trim(),
        email,
        company: leadData.company,
        title: leadData.title,
        url: leadData.url,
        linkedinUrl: leadData.linkedinUrl,
        source: input.source || 'csv_import',
      },
    });

    await db.activity.create({
      data: {
        organizationId: context.organizationId,
        leadId: lead.id,
        type: 'lead_created',
        description: `Lead imported from ${input.source || 'csv_import'}`,
        phase: 'system',
      },
    });

    created++;
  }

  return { created, updated, skipped, dncBlocked, errors: parsed.errors };
}
