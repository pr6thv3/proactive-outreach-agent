// ─── Safety & Validation Utilities ────────────────────
// Production-grade checks before any outreach action

import { db } from '@/lib/db';

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

  // Check for obvious typos
  const domain = trimmed.split('@')[1];
  if (domain && FREE_EMAIL_DOMAINS.has(domain)) {
    // Free email is ok but note it — B2B outreach prefers work emails
    return { valid: true, reason: undefined };
  }

  return { valid: true };
}

/**
 * Check if an email is on the Do Not Contact list
 */
export async function isOnDncList(email: string, organizationId?: string): Promise<boolean> {
  const entry = await db.doNotContact.findFirst({
    where: {
      email: email.trim().toLowerCase(),
      ...(organizationId ? { organizationId } : {}),
    },
  });
  return !!entry;
}

/**
 * Add an email to the DNC list
 */
export async function addToDncList(email: string, reason: string, source: string, leadId?: string, organizationId?: string): Promise<void> {
  const lower = email.trim().toLowerCase();
  const existing = await db.doNotContact.findFirst({
    where: { email: lower, ...(organizationId ? { organizationId } : {}) },
  });
  if (existing) {
    await db.doNotContact.update({ where: { id: existing.id }, data: { reason, source } });
  } else {
    await db.doNotContact.create({ data: { organizationId, email: lower, reason, source, leadId } });
  }
}

/**
 * Check if a campaign has reached its daily sending limit
 */
export async function checkSendingLimit(campaignId: string): Promise<{ allowed: boolean; remaining: number }> {
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { allowed: false, remaining: 0 };

  const today = new Date().toISOString().split('T')[0];

  // Reset counter if it's a new day
  if (campaign.dailySendsDate !== today) {
    await db.campaign.update({
      where: { id: campaignId },
      data: { dailySendsCount: 0, dailySendsDate: today },
    });
    return { allowed: true, remaining: campaign.maxDailySends };
  }

  const remaining = Math.max(0, campaign.maxDailySends - campaign.dailySendsCount);
  return { allowed: remaining > 0, remaining };
}

/**
 * Increment the daily send counter for a campaign
 */
export async function incrementDailySends(campaignId: string): Promise<void> {
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return;

  const today = new Date().toISOString().split('T')[0];
  const count = campaign.dailySendsDate === today ? campaign.dailySendsCount + 1 : 1;

  await db.campaign.update({
    where: { id: campaignId },
    data: { dailySendsCount: count, dailySendsDate: today },
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
 * Parse CSV string into array of lead objects
 */
export function parseCsv(csvText: string): {
  leads: Array<{ name: string; email: string; company?: string; title?: string; url?: string; linkedinUrl?: string }>;
  errors: Array<{ row: number; reason: string }>;
} {
  const leads: Array<{ name: string; email: string; company?: string; title?: string; url?: string; linkedinUrl?: string }> = [];
  const errors: Array<{ row: number; reason: string }> = [];

  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    errors.push({ row: 0, reason: 'CSV must have a header row and at least one data row' });
    return { leads, errors };
  }

  // Parse header
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
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

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));

    const email = cols[emailIdx]?.trim().toLowerCase();
    if (!email) {
      errors.push({ row: i + 1, reason: 'Missing email' });
      continue;
    }

    const validation = validateEmail(email);
    if (!validation.valid) {
      errors.push({ row: i + 1, reason: `Invalid email: ${validation.reason}` });
      continue;
    }

    const name = nameIdx >= 0 ? cols[nameIdx]?.trim() : '';
    if (!name) {
      errors.push({ row: i + 1, reason: 'Missing name' });
      continue;
    }

    leads.push({
      name,
      email,
      company: companyIdx >= 0 ? cols[companyIdx]?.trim() || undefined : undefined,
      title: titleIdx >= 0 ? cols[titleIdx]?.trim() || undefined : undefined,
      url: urlIdx >= 0 ? cols[urlIdx]?.trim() || undefined : undefined,
      linkedinUrl: linkedinIdx >= 0 ? cols[linkedinIdx]?.trim() || undefined : undefined,
    });
  }

  return { leads, errors };
}
