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

  // Process leads in chunked batches of 100 to prevent HTTP timeouts & connection pool starvation on large CSVs
  const BATCH_SIZE = 100;
  for (let i = 0; i < parsed.leads.length; i += BATCH_SIZE) {
    const chunk = parsed.leads.slice(i, i + BATCH_SIZE);
    const chunkEmails = chunk.map(l => l.email.trim().toLowerCase());

    // 1. Bulk DNC lookup for chunk
    const dncEntries = await db.doNotContact.findMany({
      where: { organizationId: context.organizationId, email: { in: chunkEmails } },
      select: { email: true },
    });
    const dncSet = new Set(dncEntries.map(d => d.email.toLowerCase()));

    // 2. Bulk existing lead lookup for chunk
    const existingLeads = await db.lead.findMany({
      where: { organizationId: context.organizationId, email: { in: chunkEmails } },
      select: { id: true, email: true, company: true, title: true, url: true, linkedinUrl: true },
    });
    const existingMap = new Map(existingLeads.map(l => [l.email.toLowerCase(), l]));

    for (const leadData of chunk) {
      const email = leadData.email.trim().toLowerCase();
      if (dncSet.has(email)) {
        dncBlocked++;
        skipped++;
        continue;
      }

      const existing = existingMap.get(email) as any;
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
  }

  return { created, updated, skipped, dncBlocked, errors: parsed.errors };
}
