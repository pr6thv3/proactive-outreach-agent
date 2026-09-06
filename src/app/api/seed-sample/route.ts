// ─── API: Seed Sample Data ────────────────────────────────────────────────────
// Seeds realistic high-intent prospects, signals, conversations and campaigns
// so clients and evaluators can immediately experience every feature.
// ──────────────────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';

const SAMPLE_PROSPECTS = [
  {
    name: 'Sarah Jenkins', firstName: 'Sarah', lastName: 'Jenkins',
    email: 'sarah.jenkins@plaid.com', company: 'Plaid', title: 'Chief Technology Officer',
    industry: 'Fintech', companySize: '1,200 employees', country: 'United States',
    score: 96, emailVerified: true, status: 'discovered',
  },
  {
    name: 'Marcus Vance', firstName: 'Marcus', lastName: 'Vance',
    email: 'marcus.vance@stripe.com', company: 'Stripe', title: 'VP of Engineering',
    industry: 'Payments', companySize: '8,000 employees', country: 'United States',
    score: 94, emailVerified: true, status: 'discovered',
  },
  {
    name: 'Elena Rostova', firstName: 'Elena', lastName: 'Rostova',
    email: 'elena.rostova@datadoghq.com', company: 'Datadog', title: 'Head of Security',
    industry: 'Cloud Monitoring', companySize: '5,500 employees', country: 'United States',
    score: 91, emailVerified: true, status: 'contacted',
  },
  {
    name: 'Robert Garcia', firstName: 'Robert', lastName: 'Garcia',
    email: 'robert.garcia@brex.com', company: 'Brex', title: 'VP Growth & Demand Gen',
    industry: 'Corporate Spend', companySize: '1,100 employees', country: 'United States',
    score: 89, emailVerified: true, status: 'interested',
  },
  {
    name: 'Priya Sharma', firstName: 'Priya', lastName: 'Sharma',
    email: 'priya.sharma@notion.so', company: 'Notion', title: 'Director of Sales Ops',
    industry: 'Productivity SaaS', companySize: '800 employees', country: 'United States',
    score: 87, emailVerified: true, status: 'meeting_booked',
  },
];

const SAMPLE_SIGNALS = [
  { type: 'funding', content: 'Plaid raised $425M Series D and is actively scaling cloud security infrastructure.', sourceUrl: 'https://techcrunch.com/plaid-funding', sourceTitle: 'TechCrunch: Plaid Secures $425M', score: 98, relevance: 0.98, confidence: 0.99 },
  { type: 'hiring_spike', content: 'Engineering hiring surge detected (+34 job postings in 30 days across US & EU).', sourceUrl: 'https://stripe.com/jobs', sourceTitle: 'Stripe Careers Board', score: 94, relevance: 0.95, confidence: 0.93 },
  { type: 'tech_stack', content: 'Migrated infrastructure to Next.js 16 and upgraded SOC2 compliance policies.', sourceUrl: 'https://datadoghq.com', sourceTitle: 'BuiltWith Technology Crawl', score: 91, relevance: 0.89, confidence: 0.92 },
  { type: 'job_change', content: 'Appointed new VP of Demand Gen to accelerate enterprise outbound acquisition.', sourceUrl: 'https://linkedin.com/company/brex', sourceTitle: 'LinkedIn Executive Announcement', score: 89, relevance: 0.88, confidence: 0.90 },
  { type: 'funding', content: 'Notion raised $275M at $10B valuation to expand enterprise sales motion.', sourceUrl: 'https://techcrunch.com/notion-funding', sourceTitle: 'TechCrunch: Notion Series E', score: 87, relevance: 0.85, confidence: 0.91 },
];

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const orgId = context.organizationId;

    // Create or find active sample campaign
    let campaign = await db.campaign.findFirst({
      where: { organizationId: orgId, status: 'active' },
    });
    if (!campaign) {
      campaign = await db.campaign.create({
        data: {
          organizationId: orgId,
          name: 'FinTech CTO Expansion Campaign',
          status: 'active',
          dailyLimit: 50,
          fromEmail: 'alex@outreach.acmesaas.com',
          fromName: 'Alex Rivers',
          goal: 'Outreach',
        },
      });
    }

    const createdLeads: any[] = [];
    for (let i = 0; i < SAMPLE_PROSPECTS.length; i++) {
      const p = SAMPLE_PROSPECTS[i];
      const lead = await db.lead.create({
        data: {
          organizationId: orgId,
          name: p.name,
          firstName: p.firstName,
          lastName: p.lastName,
          email: `${p.email.split('@')[0]}.${Date.now()}@${p.email.split('@')[1]}`,
          company: p.company,
          title: p.title,
          industry: p.industry,
          companySize: p.companySize,
          country: p.country,
          score: p.score,
          emailVerified: p.emailVerified,
          status: p.status,
        },
      });
      createdLeads.push(lead);

      // Attach signal
      const sig = SAMPLE_SIGNALS[i];
      if (sig) {
        await db.signal.create({
          data: {
            organizationId: orgId,
            leadId: lead.id,
            type: sig.type,
            content: sig.content,
            sourceUrl: sig.sourceUrl,
            sourceTitle: sig.sourceTitle,
            score: sig.score,
            relevance: sig.relevance,
            confidence: sig.confidence,
          },
        });
      }

      // Create draft OutreachEmail record so review queue is immediately actionable
      const signalContent = sig?.content || 'recent company growth and hiring momentum';
      const draftSubject = `${p.firstName}, quick thought on ${p.company}'s scaling`;
      const draftBody = `Hi ${p.firstName},\n\nI noticed ${p.company} recently triggered an expansion signal: "${signalContent}".\n\nWe help engineering and sales leaders capitalize on this momentum with automated deliverability and AI pipeline orchestration.\n\nWould next Tuesday at 2:00 PM work for a brief 10-minute intro?`;

      await db.outreachEmail.create({
        data: {
          organizationId: orgId,
          leadId: lead.id,
          campaignId: campaign.id,
          subject: draftSubject,
          body: draftBody,
          status: 'QUEUED',
          generatedBy: 'AI',
        },
      });
    }

    // Log activity
    await db.activity.create({
      data: {
        organizationId: orgId,
        type: 'sample_data_seeded',
        phase: 'observe',
        description: `Seeded ${createdLeads.length} sample prospects, ${SAMPLE_SIGNALS.length} signals, and 1 campaign.`,
        metadata: JSON.stringify({ leadCount: createdLeads.length, signalCount: SAMPLE_SIGNALS.length }),
      },
    }).catch(() => {});

    return ok({
      message: `Successfully seeded ${createdLeads.length} prospects, ${SAMPLE_SIGNALS.length} buying signals, and 1 active campaign.`,
      leadsCreated: createdLeads.length,
      signalsCreated: SAMPLE_SIGNALS.length,
      campaignsCreated: 1,
    }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
