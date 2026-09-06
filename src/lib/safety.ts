// ─── Safety & Validation Utilities ────────────────────
// Production-grade checks before any outreach action

import { db } from '@/lib/db';
import { isDisposableEmail, DISPOSABLE_EMAIL_DOMAINS } from '@/lib/deliverability/mx-verifier';

export { isDisposableEmail, DISPOSABLE_EMAIL_DOMAINS };

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com', 'yandex.com',
]);

/**
 * Validate email format and check for common issues
 */
export function validateEmail(email: string): { valid: boolean; reason?: string } {
  if (!email || typeof email !== 'string') {
    return { valid: false, reason: 'Email is required' };
  }

  const trimmed = email.trim().toLowerCase();

  if (trimmed.length > 254) {
    return { valid: false, reason: 'Email too long' };
  }

  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, reason: 'Invalid email format' };
  }

  const domain = trimmed.split('@')[1];
  if (domain && isDisposableEmail(domain)) {
    return { valid: false, reason: 'Disposable email domain is not permitted' };
  }

  // Check for obvious typos
  if (domain && FREE_EMAIL_DOMAINS.has(domain)) {
    // Free email is ok but note it — B2B outreach prefers work emails
    return { valid: true, reason: undefined };
  }

  return { valid: true };
}

/**
 * Normalize an email address and extract base email (stripping plus-address tag)
 */
export function normalizeDncEmail(email: string): { normalized: string; baseEmail: string } {
  const trimmed = (email || '').trim().toLowerCase();
  const atIndex = trimmed.indexOf('@');
  if (atIndex === -1) {
    return { normalized: trimmed, baseEmail: trimmed };
  }
  const localPart = trimmed.slice(0, atIndex);
  const domainPart = trimmed.slice(atIndex);
  const plusIndex = localPart.indexOf('+');
  const baseLocal = plusIndex !== -1 ? localPart.slice(0, plusIndex) : localPart;
  return {
    normalized: trimmed,
    baseEmail: `${baseLocal}${domainPart}`,
  };
}

/**
 * Check if an email is on the Do Not Contact list (supports exact match and plus-address base email match)
 */
export async function isOnDncList(email: string, organizationId?: string): Promise<boolean> {
  if (!email || typeof email !== 'string') return false;
  const { normalized, baseEmail } = normalizeDncEmail(email);
  const candidateEmails = normalized === baseEmail ? [normalized] : [normalized, baseEmail];

  const entry = await db.doNotContact.findFirst({
    where: {
      email: { in: candidateEmails },
      ...(organizationId ? { organizationId } : {}),
    },
  });
  return !!entry;
}

/**
 * Add an email to the DNC list (normalizes plus-addressing and updates existing if matched)
 */
export async function addToDncList(email: string, reason: string, source: string, leadId?: string, organizationId?: string): Promise<void> {
  if (!email || typeof email !== 'string') return;
  const { normalized, baseEmail } = normalizeDncEmail(email);
  const candidateEmails = normalized === baseEmail ? [normalized] : [normalized, baseEmail];

  const existing = await db.doNotContact.findFirst({
    where: {
      email: { in: candidateEmails },
      ...(organizationId ? { organizationId } : {}),
    },
  });
  if (existing) {
    await db.doNotContact.update({ where: { id: existing.id }, data: { reason, source } });
  } else {
    await db.doNotContact.create({ data: { organizationId, email: normalized, reason, source } });
  }
}

/**
 * Check if a campaign has reached its daily sending limit
 */
export async function checkSendingLimit(campaignId: string): Promise<{ allowed: boolean; remaining: number }> {
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { allowed: false, remaining: 0 };

  const today = new Date().toISOString().split('T')[0];
  const isDateToday = (d: any) => d instanceof Date ? d.toISOString().split('T')[0] === today : String(d || '').startsWith(today);
  const now = new Date();

  // Reset counter if it's a new day
  if (!isDateToday(campaign.dailySendsDate)) {
    await db.campaign.update({
      where: { id: campaignId },
      data: { dailySendsCount: 0, dailySendsDate: now },
    });
    return { allowed: true, remaining: campaign.maxDailySends ?? 50 };
  }

  const maxSends = campaign.maxDailySends ?? 50;
  const currentCount = campaign.dailySendsCount ?? 0;
  const remaining = Math.max(0, maxSends - currentCount);
  return { allowed: remaining > 0, remaining };
}

/**
 * Increment the daily send counter for a campaign
 */
export async function incrementDailySends(campaignId: string): Promise<void> {
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return;

  const today = new Date().toISOString().split('T')[0];
  const isDateToday = (d: any) => d instanceof Date ? d.toISOString().split('T')[0] === today : String(d || '').startsWith(today);
  const now = new Date();
  const count = isDateToday(campaign.dailySendsDate) ? (campaign.dailySendsCount ?? 0) + 1 : 1;

  await db.campaign.update({
    where: { id: campaignId },
    data: { dailySendsCount: count, dailySendsDate: now },
  });
}

/**
 * Append unsubscribe footer to email body
 */
export function appendUnsubscribeFooter(body: string, _senderEmail: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const footer = `\n\n---\nIf you'd prefer not to receive these emails, reply with "unsubscribe" or click here: ${baseUrl}/api/webhooks/resend/unsubscribe?email=RECIPIENT_EMAIL\n\nYou can also click the one-click unsubscribe button in your email client.`;
  return body + footer;
}

/**
 * Comprehensive safety check before contacting a lead
 */
export async function isLeadSafeToContact(leadId: string, organizationId?: string): Promise<{ safe: boolean; reasons: string[] }> {
  const reasons: string[] = [];

  const lead = await db.lead.findFirst({
    where: {
      id: leadId,
      ...(organizationId ? { organizationId } : {}),
    },
  });
  if (!lead) {
    return { safe: false, reasons: ['Lead not found'] };
  }

  if (lead.isBlacklisted) {
    reasons.push('Lead is blacklisted');
  }

  if (lead.doNotContact) {
    reasons.push('Lead is marked do-not-contact');
  }

  const onDnc = await isOnDncList(lead.email, organizationId || lead.organizationId || undefined);
  if (onDnc) {
    reasons.push('Email is on Do-Not-Contact list');
  }

  if (lead.status === 'unsubscribed') {
    reasons.push('Lead has unsubscribed');
  }

  const emailCheck = validateEmail(lead.email);
  if (!emailCheck.valid) {
    reasons.push(`Invalid email: ${emailCheck.reason}`);
  }

  return { safe: reasons.length === 0, reasons };
}

/**
 * RFC 4180-compliant quote-aware CSV line parser
 * Handles double-quoted fields, commas inside quotes, and escaped quotes ("")
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === ',') {
        fields.push(currentField);
        currentField = '';
        i++;
      } else {
        currentField += char;
        i++;
      }
    }
  }
  fields.push(currentField);
  return fields;
}

/**
 * Parse CSV string into array of lead objects
 */
export function parseCsv(csvText: string): {
  leads: Array<{ name: string; email: string; company?: string; title?: string; url?: string; linkedinUrl?: string }>;
  errors: Array<{ row: number; reason: string }>;
} {
  const leads: Array<{ name: string; email: string; company?: string; title?: string; url?: string; linkedinUrl?: string }> = [];
  const errors: Array<{ row: number; reason: string }> = [];

  if (!csvText || typeof csvText !== 'string') {
    errors.push({ row: 0, reason: 'CSV content must be a non-empty string' });
    return { leads, errors };
  }

  // Strip null bytes and normalize line breaks
  const sanitizedCsv = csvText.replace(/\0/g, '');
  const lines = sanitizedCsv.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    errors.push({ row: 0, reason: 'CSV must have a header row and at least one data row' });
    return { leads, errors };
  }

  // Parse header
  const headers = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  const emailIdx = headers.findIndex(h => h === 'email' || h === 'e-mail' || h === 'email_address');
  const nameIdx = headers.findIndex(h => h === 'name' || h === 'full_name' || h === 'first_name' || h === 'contact_name');
  const companyIdx = headers.findIndex(h => h === 'company' || h === 'organization' || h === 'company_name');
  const titleIdx = headers.findIndex(h => h === 'title' || h === 'job_title' || h === 'role' || h === 'position');
  const urlIdx = headers.findIndex(h => h === 'url' || h === 'website' || h === 'company_url' || h === 'website_url');
  const linkedinIdx = headers.findIndex(h => h === 'linkedin' || h === 'linkedin_url' || h === 'linkedin_url');

  if (emailIdx === -1) {
    errors.push({ row: 0, reason: 'CSV must have an "email" column' });
    return { leads, errors };
  }

  const sanitizeCsvValue = (val?: string): string | undefined => {
    if (!val) return undefined;
    const clean = val.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
    if (!clean) return undefined;
    if (/^[=+\-@\t\r]/.test(clean)) {
      return `'` + clean;
    }
    return clean;
  };

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    if (rawLine.length > 32768) {
      errors.push({ row: i + 1, reason: 'Row exceeds maximum line length limit (32KB)' });
      continue;
    }

    const cols = parseCsvLine(rawLine).map(c => c.trim());

    const rawEmail = cols[emailIdx]?.trim().toLowerCase();
    if (!rawEmail) {
      errors.push({ row: i + 1, reason: 'Missing email' });
      continue;
    }

    // Neutralize formula injection in email if attempted
    const email = rawEmail.replace(/^[=+\-@\t\r]+/, '');
    const validation = validateEmail(email);
    if (!validation.valid) {
      errors.push({ row: i + 1, reason: `Invalid email: ${validation.reason}` });
      continue;
    }

    const rawName = nameIdx >= 0 ? cols[nameIdx]?.trim() : '';
    if (!rawName) {
      errors.push({ row: i + 1, reason: 'Missing name' });
      continue;
    }

    const sanitizedName = sanitizeCsvValue(rawName) || rawName;

    leads.push({
      name: sanitizedName,
      email,
      company: companyIdx >= 0 ? sanitizeCsvValue(cols[companyIdx]?.trim()) : undefined,
      title: titleIdx >= 0 ? sanitizeCsvValue(cols[titleIdx]?.trim()) : undefined,
      url: urlIdx >= 0 ? sanitizeCsvValue(cols[urlIdx]?.trim()) : undefined,
      linkedinUrl: linkedinIdx >= 0 ? sanitizeCsvValue(cols[linkedinIdx]?.trim()) : undefined,
    });
  }

  return { leads, errors };
}
