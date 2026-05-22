// ─── Seed Data ────────────────────────────────────────
// Run: bunx prisma db seed
// Or: bun prisma/seed.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── Clean existing data ──
  await prisma.doNotContact.deleteMany();
  await prisma.replyClassification.deleteMany();
  await prisma.followUp.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.pipelineRun.deleteMany();
  await prisma.outreachMessage.deleteMany();
  await prisma.signal.deleteMany();
  await prisma.scrapeData.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.lead.deleteMany();

  // ── DNC Entries ──
  await prisma.doNotContact.createMany({
    data: [
      { email: 'noreply@example.com', reason: 'bounced', source: 'bounce_notification' },
      { email: 'unsubscribe@test.com', reason: 'unsubscribed', source: 'reply_classifier' },
    ],
  });

  // ── Campaign ──
  const campaign = await prisma.campaign.create({
    data: {
      name: 'Q1 SaaS Outreach',
      status: 'running',
      goal: 'Book 20 demo calls with VP Engineering at SaaS companies',
      targetAudience: 'VP Engineering, CTO, Head of Engineering at B2B SaaS companies (50-500 employees)',
      offer: 'Free 14-day trial + personalized onboarding session',
      senderName: 'Alex Chen',
      senderEmail: 'alex@outreachai.com',
      tone: 'professional',
      cta: 'Book a 15-min discovery call',
      maxDailySends: 50,
      followUpSchedule: '[3,7,14]',
      productDescription: 'OutreachAI is an AI-powered sales engagement platform that automates personalized outreach, signal detection, and follow-up sequences to help B2B sales teams book more meetings.',
      dailySendsCount: 0,
      dailySendsDate: new Date().toISOString().split('T')[0],
    },
  });

  // ── Leads ──
  const leads = [
    { name: 'Sarah Chen', email: 'sarah.chen@techcorp.io', company: 'TechCorp', title: 'VP of Engineering', url: 'https://techcorp.io', source: 'linkedin_list' },
    { name: 'Marcus Johnson', email: 'marcus.j@growthco.com', company: 'GrowthCo', title: 'Head of Sales', url: 'https://growthco.com', source: 'csv_import' },
    { name: 'Aisha Patel', email: 'aisha@innovatelabs.dev', company: 'InnovateLabs', title: 'CTO', url: 'https://innovatelabs.dev', source: 'manual' },
    { name: 'David Kim', email: 'dkim@scaleventures.co', company: 'ScaleVentures', title: 'Director of Operations', url: 'https://scaleventures.co', source: 'csv_import' },
    { name: 'Elena Rodriguez', email: 'elena.r@dataflow.ai', company: 'DataFlow AI', title: 'Chief Revenue Officer', url: 'https://dataflow.ai', source: 'linkedin_list' },
    { name: 'James Wright', email: 'jwright@cloudstack.io', company: 'CloudStack', title: 'VP Engineering', url: 'https://cloudstack.io', source: 'manual' },
    { name: 'Priya Sharma', email: 'priya@neuralpath.dev', company: 'NeuralPath', title: 'Head of Product', url: 'https://neuralpath.dev', source: 'csv_import' },
    { name: 'Tom Anderson', email: 'tom.a@buildfast.co', company: 'BuildFast', title: 'Co-founder & CTO', url: 'https://buildfast.co', source: 'linkedin_list' },
  ];

  for (const l of leads) {
    const lead = await prisma.lead.create({
      data: { ...l, status: 'new', emailVerified: false, isBlacklisted: false, doNotContact: false },
    });

    // ── Signals per lead ──
    const signalSets: Record<string, Array<{ type: string; content: string; relevance: number; confidence: number; source: string }>> = {
      'sarah.chen@techcorp.io': [
        { type: 'hiring', content: 'TechCorp is hiring 5 senior engineers for their platform team', relevance: 0.85, confidence: 0.9, source: 'web_scraper' },
        { type: 'growth', content: 'TechCorp expanded to European market last quarter', relevance: 0.8, confidence: 0.85, source: 'web_scraper' },
        { type: 'tech_stack', content: 'TechCorp uses React, Node.js, and AWS', relevance: 0.7, confidence: 0.75, source: 'signal_extractor_llm' },
        { type: 'personalization_hook', content: 'Sarah spoke at ReactConf 2025 about scaling engineering teams', relevance: 0.9, confidence: 0.8, source: 'web_scraper' },
      ],
      'marcus.j@growthco.com': [
        { type: 'funding', content: 'GrowthCo raised Series B ($25M) in January 2026', relevance: 0.95, confidence: 0.95, source: 'web_scraper' },
        { type: 'hiring', content: 'GrowthCo is hiring 3 AE positions', relevance: 0.8, confidence: 0.9, source: 'web_scraper' },
        { type: 'pain_point', content: 'GrowthCo struggling with outbound response rates below 2%', relevance: 0.85, confidence: 0.7, source: 'signal_extractor_llm' },
      ],
      'aisha@innovatelabs.dev': [
        { type: 'growth', content: 'InnovateLabs tripled their customer base in 6 months', relevance: 0.85, confidence: 0.9, source: 'web_scraper' },
        { type: 'tech_stack', content: 'InnovateLabs uses Python, FastAPI, and GCP', relevance: 0.6, confidence: 0.7, source: 'signal_extractor_llm' },
        { type: 'personalization_hook', content: 'Aisha writes a popular newsletter on AI engineering', relevance: 0.9, confidence: 0.85, source: 'web_scraper' },
      ],
      'dkim@scaleventures.co': [
        { type: 'pain_point', content: 'ScaleVentures looking to improve operational efficiency across teams', relevance: 0.75, confidence: 0.65, source: 'signal_extractor_llm' },
        { type: 'hiring', content: 'ScaleVentures hiring for operations and strategy roles', relevance: 0.7, confidence: 0.8, source: 'web_scraper' },
      ],
      'elena.r@dataflow.ai': [
        { type: 'funding', content: 'DataFlow AI raised $40M Series C', relevance: 0.95, confidence: 0.95, source: 'web_scraper' },
        { type: 'growth', content: 'DataFlow AI expanding go-to-market team significantly', relevance: 0.85, confidence: 0.9, source: 'web_scraper' },
        { type: 'personalization_hook', content: 'Elena was previously VP Sales at Snowflake', relevance: 0.9, confidence: 0.85, source: 'web_scraper' },
      ],
    };

    const signals = signalSets[l.email] || [
      { type: 'trigger', content: `${l.title} at ${l.company} - potential outreach target`, relevance: 0.6, confidence: 0.5, source: 'lead_ingestion' },
    ];

    for (const sig of signals) {
      await prisma.signal.create({
        data: { ...sig, leadId: lead.id },
      });
    }

    // ── Activities ──
    await prisma.activity.createMany({
      data: [
        { type: 'lead_created', description: `Lead created from ${l.source}`, phase: 'system', leadId: lead.id },
        { type: 'enriched', description: `Signals extracted for ${l.name}`, phase: 'observe', leadId: lead.id, metadata: JSON.stringify({ signalCount: signals.length }) },
      ],
    });

    // ── Scrape Data for some leads ──
    await prisma.scrapeData.create({
      data: {
        url: l.url || '',
        pageTitle: `${l.company} - Home`,
        aboutText: `${l.company} is a technology company focused on delivering innovative solutions.`,
        careersText: `We're hiring! Join our growing team.`,
        status: 'completed',
        scrapedAt: new Date(),
        leadId: lead.id,
      },
    });
  }

  // ── Generate some messages for the first lead (approved state for demo) ──
  const firstLead = await prisma.lead.findFirst({ where: { email: 'sarah.chen@techcorp.io' } });
  if (firstLead) {
    await prisma.lead.update({ where: { id: firstLead.id }, data: { status: 'approved' } });

    const msg = await prisma.outreachMessage.create({
      data: {
        subject: 'Sarah, scaling your engineering team at TechCorp?',
        body: `Hi Sarah,\n\nI noticed TechCorp is hiring 5 senior engineers for the platform team — exciting growth!\n\nWith your recent European expansion and the React/Node stack, I imagine onboarding new engineers efficiently is top of mind. We've helped teams like yours reduce ramp-up time by 40%.\n\nWould you be open to a quick 15-minute chat this week to see if it's a fit?\n\nBest,\nAlex Chen\n\n---\nIf you'd prefer not to receive these emails, reply with "unsubscribe" and I'll remove you immediately.`,
        channel: 'email',
        status: 'approved',
        strategy: 'pain-point-driven',
        angle: 'Engineering team scaling & onboarding',
        tone: 'professional',
        cta: 'Book a 15-min discovery call',
        sequencePos: 0,
        leadId: firstLead.id,
        campaignId: campaign.id,
        unsubFooter: 'If you\'d prefer not to receive these emails, reply with "unsubscribe" and I\'ll remove you immediately.',
        approvedAt: new Date(),
      },
    });

    // Follow-ups for this message
    await prisma.followUp.createMany({
      data: [
        { messageId: msg.id, scheduledAt: new Date(Date.now() + 3 * 86400000), status: 'scheduled', type: 'reminder', sequencePos: 1, body: null },
        { messageId: msg.id, scheduledAt: new Date(Date.now() + 7 * 86400000), status: 'scheduled', type: 'value_add', sequencePos: 2, body: null },
        { messageId: msg.id, scheduledAt: new Date(Date.now() + 14 * 86400000), status: 'scheduled', type: 'last_attempt', sequencePos: 3, body: null },
      ],
    });

    await prisma.activity.createMany({
      data: [
        { type: 'email_generated', description: 'First email generated: "Sarah, scaling your engineering team at TechCorp?"', phase: 'think', leadId: firstLead.id },
        { type: 'email_approved', description: 'Email approved by user', phase: 'act', leadId: firstLead.id },
      ],
    });
  }

  // ── Second lead with a "sent" message ──
  const secondLead = await prisma.lead.findFirst({ where: { email: 'marcus.j@growthco.com' } });
  if (secondLead) {
    await prisma.lead.update({ where: { id: secondLead.id }, data: { status: 'sent', lastContacted: new Date() } });

    const msg = await prisma.outreachMessage.create({
      data: {
        subject: 'Marcus, congrats on the Series B!',
        body: `Hi Marcus,\n\nHuge congratulations on GrowthCo's $25M Series B — that's a massive milestone.\n\nWith the fundraise and hiring 3 AEs, I imagine building an efficient outbound engine is a priority. We help sales teams like GrowthCo increase response rates from 2% to 12%.\n\nWould a 15-minute call be worth your time this week?\n\nBest,\nAlex Chen\n\n---\nIf you'd prefer not to receive these emails, reply with "unsubscribe" and I'll remove you immediately.`,
        channel: 'email',
        status: 'sent',
        strategy: 'congratulatory',
        angle: 'Post-funding growth & outbound scaling',
        tone: 'professional',
        cta: 'Book a 15-min discovery call',
        sequencePos: 0,
        leadId: secondLead.id,
        campaignId: campaign.id,
        sentAt: new Date(),
        unsubFooter: 'If you\'d prefer not to receive these emails, reply with "unsubscribe" and I\'ll remove you immediately.',
      },
    });

    await prisma.activity.createMany({
      data: [
        { type: 'email_generated', description: 'Email generated for Marcus', phase: 'think', leadId: secondLead.id },
        { type: 'email_approved', description: 'Email approved', phase: 'act', leadId: secondLead.id },
        { type: 'email_sent', description: 'Email sent to marcus.j@growthco.com', phase: 'act', leadId: secondLead.id },
      ],
    });
  }

  console.log('✅ Seed complete!');
  console.log(`  - ${await prisma.lead.count()} leads`);
  console.log(`  - ${await prisma.signal.count()} signals`);
  console.log(`  - ${await prisma.campaign.count()} campaigns`);
  console.log(`  - ${await prisma.outreachMessage.count()} messages`);
  console.log(`  - ${await prisma.activity.count()} activities`);
  console.log(`  - ${await prisma.doNotContact.count()} DNC entries`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
