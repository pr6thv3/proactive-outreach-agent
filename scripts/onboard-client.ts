import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const db = new PrismaClient();

function getArg(flag: string, fallback: string = ''): string {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return fallback;
}

function hasArg(flag: string): boolean {
  return process.argv.includes(flag);
}

function printHelp() {
  console.log(`
Client Onboarding Operator Tool
================================
Usage: npx tsx scripts/onboard-client.ts [options]

Required Options:
  --orgName <name>              Organization name (e.g. "Acme Corp")
  --domain <domain>             Sending domain (e.g. "outreach.acme.com")
  --senderEmail <email>         Default sender email (e.g. "alex@outreach.acme.com")

Optional Options:
  --orgSlug <slug>              Organization slug (defaults to slugified orgName)
  --clerkOrgId <id>             Clerk Organization ID (e.g. "org_2xxx")
  --fromName <name>             Sender display name (defaults to "Alex")
  --productDescription <desc>   Product description for AI pitch generation
  --targetAudience <audience>   Target audience description
  --offer <offer>               Primary offer / value proposition
  --goal <goal>                 Campaign goal (defaults to "Book 20 demo calls")
  --tone <tone>                 Outreach tone: professional | friendly | casual (default: "professional")
  --cta <cta>                   Call to action (default: "Book a 15-min chat")
  --maxDailySends <number>      Max daily sends limit (default: 50)
  --help                        Show this help message

Example:
  npx tsx scripts/onboard-client.ts \\
    --orgName "Acme Dental" \\
    --domain "outreach.acmedental.com" \\
    --senderEmail "alex@outreach.acmedental.com" \\
    --fromName "Alex" \\
    --productDescription "AI Receptionist for Dental Clinics" \\
    --targetAudience "Dental Practice Managers" \\
    --offer "14-day free trial of automated front-desk scheduling"
`);
}

async function main() {
  if (hasArg('--help') || process.argv.length <= 2) {
    printHelp();
    process.exit(0);
  }

  const orgName = getArg('--orgName');
  const domainName = getArg('--domain');
  const senderEmail = getArg('--senderEmail');

  if (!orgName || !domainName || !senderEmail) {
    console.error('❌ Error: --orgName, --domain, and --senderEmail are required.\n');
    printHelp();
    process.exit(1);
  }

  const orgSlug = getArg('--orgSlug') || orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const clerkOrgId = getArg('--clerkOrgId') || `org_cli_${crypto.randomBytes(8).toString('hex')}`;
  const workspaceKey = `ws_${crypto.randomBytes(8).toString('hex')}`;
  const fromName = getArg('--fromName') || 'Alex';
  const productDescription = getArg('--productDescription') || 'AI Sales Representative service for high-growth B2B companies.';
  const targetAudience = getArg('--targetAudience') || 'VPs of Sales, Founders, and Business Owners';
  const offer = getArg('--offer') || 'Automated signal detection and personalized outbound outreach';
  const goal = getArg('--goal') || 'Book 20 demo calls';
  const tone = getArg('--tone') || 'professional';
  const cta = getArg('--cta') || 'Book a 15-min chat';
  const maxDailySends = parseInt(getArg('--maxDailySends', '50'), 10);

  console.log(`🚀 Starting onboarding for client: "${orgName}"...`);

  // 1. Create Organization
  const org = await db.organization.create({
    data: {
      name: orgName,
      slug: orgSlug,
      clerkOrgId,
      workspaceKey,
      plan: 'starter',
      subscriptionStatus: 'active',
    },
  });
  console.log(`  ✅ Organization created: ${org.name} (ID: ${org.id}, ClerkOrgID: ${org.clerkOrgId})`);

  // 2. Create SendingDomain
  const domain = await db.sendingDomain.create({
    data: {
      organizationId: org.id,
      domain: domainName.toLowerCase(),
      status: 'pending',
      provider: 'resend',
      fromName,
      fromEmail: senderEmail,
      spfStatus: 'pending',
      dkimStatus: 'pending',
      dmarcStatus: 'pending',
      dailyLimit: maxDailySends,
    },
  });
  console.log(`  ✅ Sending domain created: ${domain.domain} (ID: ${domain.id}, Status: ${domain.status})`);

  // 3. Create SenderAccount
  const sender = await db.senderAccount.create({
    data: {
      organizationId: org.id,
      domainId: domain.id,
      email: senderEmail.toLowerCase(),
      name: fromName,
      provider: 'resend',
      status: 'active',
      dailyLimit: maxDailySends,
    },
  });
  console.log(`  ✅ Sender account created: ${sender.email} (ID: ${sender.id}, Status: ${sender.status})`);

  // 4. Create Initial Campaign
  const campaign = await db.campaign.create({
    data: {
      organizationId: org.id,
      name: `${orgName} Launch Campaign`,
      status: 'draft',
      productDescription,
      targetAudience,
      offer,
      senderName: fromName,
      senderEmail,
      goal,
      tone,
      cta,
      maxDailySends,
    },
  });
  console.log(`  ✅ Campaign created: "${campaign.name}" (ID: ${campaign.id}, Status: ${campaign.status})`);

  // Link sender to campaign sender pool
  await db.campaignSenderPool.create({
    data: {
      organizationId: org.id,
      campaignId: campaign.id,
      senderId: sender.id,
      domainId: domain.id,
      enabled: true,
    },
  });
  console.log(`  ✅ Linked sender to campaign sender pool.`);

  console.log(`
🎉 Client Onboarding Complete!
================================
Organization ID: ${org.id}
Workspace Key:   ${org.workspaceKey}
Domain:          ${domain.domain}
Sender Email:    ${sender.email}
Campaign ID:     ${campaign.id}

Next Steps:
1. Provide DNS records (SPF/DKIM/DMARC) to ${orgName} for registrar configuration.
2. Poll Resend API until domain status transitions to "verified".
3. Import initial lead CSV or enable autonomous lead discovery.
`);
}

main()
  .catch((e) => {
    console.error('❌ Onboarding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
