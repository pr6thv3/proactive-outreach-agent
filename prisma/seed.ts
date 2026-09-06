import { PrismaClient, OrganizationRole, EnrichmentStatus, CampaignStatus, CampaignLeadStatus, OutreachEmailStatus, EmailGeneratedBy, DomainStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

function toDbArray(arr: string[]): any {
  // If Prisma model expects String (for SQLite), JSON stringify; otherwise return array
  return JSON.stringify(arr) as any;
}

async function main() {
  console.log('🌱 Seeding ProactiveReach database...');

  // 1. Clean existing records in reverse dependency order
  await prisma.auditLog.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.webhookEndpoint.deleteMany();
  await prisma.outreachEmail.deleteMany();
  await prisma.campaignLead.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.enrichmentQueue.deleteMany();
  await prisma.signal.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.sendingDomain.deleteMany();
  await prisma.icpCriteria.deleteMany();
  await prisma.userPreference.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  // 2. Create Organization
  const org = await prisma.organization.create({
    data: {
      name: 'Acme SaaS Corp',
      slug: 'acme-saas',
      plan: 'growth',
      subscriptionStatus: 'active',
    },
  });

  // 3. Create Users
  const passwordHash = await bcrypt.hash('password123', 10);

  const owner = await prisma.user.create({
    data: {
      name: 'Alice Owner',
      email: 'owner@acme.com',
      passwordHash,
      emailVerified: new Date(),
    },
  });

  const member = await prisma.user.create({
    data: {
      name: 'Bob Sales',
      email: 'bob@acme.com',
      passwordHash,
      emailVerified: new Date(),
    },
  });

  // 4. Create Organization Memberships
  await prisma.organizationMember.createMany({
    data: [
      { organizationId: org.id, userId: owner.id, role: OrganizationRole.OWNER },
      { organizationId: org.id, userId: member.id, role: OrganizationRole.MEMBER },
    ],
  });

  // 5. User Preferences
  await prisma.userPreference.createMany({
    data: [
      {
        userId: owner.id,
        activeOrgId: org.id,
        onboardingStep: 4,
        onboardingComplete: true,
        autonomyEnabled: true,
        autonomyPaused: false,
        minLeadScore: 65.0,
        dailySendLimit: 100,
      },
      {
        userId: member.id,
        activeOrgId: org.id,
        onboardingStep: 4,
        onboardingComplete: true,
        autonomyEnabled: true,
        autonomyPaused: false,
        minLeadScore: 70.0,
        dailySendLimit: 50,
      },
    ],
  });

  // 6. ICP Criteria
  await prisma.icpCriteria.create({
    data: {
      organizationId: org.id,
      industries: toDbArray(['B2B SaaS', 'Fintech', 'Developer Tools']),
      companySizeMin: 20,
      companySizeMax: 500,
      revenueMin: 2000000,
      revenueMax: 50000000,
      techStack: toDbArray(['React', 'Node.js', 'PostgreSQL', 'AWS']),
      excludeTechStack: toDbArray(['Legacy PHP']),
      requiredSignals: toDbArray(['funding_round', 'hiring']),
      minSignalScore: 50.0,
      valueProp: 'Accelerate outbound sales pipeline with autonomous AI agents that personalize cold emails using real-time market signals.',
      painPoints: toDbArray(['Low response rates below 2%', 'Manual lead research takes 30 mins per prospect', 'Domain deliverability issues']),
    },
  });

  // 7. Sending Domain
  await prisma.sendingDomain.create({
    data: {
      organizationId: org.id,
      domain: 'outreach.acmesaas.com',
      dkimVerified: true,
      spfVerified: true,
      dmarcVerified: true,
      warmupStartedAt: new Date(Date.now() - 14 * 86400000),
      dailyLimit: 100,
      currentWarmupDay: 14,
      status: DomainStatus.ACTIVE,
    },
  });

  // 8. API Key
  const rawKey = 'pr_live_' + crypto.randomBytes(16).toString('hex');
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  await prisma.apiKey.create({
    data: {
      organizationId: org.id,
      name: 'Default Production API Key',
      keyHash,
      scopes: toDbArray(['read', 'write', 'admin']),
    },
  });

  // 9. Leads & Signals & Enrichment Queues
  const leadDataList = [
    { firstName: 'Sarah', lastName: 'Chen', email: 'sarah.chen@techcorp.io', company: 'TechCorp', title: 'VP of Engineering', linkedinUrl: 'https://linkedin.com/in/sarahchen', website: 'https://techcorp.io', score: 88.0 },
    { firstName: 'Marcus', lastName: 'Johnson', email: 'marcus.j@growthco.com', company: 'GrowthCo', title: 'Head of Sales', linkedinUrl: 'https://linkedin.com/in/marcusj', website: 'https://growthco.com', score: 92.0 },
    { firstName: 'Aisha', lastName: 'Patel', email: 'aisha@innovatelabs.dev', company: 'InnovateLabs', title: 'CTO', linkedinUrl: 'https://linkedin.com/in/aishapatel', website: 'https://innovatelabs.dev', score: 78.0 },
    { firstName: 'David', lastName: 'Kim', email: 'dkim@scaleventures.co', company: 'ScaleVentures', title: 'Director of Ops', linkedinUrl: 'https://linkedin.com/in/davidkim', website: 'https://scaleventures.co', score: 64.0 },
    { firstName: 'Elena', lastName: 'Rodriguez', email: 'elena.r@dataflow.ai', company: 'DataFlow AI', title: 'CRO', linkedinUrl: 'https://linkedin.com/in/elenarodriguez', website: 'https://dataflow.ai', score: 95.0 },
    { firstName: 'James', lastName: 'Wright', email: 'jwright@cloudstack.io', company: 'CloudStack', title: 'VP Engineering', linkedinUrl: 'https://linkedin.com/in/jameswright', website: 'https://cloudstack.io', score: 71.0 },
    { firstName: 'Priya', lastName: 'Sharma', email: 'priya@neuralpath.dev', company: 'NeuralPath', title: 'Head of Product', linkedinUrl: 'https://linkedin.com/in/priyasharma', website: 'https://neuralpath.dev', score: 81.0 },
    { firstName: 'Tom', lastName: 'Anderson', email: 'tom.a@buildfast.co', company: 'BuildFast', title: 'Co-founder & CTO', linkedinUrl: 'https://linkedin.com/in/tomanderson', website: 'https://buildfast.co', score: 69.0 },
    { firstName: 'Rachel', lastName: 'Foster', email: 'rachel@fintechflow.com', company: 'FintechFlow', title: 'VP Product', linkedinUrl: 'https://linkedin.com/in/rachelfoster', website: 'https://fintechflow.com', score: 75.0 },
    { firstName: 'Michael', lastName: 'Chang', email: 'mchang@devopsnexus.io', company: 'DevOps Nexus', title: 'Head of Engineering', linkedinUrl: 'https://linkedin.com/in/michaelchang', website: 'https://devopsnexus.io', score: 85.0 },
  ];

  const createdLeads: any[] = [];
  for (const item of leadDataList) {
    const lead = await prisma.lead.create({
      data: {
        organizationId: org.id,
        firstName: item.firstName,
        lastName: item.lastName,
        name: `${item.firstName} ${item.lastName}`,
        email: item.email,
        company: item.company,
        title: item.title,
        linkedinUrl: item.linkedinUrl,
        website: item.website,
        score: item.score,
        status: item.score >= 80 ? 'scored' : 'new',
        emailVerified: true,
        enrichedData: {
          employeeCount: 120,
          fundingTotal: '$15M',
          techStack: ['React', 'Node.js', 'Postgres'],
        },
      },
    });
    createdLeads.push(lead);

    // Create Signal
    await prisma.signal.create({
      data: {
        organizationId: org.id,
        leadId: lead.id,
        type: item.score > 80 ? 'funding_round' : 'job_posting',
        content: `${item.company} raised Series B funding and is expanding their engineering team.`,
        source: 'news_crawler',
        score: item.score,
        relevance: 0.85,
        confidence: 0.9,
        urgency: 0.8,
        reasoning: 'High urgency expansion signal',
        recommendedPitchAngle: 'Engineering team onboarding & automation',
        recommendedOffer: 'Free 14-day workflow trial',
      },
    });

    // Create EnrichmentQueue entry
    await prisma.enrichmentQueue.create({
      data: {
        organizationId: org.id,
        leadId: lead.id,
        email: lead.email,
        status: EnrichmentStatus.MX_VERIFIED,
        mxValid: true,
        provider: 'dns_mx',
      },
    });
  }

  // 10. Campaigns & Enrollments
  const campaign = await prisma.campaign.create({
    data: {
      organizationId: org.id,
      name: 'Q3 SaaS Leaders Outreach',
      status: CampaignStatus.ACTIVE,
      fromEmail: 'alex@outreach.acmesaas.com',
      fromName: 'Alex from Acme SaaS',
      dailyLimit: 50,
      startedAt: new Date(),
      sequenceSteps: JSON.stringify([
        { step: 1, delayDays: 0, type: 'initial', template: 'Pain-point initial outreach' },
        { step: 2, delayDays: 3, type: 'followup_1', template: 'Bump email' },
        { step: 3, delayDays: 7, type: 'followup_2', template: 'Value-add case study' },
      ]),
    },
  });

  for (const lead of createdLeads.slice(0, 5)) {
    await prisma.campaignLead.create({
      data: {
        organizationId: org.id,
        leadId: lead.id,
        campaignId: campaign.id,
        currentStep: 1,
        status: CampaignLeadStatus.ACTIVE,
      },
    });

    // Outreach Email
    await prisma.outreachEmail.create({
      data: {
        organizationId: org.id,
        leadId: lead.id,
        campaignId: campaign.id,
        subject: `${lead.firstName}, scaling your engineering team at ${lead.company}?`,
        body: `Hi ${lead.firstName},\n\nI noticed ${lead.company} recently expanded its team.\n\nWe help VP Engineering teams automate personalized outreach.\n\nWould you be open to a 15-minute chat?`,
        status: OutreachEmailStatus.QUEUED,
        generatedBy: EmailGeneratedBy.AI,
      },
    });
  }

  // 11. Audit Log
  await prisma.auditLog.create({
    data: {
      organizationId: org.id,
      userId: owner.id,
      action: 'CAMPAIGN_STARTED',
      entityType: 'Campaign',
      entityId: campaign.id,
      metadata: { campaignName: campaign.name },
      ipAddress: '127.0.0.1',
      userAgent: 'Seed Script',
    },
  });

  console.log('✅ Seeding complete!');
  console.log(`  - 1 Organization (${org.name})`);
  console.log(`  - 2 Users (${owner.email}, ${member.email})`);
  console.log(`  - ${createdLeads.length} Leads & Signals & EnrichmentQueue entries`);
  console.log(`  - 1 Active Campaign with ${createdLeads.slice(0, 5).length} enrolled leads`);
  console.log(`  - Raw API Key: ${rawKey}`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
