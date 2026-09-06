// ─── API: Simulator — Interactive Recipient Experience & Reply Simulator ───────────
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok, badRequest, notFound } from '@/lib/api/responses';
import { ReplyClassifierAgent } from '@/lib/agents/reeval/reply-classifier';
import { interruptSequence } from '@/lib/agents/act/followup-scheduler';
import { addToDncList } from '@/lib/safety';

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);

    // Fetch latest sent or generated outreach messages with lead details
    const messages = await db.outreachMessage.findMany({
      where: {
        organizationId: context.organizationId,
      },
      include: {
        lead: true,
        campaign: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // If no messages exist in DB, provide high-fidelity interactive templates
    const simulationItems = messages.length > 0 ? messages.map((m: any) => ({
      id: m.id,
      leadId: m.leadId,
      prospectName: m.lead?.name || 'Sarah Jenkins',
      prospectEmail: m.lead?.email || 'sarah.jenkins@plaid.com',
      prospectTitle: m.lead?.title || 'Chief Technology Officer',
      prospectCompany: m.lead?.company || 'Plaid',
      subject: m.subject,
      body: m.body,
      status: m.status,
      channel: m.channel || 'email',
      evidenceSnapshot: m.evidenceSnapshot ? JSON.parse(m.evidenceSnapshot) : null,
      createdAt: m.createdAt,
    })) : [
      {
        id: 'sim_msg_1',
        leadId: 'sim_lead_1',
        prospectName: 'Sarah Jenkins',
        prospectEmail: 'sarah.jenkins@plaid.com',
        prospectTitle: 'Chief Technology Officer',
        prospectCompany: 'Plaid',
        subject: 'Quick question regarding Plaid\'s team expansion',
        body: 'Hi Sarah,\n\nNoticed Plaid recently announced your $425M Series D and is scaling security infrastructure.\n\nWe help FinTech leaders eliminate compliance bottlenecks and automate SOC2 audits. Would you be open to a 10-minute chat next Tuesday?\n\nBest,\nAlex from ProactiveReach',
        status: 'approved',
        channel: 'email',
        evidenceSnapshot: {
          signalContent: 'Plaid raised $425M Series D and is actively scaling cloud security infrastructure.',
          sourceUrl: 'https://techcrunch.com/plaid-funding',
        },
        createdAt: new Date().toISOString(),
      },
      {
        id: 'sim_msg_2',
        leadId: 'sim_lead_2',
        prospectName: 'Marcus Vance',
        prospectEmail: 'marcus.vance@stripe.com',
        prospectTitle: 'VP of Engineering',
        prospectCompany: 'Stripe',
        subject: 'LinkedIn Connection Note',
        body: 'Hi Marcus, saw your engineering hiring spike at Stripe (+34 devs). Would love to connect and share benchmark data on deliverability.',
        status: 'approved',
        channel: 'linkedin_connect',
        evidenceSnapshot: {
          signalContent: 'Engineering hiring spike (+34 devs in 30 days)',
          sourceUrl: 'https://linkedin.com/company/stripe/jobs',
        },
        createdAt: new Date().toISOString(),
      },
    ];

    return ok({ items: simulationItems }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const workspaceId = context.organizationId;
    const body = await request.json();
    const { messageId, leadId, action, replyText, recipientEmail } = body;

    if (!action) {
      return badRequest('Action is required (open, reply, book_meeting)', traceId);
    }

    if (action === 'open') {
      // Record Open Event
      if (messageId && messageId !== 'sim_msg_1' && messageId !== 'sim_msg_2') {
        const message = await db.outreachMessage.findFirst({
          where: { id: messageId, organizationId: workspaceId },
        });
        if (!message) {
          return notFound('Outreach message not found in workspace', traceId);
        }
        await db.outreachMessage.update({
          where: { id: message.id },
          data: { openedAt: new Date() },
        }).catch(() => {});
      }

      return ok({
        action: 'open',
        message: 'Recipient opened the email. Open event recorded with timestamp.',
        timestamp: new Date().toISOString(),
      }, traceId);
    }

    if (action === 'book_meeting') {
      // Record Meeting Booked
      if (leadId && leadId !== 'sim_lead_1' && leadId !== 'sim_lead_2') {
        const lead = await db.lead.findFirst({
          where: { id: leadId, organizationId: workspaceId },
        });
        if (!lead) {
          return notFound('Lead not found in workspace', traceId);
        }
        await db.lead.update({
          where: { id: lead.id },
          data: { status: 'meeting_booked' },
        }).catch(() => {});
        await interruptSequence({
          leadId: lead.id,
          organizationId: workspaceId,
          reason: 'meeting_booking',
          note: 'Prospect booked calendar demo via Cal.com',
        });
      }

      return ok({
        action: 'book_meeting',
        message: 'Meeting successfully scheduled on Cal.com! Lead stage escalated to "meeting_booked" and sequence halted.',
        leadStatus: 'meeting_booked',
        timestamp: new Date().toISOString(),
      }, traceId);
    }

    if (action === 'reply') {
      if (!replyText || !replyText.trim()) {
        return badRequest('Reply text is required for reply action', traceId);
      }

      let leadRecord: any = null;
      if (leadId && leadId !== 'sim_lead_1' && leadId !== 'sim_lead_2') {
        leadRecord = await db.lead.findFirst({
          where: { id: leadId, organizationId: workspaceId },
        });
        if (!leadRecord) {
          return notFound('Lead not found in workspace', traceId);
        }
      }

      if (messageId && messageId !== 'sim_msg_1' && messageId !== 'sim_msg_2') {
        const messageRecord = await db.outreachMessage.findFirst({
          where: { id: messageId, organizationId: workspaceId },
        });
        if (!messageRecord) {
          return notFound('Outreach message not found in workspace', traceId);
        }
      }

      // Execute AI Reply Classifier
      const classifier = new ReplyClassifierAgent();
      const result = await classifier.run({
        messageId: messageId || 'sim_msg_1',
        replyText: replyText.trim(),
      }, {
        leadId: leadRecord?.id || leadId || 'sim_lead_1',
        lead: { id: leadRecord?.id || leadId, email: recipientEmail || leadRecord?.email } as any,
        organizationId: workspaceId,
        signals: [],
        previousMessages: [],
        traceId,
      } as any);

      const classification = result.data;
      const category = classification?.category || 'interested';
      const sentiment = classification?.sentiment || 'positive';

      // Execute appropriate downstream lifecycle actions
      if (category === 'unsubscribe') {
        if (leadRecord) {
          await db.lead.update({
            where: { id: leadRecord.id },
            data: { doNotContact: true, isBlacklisted: true, status: 'unsubscribed' },
          }).catch(() => {});
        }
        await addToDncList(
          recipientEmail || leadRecord?.email || 'sarah.jenkins@plaid.com',
          'Recipient requested unsubscribe',
          'simulator',
          leadRecord?.id || leadId,
          workspaceId
        );
        await interruptSequence({
          leadId: leadRecord?.id || leadId || 'sim_lead_1',
          organizationId: workspaceId,
          reason: 'unsubscribe',
          note: 'Recipient opted out',
        });
      } else if (category === 'meeting_request' || sentiment === 'positive') {
        if (leadRecord) {
          await db.lead.update({
            where: { id: leadRecord.id },
            data: { status: 'interested' },
          }).catch(() => {});
        }
        await interruptSequence({
          leadId: leadRecord?.id || leadId || 'sim_lead_1',
          organizationId: workspaceId,
          reason: 'reply',
          note: 'Positive reply received',
        });
      }

      // Record classification event in database
      let activityLeadId = leadRecord?.id;
      if (!activityLeadId) {
        const firstLead = await db.lead.findFirst({
          where: { organizationId: workspaceId },
          select: { id: true },
        });
        if (firstLead) activityLeadId = firstLead.id;
      }
      if (activityLeadId) {
        await db.activity.create({
          data: {
            organizationId: workspaceId,
            leadId: activityLeadId,
            type: 'inbound_reply_simulated',
            phase: 'reeval',
            description: `Inbound reply simulated: "${replyText.slice(0, 60)}..." (Classified as ${category})`,
            metadata: JSON.stringify({
              messageId,
              leadId: leadRecord?.id || leadId,
              replyText,
              category,
              sentiment,
              suggestedReply: classification?.suggestedReply,
            }),
          },
        }).catch(() => {});
      }

      return ok({
        action: 'reply',
        classification: {
          category,
          sentiment,
          confidence: classification?.confidence || 0.95,
          nextAction: classification?.nextAction,
          suggestedReply: classification?.suggestedReply || 'Hi, thanks for reaching out! Looking forward to connecting.',
          calendarLink: category === 'meeting_request' || sentiment === 'positive' ? 'https://cal.com/alex/15min' : undefined,
          suppressed: category === 'unsubscribe',
        },
        message: `Inbound reply successfully classified as "${category}" with ${sentiment} sentiment.`,
        timestamp: new Date().toISOString(),
      }, traceId);
    }

    return badRequest(`Unsupported action: ${action}`, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
