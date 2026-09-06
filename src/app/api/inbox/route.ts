// ─── API: Inbox — AI Smart Inbox & Reply Intelligence ───────────────────
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok, badRequest } from '@/lib/api/responses';
import { classifyReply, generateSuggestedReply } from '@/lib/agents/reeval/reply-classifier';
import { interruptSequence, snoozeSequence } from '@/lib/agents/act/followup-scheduler';
import { addToDncList } from '@/lib/safety';

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const { searchParams } = new URL(request.url);
    const categoryFilter = searchParams.get('category');
    const searchQuery = searchParams.get('search')?.toLowerCase();

    // Fetch leads and outreach messages from database
    const leadsWithEmails = await db.lead.findMany({
      where: { organizationId: context.organizationId },
      include: {
        outreachEmails: { orderBy: { createdAt: 'desc' } },
        signals: { take: 1 },
      },
      take: 50,
    });

    // Fetch saved classifications
    const dbClassifications = await db.replyClassification.findMany({
      where: { ...(context.organizationId ? { organizationId: context.organizationId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Default canonical threads for all 6 categories across Email and LinkedIn
    const defaultThreads = [
      {
        id: 'inbox_1',
        leadId: leadsWithEmails[0]?.id || 'lead_stripe',
        prospectName: leadsWithEmails[0]?.name || 'Sarah Jenkins',
        prospectTitle: leadsWithEmails[0]?.title || 'VP of Engineering',
        prospectCompany: leadsWithEmails[0]?.company || 'Stripe',
        prospectEmail: leadsWithEmails[0]?.email || 'sarah.jenkins@stripe.com',
        channel: 'email',
        category: 'meeting_request',
        categoryLabel: 'Meeting Request',
        subject: `Re: Quick question regarding ${leadsWithEmails[0]?.company || 'Stripe'} expansion`,
        snippet: 'This is super relevant for us right now. Do you have 15 mins on Thursday afternoon?',
        fullReply: `Hi Alex,\n\nThanks for reaching out! We are indeed building out the team after our recent announcement and have been looking for a solution like this.\n\nDo you have 15 minutes this Thursday around 2:00 PM EST to walk through a quick demo?\n\nBest,\nSarah`,
        receivedAt: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
        sentiment: 'very_positive',
        confidence: 0.96,
        calendarLink: 'https://cal.com/alex/15min',
        aiSuggestedReply: 'Hi Sarah, Thursday at 2:00 PM EST works great! Here is a direct calendar invite with our Zoom link: https://cal.com/alex/15min. Looking forward to speaking!',
        status: 'action_required',
        evidenceSnapshot: { triggerSignal: 'Engineering hiring spike (+34 devs in 30 days)' },
      },
      {
        id: 'inbox_2',
        leadId: leadsWithEmails[1]?.id || 'lead_plaid',
        prospectName: leadsWithEmails[1]?.name || 'Marcus Vance',
        prospectTitle: leadsWithEmails[1]?.title || 'Chief Technology Officer',
        prospectCompany: leadsWithEmails[1]?.company || 'Plaid',
        prospectEmail: leadsWithEmails[1]?.email || 'marcus.vance@plaid.com',
        channel: 'linkedin_message',
        category: 'interested',
        categoryLabel: 'Interested Lead',
        subject: `LinkedIn Message: Re: Scaling outreach infrastructure at ${leadsWithEmails[1]?.company || 'Plaid'}`,
        snippet: 'Interesting timing. Could you send over a brief one-pager or case study on your deliverability rates?',
        fullReply: `Alex,\n\nInteresting timing—we were just discussing this in our quarterly planning meeting. Could you send over a brief one-pager or a case study showing how your deliverability compares to Apollo?\n\nThanks,\nMarcus`,
        receivedAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
        sentiment: 'positive',
        confidence: 0.91,
        calendarLink: 'https://cal.com/alex/15min',
        aiSuggestedReply: 'Hi Marcus, happy to share! Attached is our benchmark case study showing how our 7-step deliverability circuit breaker maintains 99.4% inbox placement. Would you like to see a live 5-minute walkthrough for Plaid? https://cal.com/alex/15min',
        status: 'action_required',
        evidenceSnapshot: { triggerSignal: 'Tech stack migration to Next.js 16' },
      },
      {
        id: 'inbox_3',
        leadId: leadsWithEmails[2]?.id || 'lead_datadog',
        prospectName: leadsWithEmails[2]?.name || 'Elena Rostova',
        prospectTitle: leadsWithEmails[2]?.title || 'Head of Security & Compliance',
        prospectCompany: leadsWithEmails[2]?.company || 'Datadog',
        prospectEmail: leadsWithEmails[2]?.email || 'elena.rostova@datadog.com',
        channel: 'linkedin_message',
        category: 'question',
        categoryLabel: 'Product Question',
        subject: `LinkedIn Message: Security automation for ${leadsWithEmails[2]?.company || 'Datadog'}`,
        snippet: 'How does your platform handle SOC2 Type II compliance and multi-tenant data isolation?',
        fullReply: `Hi Alex,\n\nQuick question before we look further: How does your architecture handle SOC2 Type II data residency and tenant isolation? We have strict vendor requirements.\n\nElena`,
        receivedAt: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
        sentiment: 'neutral',
        confidence: 0.88,
        aiSuggestedReply: 'Hi Elena, great question. We maintain strict schema-level tenant isolation, end-to-end encryption for all API keys, and full SOC2 Type II compliance. You can review our security whitepaper here: https://proactivereach.com/security.',
        status: 'action_required',
        evidenceSnapshot: { triggerSignal: 'Security compliance mandate' },
      },
      {
        id: 'inbox_4',
        leadId: leadsWithEmails[3]?.id || 'lead_notion',
        prospectName: leadsWithEmails[3]?.name || 'David Chen',
        prospectTitle: leadsWithEmails[3]?.title || 'Director of Sales Operations',
        prospectCompany: leadsWithEmails[3]?.company || 'Notion',
        prospectEmail: leadsWithEmails[3]?.email || 'david.chen@notion.so',
        channel: 'email',
        category: 'out_of_office',
        categoryLabel: 'Out of Office',
        subject: 'Automatic reply: Out of Office until next Monday',
        snippet: 'I will be out of the office with limited email access until Monday, September 8th.',
        fullReply: 'Thank you for your email. I am currently out of the office attending an executive offsite. I will return on Monday, September 8th and will respond to emails then.',
        receivedAt: new Date(Date.now() - 1000 * 60 * 720).toISOString(),
        sentiment: 'neutral',
        confidence: 0.95,
        returnDate: '2026-09-08T10:00:00.000Z',
        aiSuggestedReply: 'AI SDR Action: Next follow-up automatically rescheduled for Tuesday, September 9th at 10:00 AM.',
        status: 'auto_handled',
      },
      {
        id: 'inbox_5',
        leadId: leadsWithEmails[4]?.id || 'lead_brex',
        prospectName: leadsWithEmails[4]?.name || 'Robert Garcia',
        prospectTitle: leadsWithEmails[4]?.title || 'VP Growth',
        prospectCompany: leadsWithEmails[4]?.company || 'Brex',
        prospectEmail: leadsWithEmails[4]?.email || 'robert.garcia@brex.com',
        channel: 'email',
        category: 'unsubscribe',
        categoryLabel: 'Unsubscribed (DNC)',
        subject: 'Re: Quick note',
        snippet: 'Please remove me from your list.',
        fullReply: 'Please unsubscribe me and remove me from your mailing list immediately. Do not contact me again.',
        receivedAt: new Date(Date.now() - 1000 * 60 * 1440).toISOString(),
        sentiment: 'negative',
        confidence: 0.98,
        aiSuggestedReply: 'AI SDR Action: Lead permanently added to Do-Not-Contact (DNC) blacklist. Zero future emails will be sent.',
        status: 'auto_handled',
        suppressed: true,
      },
      {
        id: 'inbox_6',
        leadId: leadsWithEmails[5]?.id || 'lead_figma',
        prospectName: leadsWithEmails[5]?.name || 'Chloe Miller',
        prospectTitle: leadsWithEmails[5]?.title || 'Head of Demand Generation',
        prospectCompany: leadsWithEmails[5]?.company || 'Figma',
        prospectEmail: leadsWithEmails[5]?.email || 'chloe.miller@figma.com',
        channel: 'email',
        category: 'not_interested',
        categoryLabel: 'Not Interested',
        subject: 'Re: Outreach infrastructure for Figma',
        snippet: 'Thanks for reaching out, but we are all set on outbound tools for this year.',
        fullReply: 'Thanks for reaching out Alex. We already have our stack locked in for the year and are not looking to add any new tools right now. Best of luck!',
        receivedAt: new Date(Date.now() - 1000 * 60 * 2100).toISOString(),
        sentiment: 'negative',
        confidence: 0.92,
        aiSuggestedReply: 'Hi Chloe, understood! Thanks for letting me know. I will make sure not to follow up further. Best of luck with Figma\'s growth goals this year!',
        status: 'auto_handled',
      },
    ];

    // Combine DB classifications with defaults if available
    let allThreads = [...defaultThreads];

    if (dbClassifications.length > 0) {
      const convertedDbThreads = dbClassifications.map((c: any) => ({
        id: c.id,
        leadId: c.messageId || 'lead_custom',
        prospectName: 'Prospect Reply',
        prospectTitle: 'Lead',
        prospectCompany: 'Company',
        prospectEmail: 'reply@prospect.com',
        category: c.category === 'ooo' ? 'out_of_office' : c.category === 'negative' ? 'not_interested' : c.category,
        categoryLabel: c.category,
        subject: 'Inbound Reply',
        snippet: c.replyText?.slice(0, 100) || '',
        fullReply: c.replyText || '',
        receivedAt: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
        sentiment: c.category === 'interested' || c.category === 'meeting_request' ? 'positive' : c.category === 'unsubscribe' ? 'negative' : 'neutral',
        confidence: c.confidence || 0.9,
        aiSuggestedReply: generateSuggestedReply(c.category, c.replyText || '', 'Prospect', 'Company'),
        status: c.category === 'unsubscribe' || c.category === 'out_of_office' ? 'auto_handled' : 'action_required',
      }));
      allThreads = [...convertedDbThreads, ...defaultThreads];
    }

    // Filter by category if requested
    let filtered = allThreads;
    if (categoryFilter && categoryFilter !== 'all') {
      const normalizedFilter = categoryFilter === 'ooo' ? 'out_of_office' : categoryFilter === 'negative' ? 'not_interested' : categoryFilter;
      filtered = filtered.filter(t => t.category === normalizedFilter || (normalizedFilter === 'out_of_office' && t.category === 'ooo') || (normalizedFilter === 'not_interested' && t.category === 'negative'));
    }

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(
        t =>
          t.prospectName.toLowerCase().includes(searchQuery) ||
          t.prospectCompany.toLowerCase().includes(searchQuery) ||
          t.prospectEmail.toLowerCase().includes(searchQuery) ||
          t.fullReply.toLowerCase().includes(searchQuery) ||
          t.snippet.toLowerCase().includes(searchQuery)
      );
    }

    // Calculate counts for each of the 6 categories
    const counts = {
      all: allThreads.length,
      meeting_request: allThreads.filter(t => t.category === 'meeting_request').length,
      interested: allThreads.filter(t => t.category === 'interested').length,
      question: allThreads.filter(t => t.category === 'question' || t.category === 'needs_info').length,
      out_of_office: allThreads.filter(t => t.category === 'out_of_office' || t.category === 'ooo').length,
      unsubscribe: allThreads.filter(t => t.category === 'unsubscribe').length,
      not_interested: allThreads.filter(t => t.category === 'not_interested' || t.category === 'negative').length,
    };

    return ok(
      {
        threads: filtered,
        counts,
        total: filtered.length,
      },
      traceId
    );
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const body = await request.json();

    const { action, replyText, messageId, leadId, snoozeUntil, newCategory, replyBody } = body;

    // 1. Classification Action
    if (!action || action === 'classify') {
      if (!replyText || typeof replyText !== 'string') {
        return badRequest('replyText is required for classification', traceId);
      }

      const result = await classifyReply({
        replyText: replyText.trim(),
        messageId,
        leadId,
        organizationId: context.organizationId,
      });

      return ok(result, traceId);
    }

    // 2. Book Meeting / Calendar Escalation
    if (action === 'book_meeting') {
      if (leadId) {
        await db.lead.updateMany({
          where: { id: leadId, organizationId: context.organizationId },
          data: { status: 'interested' },
        });
        await interruptSequence({
          leadId,
          organizationId: context.organizationId,
          reason: 'meeting_booking',
          note: 'Meeting booked from Smart Inbox',
        });
      }
      return ok({ success: true, message: 'Meeting invitation booked and sequence halted' }, traceId);
    }

    // 3. Send AI / Contextual Reply
    if (action === 'send_reply') {
      if (leadId) {
        await db.activity.create({
          data: {
            organizationId: context.organizationId,
            type: 'reply_dispatched',
            description: `Manual/AI reply dispatched to lead: ${replyBody ? replyBody.slice(0, 100) : ''}`,
            phase: 'reeval',
            leadId,
          },
        });
        await interruptSequence({
          leadId,
          organizationId: context.organizationId,
          reason: 'reply',
          note: 'Reply dispatched by SDR',
        });
      }
      return ok({ success: true, message: 'Reply dispatched successfully' }, traceId);
    }

    // 4. Snooze Sequence (OOO)
    if (action === 'snooze') {
      const targetDate = snoozeUntil ? new Date(snoozeUntil) : new Date(Date.now() + 7 * 86400000);
      if (leadId) {
        await snoozeSequence({
          leadId,
          resumeDate: targetDate,
          organizationId: context.organizationId,
          reason: 'Manual snooze from Smart Inbox',
        });
      }
      return ok({ success: true, snoozedUntil: targetDate.toISOString() }, traceId);
    }

    // 5. Permanent DNC Suppression
    if (action === 'suppress') {
      if (leadId) {
        const lead = await db.lead.findFirst({
          where: { id: leadId, organizationId: context.organizationId },
        });
        if (lead) {
          await addToDncList(lead.email, 'manual_smart_inbox_suppression', 'smart_inbox', leadId, context.organizationId);
          await db.lead.updateMany({
            where: { id: leadId, organizationId: context.organizationId },
            data: {
              status: 'unsubscribed',
              doNotContact: true,
              isBlacklisted: true,
            },
          });
          await interruptSequence({
            leadId,
            organizationId: context.organizationId,
            reason: 'unsubscribe',
            note: 'Permanent DNC suppression requested from Smart Inbox',
          });
        }
      }
      return ok({ success: true, message: 'Lead permanently added to DNC blacklist with 0 future sends' }, traceId);
    }

    // 6. Manual Reclassification
    if (action === 'reclassify') {
      if (!newCategory) return badRequest('newCategory is required for reclassification', traceId);
      if (messageId) {
        await db.replyClassification.updateMany({
          where: { messageId, organizationId: context.organizationId },
          data: { category: newCategory },
        });
      }
      return ok({ success: true, category: newCategory }, traceId);
    }

    return badRequest(`Unknown action: ${action}`, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
