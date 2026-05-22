// ─── Tracking Helpers — Open/Click Tracking ────────────
// Generates tracking pixels and wrapped links for email analytics

import { db } from '@/lib/db';

/**
 * Generate an open tracking pixel HTML
 * This is a 1x1 transparent PNG that fires when the email is opened
 */
export function generateOpenTrackingPixel(messageId: string): string {
  const trackingUrl = `${getBaseUrl()}/api/webhooks/resend/track?event=opened&mid=${encodeURIComponent(messageId)}`;
  return `<img src="${trackingUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;" />`;
}

/**
 * Wrap a URL for click tracking
 * Returns a tracking URL that redirects to the original URL after logging
 */
export function wrapLinkForTracking(url: string, messageId: string): string {
  const trackingUrl = `${getBaseUrl()}/api/webhooks/resend/track?event=clicked&mid=${encodeURIComponent(messageId)}&url=${encodeURIComponent(url)}`;
  return trackingUrl;
}

/**
 * Process HTML body to add tracking pixel and wrap links
 */
export function addTrackingToHtml(html: string, messageId: string): string {
  // Add open tracking pixel before </body> or at the end
  const pixel = generateOpenTrackingPixel(messageId);

  if (html.includes('</body>')) {
    html = html.replace('</body>', `${pixel}</body>`);
  } else {
    html = html + pixel;
  }

  // Wrap links for click tracking
  html = html.replace(
    /href="(https?:\/\/[^"]+)"/gi,
    (match, url) => {
      // Don't wrap our own tracking URLs
      if (url.includes('/api/webhooks/')) return match;
      return `href="${wrapLinkForTracking(url, messageId)}"`;
    },
  );

  return html;
}

/**
 * Handle a tracked open event
 */
export async function handleTrackedOpen(messageId: string): Promise<void> {
  const message = await db.outreachMessage.findUnique({ where: { id: messageId } });
  if (!message) return;

  // Only record first open
  if (!message.openedAt) {
    await db.outreachMessage.update({
      where: { id: messageId },
      data: { openedAt: new Date() },
    });
  }

  // Record the event
  await db.emailEvent.create({
    data: {
      eventType: 'opened',
      recipient: (await db.lead.findUnique({ where: { id: message.leadId } }))?.email || '',
      messageId,
      leadId: message.leadId,
      campaignId: message.campaignId,
    },
  }).catch(() => {});

  // Update domain metrics
  const domain = await findDomainForMessage(messageId);
  if (domain) {
    await db.sendingDomain.update({
      where: { id: domain.id },
      data: { totalOpened: domain.totalOpened + 1 },
    });
  }
}

/**
 * Handle a tracked click event
 */
export async function handleTrackedClick(messageId: string, originalUrl: string): Promise<void> {
  const message = await db.outreachMessage.findUnique({ where: { id: messageId } });
  if (!message) return;

  // Only record first click
  if (!message.clickedAt) {
    await db.outreachMessage.update({
      where: { id: messageId },
      data: { clickedAt: new Date() },
    });
  }

  // Record the event
  await db.emailEvent.create({
    data: {
      eventType: 'clicked',
      recipient: (await db.lead.findUnique({ where: { id: message.leadId } }))?.email || '',
      clickUrl: originalUrl,
      messageId,
      leadId: message.leadId,
      campaignId: message.campaignId,
    },
  }).catch(() => {});

  // Update domain metrics
  const domain = await findDomainForMessage(messageId);
  if (domain) {
    await db.sendingDomain.update({
      where: { id: domain.id },
      data: { totalClicked: domain.totalClicked + 1 },
    });
  }
}

/**
 * Find the sending domain used for a message
 */
async function findDomainForMessage(messageId: string) {
  // Get the most recent 'sent' event for this message
  const sendEvent = await db.emailEvent.findFirst({
    where: { messageId, eventType: 'sent' },
    orderBy: { createdAt: 'desc' },
  });

  if (sendEvent?.domainId) {
    return db.sendingDomain.findUnique({ where: { id: sendEvent.domainId } });
  }

  // Fallback: find the first verified domain
  return db.sendingDomain.findFirst({ where: { status: 'verified' } });
}

/**
 * Get the base URL for tracking endpoints
 */
function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
}

/**
 * Convert plain text email body to simple HTML
 */
export function textToHtml(text: string, fromName?: string): string {
  const paragraphs = text
    .split('\n\n')
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
${paragraphs}
</body>
</html>`;
}
