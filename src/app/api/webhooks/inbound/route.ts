// ─── Webhook: Inbound Email ────────────────────────────
// Handle inbound email (replies) from Resend
// Parses the inbound email, finds the matching OutreachMessage, stores the reply

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { DeliverabilityService } from '@/lib/deliverability';

interface InboundEmail {
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email: InboundEmail = body;

    if (!email.from || !email.subject) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Find the lead by email
    const lead = await db.lead.findFirst({
      where: { email: email.from.toLowerCase() },
    });

    if (!lead) {
      if (process.env.NODE_ENV !== 'production') console.log(`[InboundEmail] No lead found for email: ${email.from}`);
      return NextResponse.json({ received: true, matched: false });
    }

    // Find the matching OutreachMessage
    // Look for messages sent to this lead that are in 'sent' or 'delivered' status
    let matchingMessage = await findMatchingMessage(lead.id, email);

    const replyText = email.text || email.html?.replace(/<[^>]+>/g, '') || '';

    // Update the message with reply info
    if (matchingMessage) {
      await db.outreachMessage.update({
        where: { id: matchingMessage.id },
        data: {
          status: 'replied',
          repliedAt: new Date(),
        },
      });
    }

    // Update lead status
    await db.lead.update({
      where: { id: lead.id },
      data: { status: 'replied' },
    });

    // Create reply classification entry (pending classification)
    if (matchingMessage) {
      await db.replyClassification.create({
        data: {
          category: 'neutral', // Default, will be updated by classifier
          confidence: 0,
          replyText: replyText.slice(0, 5000),
          nextAction: 'no_action',
          messageId: matchingMessage.id,
        },
      });
    }

    // Record email event
    await DeliverabilityService.recordEvent({
      eventType: 'replied' as never,
      recipient: email.from,
      messageId: matchingMessage?.id,
      leadId: lead.id,
      campaignId: matchingMessage?.campaignId || undefined,
      rawData: JSON.stringify(body),
    });

    // Create activity
    await db.activity.create({
      data: {
        type: 'reply_received',
        description: `Reply received from ${lead.name}: "${replyText.slice(0, 100)}..."`,
        phase: 'reeval',
        leadId: lead.id,
        metadata: JSON.stringify({
          messageId: matchingMessage?.id,
          subject: email.subject,
          replyLength: replyText.length,
        }),
      },
    });

    return NextResponse.json({ received: true, matched: true, leadId: lead.id });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') console.error('[InboundEmail] Error processing inbound email:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

/**
 * Find the matching OutreachMessage for a reply
 * Uses multiple heuristics: In-Reply-To header, subject matching, most recent sent message
 */
async function findMatchingMessage(leadId: string, email: InboundEmail) {
  // 1. Try to match by In-Reply-To or References header
  const inReplyTo = email.headers?.['In-Reply-To'] || email.headers?.['in-reply-to'];
  const references = email.headers?.['References'] || email.headers?.['references'];

  if (inReplyTo) {
    // Look for message with this X-Message-Id
    const messageByHeader = await db.outreachMessage.findFirst({
      where: {
        leadId,
        status: { in: ['sent', 'delivered'] },
      },
      orderBy: { sentAt: 'desc' },
    });
    if (messageByHeader) return messageByHeader;
  }

  // 2. Try to match by subject (remove Re: prefix)
  const cleanSubject = email.subject.replace(/^(Re|RE|Fwd|FW):\s*/i, '').trim();
  if (cleanSubject) {
    const messageBySubject = await db.outreachMessage.findFirst({
      where: {
        leadId,
        subject: { contains: cleanSubject },
        status: { in: ['sent', 'delivered'] },
      },
      orderBy: { sentAt: 'desc' },
    });
    if (messageBySubject) return messageBySubject;
  }

  // 3. Fall back to the most recent sent message to this lead
  const mostRecentMessage = await db.outreachMessage.findFirst({
    where: {
      leadId,
      status: { in: ['sent', 'delivered'] },
    },
    orderBy: { sentAt: 'desc' },
  });

  return mostRecentMessage;
}
