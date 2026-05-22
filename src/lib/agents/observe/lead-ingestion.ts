// ─── OBSERVE: Lead Ingestion Agent ────────────────────
// Production lead ingestion with CSV, validation, dedup, DNC checks

import { BaseAgent } from '../base';
import { AgentContext, LeadData, ObserveOutput, SignalData, LeadIngestionResult } from '../types';
import { db } from '@/lib/db';
import { validateEmail, isOnDncList } from '@/lib/safety';

interface LeadIngestionInput {
  leads?: Array<{
    name: string;
    email: string;
    company?: string;
    title?: string;
    url?: string;
    linkedinUrl?: string;
  }>;
  source?: string;
}

export class LeadIngestionAgent extends BaseAgent<LeadIngestionInput, LeadIngestionResult> {
  readonly name = 'LeadIngestion';
  readonly phase = 'observe' as const;
  readonly description = 'Ingests leads with CSV support, validation, dedup, and DNC checks';

  async execute(input: LeadIngestionInput, _context: AgentContext): Promise<LeadIngestionResult> {
    const result: LeadIngestionResult = { created: 0, updated: 0, skipped: 0, dncBlocked: 0, leads: [], errors: [] };
    const source = input.source || 'manual';

    if (!input.leads?.length) {
      return result;
    }

    for (const leadData of input.leads) {
      const email = leadData.email.trim().toLowerCase();

      // 1. Validate email
      const emailCheck = validateEmail(email);
      if (!emailCheck.valid) {
        result.errors.push({ email, reason: emailCheck.reason || 'Invalid email' });
        result.skipped++;
        continue;
      }

      // 2. Check DNC list
      const onDnc = await isOnDncList(email);
      if (onDnc) {
        result.dncBlocked++;
        result.errors.push({ email, reason: 'On Do-Not-Contact list' });
        continue;
      }

      // 3. Check for existing lead (dedup)
      const existing = await db.lead.findUnique({ where: { email } });

      if (existing) {
        // Update with any new information
        const updateData: Record<string, unknown> = {};
        if (leadData.company && !existing.company) updateData.company = leadData.company;
        if (leadData.title && !existing.title) updateData.title = leadData.title;
        if (leadData.url && !existing.url) updateData.url = leadData.url;
        if (leadData.linkedinUrl && !existing.linkedinUrl) updateData.linkedinUrl = leadData.linkedinUrl;

        if (Object.keys(updateData).length > 0) {
          await db.lead.update({ where: { id: existing.id }, data: updateData });
          result.updated++;
        } else {
          result.skipped++;
        }

        result.leads.push(mapLead(existing));
        continue;
      }

      // 4. Create new lead
      try {
        const newLead = await db.lead.create({
          data: {
            name: leadData.name.trim(),
            email,
            company: leadData.company?.trim() || null,
            title: leadData.title?.trim() || null,
            url: leadData.url?.trim() || null,
            linkedinUrl: leadData.linkedinUrl?.trim() || null,
            source,
            status: 'new',
            emailVerified: false,
            isBlacklisted: false,
            doNotContact: false,
          },
        });

        // Create initial signal
        if (leadData.company) {
          await db.signal.create({
            data: {
              type: 'trigger',
              content: `New lead from ${leadData.company}${leadData.title ? ` — ${leadData.title}` : ''}`,
              source: 'lead_ingestion',
              relevance: 0.6,
              confidence: 0.8,
              leadId: newLead.id,
            },
          });
        }

        // Create activity
        await db.activity.create({
          data: {
            type: 'lead_created',
            description: `Lead created from ${source}: ${newLead.name} at ${newLead.company || 'N/A'}`,
            phase: 'system',
            leadId: newLead.id,
            metadata: JSON.stringify({ source, email }),
          },
        });

        result.created++;
        result.leads.push(mapLead(newLead));
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push({ email, reason: msg });
        result.skipped++;
      }
    }

    return result;
  }
}

function mapLead(l: { id: string; name: string; email: string; company: string | null; title: string | null; url: string | null; linkedinUrl: string | null; status: string; source: string; emailVerified: boolean; isBlacklisted: boolean; doNotContact: boolean; lastContacted: Date | null; notes: string | null }): LeadData {
  return {
    id: l.id, name: l.name, email: l.email,
    company: l.company || undefined, title: l.title || undefined,
    url: l.url || undefined, linkedinUrl: l.linkedinUrl || undefined,
    status: l.status as LeadData['status'], source: l.source,
    emailVerified: l.emailVerified, isBlacklisted: l.isBlacklisted,
    doNotContact: l.doNotContact, lastContacted: l.lastContacted || undefined,
    notes: l.notes || undefined,
  };
}
