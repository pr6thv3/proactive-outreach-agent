// ─── Resend Client — Production Email Sending ──────────
// Wraps the Resend SDK for reliable email delivery with full tracking

import { Resend } from 'resend';
import { db } from '@/lib/db';
import { logger } from '@/lib/agents/infrastructure/observability';

export interface SendEmailParams {
  to: string | string[];
  from: string;              // "Name <email@domain.com>"
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  headers?: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
  // Our internal tracking
  organizationId: string;
  messageId?: string;        // Our OutreachMessage ID
  leadId?: string;
  campaignId?: string;
  domainId?: string;
}

export interface SendEmailResult {
  success: boolean;
  providerId?: string;       // Resend's message ID
  error?: string;
}

export interface DomainVerificationResult {
  success: boolean;
  domainId?: string;         // Resend's domain ID
  records?: {
    spf: { type: 'TXT'; host: string; value: string; verified: boolean };
    dkim: { type: 'CNAME'; host: string; value: string; verified: boolean };
    dmarc: { type: 'TXT'; host: string; value: string; verified: boolean };
  };
  error?: string;
}

let resendInstance: Resend | null = null;

function getResend(): Resend {
  if (!resendInstance) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || apiKey.startsWith('re_xxxx')) {
      throw new Error('RESEND_API_KEY is not configured. Set it in .env');
    }
    resendInstance = new Resend(apiKey);
  }
  return resendInstance;
}

/**
 * Check if Resend is configured and ready
 */
export function isResendConfigured(): boolean {
  const apiKey = process.env.RESEND_API_KEY;
  return !!apiKey && !apiKey.startsWith('re_xxxx');
}

/**
 * Send an email via Resend with full tracking
 */
export async function sendEmailViaResend(params: SendEmailParams): Promise<SendEmailResult> {
  try {
    if (!isResendConfigured()) {
      return { success: false, error: 'Resend API key not configured' };
    }

    const resend = getResend();

    // Build tracking headers
    const trackingHeaders: Record<string, string> = {
      'X-Message-Id': params.messageId || '',
      'X-Campaign-Id': params.campaignId || '',
      'X-Lead-Id': params.leadId || '',
    };

    // List-Unsubscribe header (RFC 8058) — required for good deliverability
    if (params.domainId) {
      const domain = await db.sendingDomain.findUnique({ where: { id: params.domainId } });
      if (domain?.replyTo) {
        trackingHeaders['List-Unsubscribe'] = `<mailto:${domain.replyTo}?subject=unsubscribe>`;
        trackingHeaders['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
      }
    }

    const allHeaders = { ...trackingHeaders, ...(params.headers || {}) };

    // Build tags for tracking in Resend dashboard
    const tags = [
      ...(params.tags || []),
      ...(params.campaignId ? [{ name: 'campaign_id', value: params.campaignId }] : []),
      ...(params.leadId ? [{ name: 'lead_id', value: params.leadId }] : []),
    ];

    const { data, error } = await resend.emails.send({
      from: params.from,
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: params.replyTo,
      headers: allHeaders,
      tags: tags.length > 0 ? tags : undefined,
    });

    if (error) {
      logger.error('Resend send failed', {
        agent: 'ResendClient',
        phase: 'act',
        leadId: params.leadId,
        metadata: { error: error.message, to: Array.isArray(params.to) ? params.to[0] : params.to },
      });
      return { success: false, error: error.message };
    }

    // Record the send event
    await db.emailEvent.create({
      data: {
        eventType: 'sent',
        organizationId: params.organizationId,
        providerId: data?.id,
        recipient: Array.isArray(params.to) ? params.to[0] : params.to,
        messageId: params.messageId,
        leadId: params.leadId,
        campaignId: params.campaignId,
        domainId: params.domainId,
      },
    });

    return { success: true, providerId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error sending email';
    logger.error('Resend exception', { agent: 'ResendClient', phase: 'act', metadata: { error: message } });
    return { success: false, error: message };
  }
}

/**
 * Create a domain in Resend for sending
 */
export async function createDomainInResend(domainName: string): Promise<DomainVerificationResult> {
  try {
    if (!isResendConfigured()) {
      return { success: false, error: 'Resend API key not configured' };
    }

    const resend = getResend();
    const { data, error } = await resend.domains.create({ name: domainName });

    if (error) {
      return { success: false, error: error.message };
    }

    // Resend returns DNS records we need to add
    // Use type assertion since Resend SDK types may not include spf/dkim/dmarc fields
    const domainData = data as unknown as Record<string, unknown> | null;
    const spfData = domainData?.spf as Record<string, string> | undefined;
    const dkimData = domainData?.dkim as Record<string, string> | undefined;
    const dmarcData = domainData?.dmarc as Record<string, string> | undefined;

    return {
      success: true,
      domainId: data?.id,
      records: {
        spf: {
          type: 'TXT' as const,
          host: domainName,
          value: spfData?.value || `v=spf1 include:resend.com ~all`,
          verified: spfData?.status === 'verified',
        },
        dkim: {
          type: 'CNAME' as const,
          host: dkimData?.host || `resend._domainkey.${domainName}`,
          value: dkimData?.value || 'resend.com',
          verified: dkimData?.status === 'verified',
        },
        dmarc: {
          type: 'TXT' as const,
          host: `_dmarc.${domainName}`,
          value: dmarcData?.value || 'v=DMARC1; p=none; rua=mailto:dmarc@resend.com',
          verified: dmarcData?.status === 'verified',
        },
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create domain' };
  }
}

/**
 * Get domain verification status from Resend
 */
export async function getResendDomainStatus(domainId: string) {
  try {
    if (!isResendConfigured()) return null;
    const resend = getResend();
    const { data, error } = await resend.domains.get(domainId);
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Verify a domain in Resend (triggers DNS check)
 */
export async function verifyDomainInResend(domainId: string): Promise<boolean> {
  try {
    if (!isResendConfigured()) return false;
    const resend = getResend();
    const { error } = await resend.domains.verify(domainId);
    return !error;
  } catch {
    return false;
  }
}

/**
 * List all domains from Resend
 */
export async function listResendDomains() {
  try {
    if (!isResendConfigured()) return [];
    const resend = getResend();
    const { data } = await resend.domains.list();
    return data?.data || [];
  } catch {
    return [];
  }
}
