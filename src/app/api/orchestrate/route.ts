import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiAuthError, hasRole, requireWorkspace, UserContext, WorkspaceRole } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';
import { validateEmail, isOnDncList } from '@/lib/safety';
import { enqueueJob } from '@/lib/queue/producers';
import { importCsvAction, ImportCsvSchema } from '@/app/api/orchestrate/actions/import-csv';
import { runPipelineAction, RunPipelineSchema } from '@/app/api/orchestrate/actions/run-pipeline';
import { approveMessageAction, ApproveMessageSchema } from '@/app/api/orchestrate/actions/approve-message';
import { sendMessageAction, SendMessageSchema } from '@/app/api/orchestrate/actions/send-message';
import { classifyReplyAction, ClassifyReplySchema } from '@/app/api/orchestrate/actions/classify-reply';
import { startAutonomousCycleAction, StartAutonomousCycleSchema } from '@/app/api/orchestrate/actions/start-autonomous-cycle';

const AddLeadSchema = z.object({
  action: z.literal('add_lead'),
  name: z.string().min(1),
  email: z.string().email(),
  company: z.string().optional(),
  title: z.string().optional(),
  url: z.string().optional(),
  linkedinUrl: z.string().optional(),
  autonomyEnabled: z.boolean().optional(),
});

const AddSampleDataSchema = z.object({
  action: z.literal('add_sample_data'),
});

const RunObserveSchema = z.object({
  action: z.enum(['run_observe', 'run_signal_intelligence']),
  leadId: z.string().min(1),
  urls: z.array(z.string()).optional(),
});

const RunThinkSchema = z.object({
  action: z.enum(['run_think', 'generate_email']),
  leadId: z.string().min(1),
  campaignId: z.string().optional(),
  objective: z.string().optional(),
});

const BatchGenerateSchema = z.object({
  action: z.literal('batch_generate'),
  leadIds: z.array(z.string().min(1)).min(1),
  campaignId: z.string().optional(),
});

const EnableAutonomySchema = z.object({
  action: z.literal('enable_autonomy'),
  leadId: z.string().optional(),
  campaignId: z.string().optional(),
}).refine(input => input.leadId || input.campaignId, {
  message: 'leadId or campaignId is required',
});

const ActionSchema = z.union([
  AddLeadSchema,
  AddSampleDataSchema,
  ImportCsvSchema,
  RunObserveSchema,
  RunThinkSchema,
  RunPipelineSchema,
  BatchGenerateSchema,
  ApproveMessageSchema,
  SendMessageSchema,
  ClassifyReplySchema,
  StartAutonomousCycleSchema,
  EnableAutonomySchema,
]);

type OrchestrateAction = z.infer<typeof ActionSchema>;

const ACTION_ROLES: Record<OrchestrateAction['action'], WorkspaceRole> = {
  add_lead: 'member',
  add_sample_data: 'member',
  import_csv: 'member',
  run_observe: 'member',
  run_signal_intelligence: 'member',
  run_think: 'member',
  generate_email: 'member',
  run_full_pipeline: 'member',
  run_pipeline: 'member',
  batch_generate: 'member',
  approve_message: 'member',
  send_message: 'member',
  classify_reply: 'member',
  run_reeval: 'member',
  start_autonomous_cycle: 'admin',
  run_autonomous_cycle: 'admin',
  enable_autonomy: 'admin',
};

export async function POST(request: NextRequest) {
  let traceId = createTraceId();
  try {
    const context = await requireWorkspace();
    const raw = await request.json();
    if (typeof raw?.traceId === 'string' && raw.traceId.trim()) {
      traceId = raw.traceId.trim();
    }
    const parsed = ActionSchema.safeParse(raw);

    if (!parsed.success) {
      return fail('Invalid request payload', 400, 'validation_error', traceId);
    }

    ensureRole(context, ACTION_ROLES[parsed.data.action]);
    const result = await handleAction(parsed.data, context, traceId);
    return ok(result, traceId, isQueuedResult(result) ? 202 : 200);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

export async function GET() {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace();
    const runs = await db.pipelineRun.findMany({
      where: { organizationId: context.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return ok(runs, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

async function handleAction(action: OrchestrateAction, context: UserContext, traceId: string) {
  switch (action.action) {
    case 'add_lead':
      return addLeadAction(action, context);
    case 'add_sample_data':
      return addSampleDataAction(context);
    case 'import_csv':
      return importCsvAction(action, context);
    case 'run_observe':
    case 'run_signal_intelligence':
      return runObserveAction(action, context, traceId);
    case 'run_think':
    case 'generate_email':
      return runThinkAction(action, context, traceId);
    case 'run_full_pipeline':
    case 'run_pipeline':
      return runPipelineAction(action, context, traceId);
    case 'batch_generate':
      return batchGenerateAction(action, context, traceId);
    case 'approve_message':
      return approveMessageAction(action, context);
    case 'send_message':
      return sendMessageAction(action, context, traceId);
    case 'classify_reply':
    case 'run_reeval':
      return classifyReplyAction(action, context, traceId);
    case 'start_autonomous_cycle':
    case 'run_autonomous_cycle':
      return startAutonomousCycleAction(action, context, traceId);
    case 'enable_autonomy':
      return enableAutonomyAction(action, context);
  }
}

async function addLeadAction(input: z.infer<typeof AddLeadSchema>, context: UserContext) {
  const email = input.email.trim().toLowerCase();
  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) {
    throw new Error(`Invalid email: ${emailCheck.reason}`);
  }

  if (await isOnDncList(email, context.organizationId)) {
    throw new ApiAuthError('Email is on Do-Not-Contact list', 403);
  }

  const existing = await db.lead.findFirst({
    where: { organizationId: context.organizationId, email },
  });
  if (existing) {
    return { created: false, lead: existing };
  }

  const lead = await db.lead.create({
    data: {
      organizationId: context.organizationId,
      name: input.name.trim(),
      email,
      company: input.company,
      title: input.title,
      url: input.url,
      linkedinUrl: input.linkedinUrl,
      source: 'manual',
      status: 'new',
      autonomyEnabled: input.autonomyEnabled === true,
    },
  });

  await db.activity.create({
    data: {
      organizationId: context.organizationId,
      type: 'lead_created',
      description: `Lead created: ${lead.name}`,
      phase: 'system',
      leadId: lead.id,
    },
  });

  return { created: true, lead };
}

async function runObserveAction(input: z.infer<typeof RunObserveSchema>, context: UserContext, traceId: string) {
  const lead = await db.lead.findFirst({
    where: { id: input.leadId, organizationId: context.organizationId },
  });
  if (!lead) throw new Error('Lead not found');

  const scrapeJob = await enqueueJob('scrape', {
    organizationId: context.organizationId,
    userId: context.userId,
    leadId: input.leadId,
    urls: input.urls,
    traceId,
  });

  const signalJob = await enqueueJob('signal-intelligence', {
    organizationId: context.organizationId,
    userId: context.userId,
    leadId: input.leadId,
    traceId,
  });

  return { jobs: [scrapeJob, signalJob] };
}

async function runThinkAction(input: z.infer<typeof RunThinkSchema>, context: UserContext, traceId: string) {
  const lead = await db.lead.findFirst({
    where: { id: input.leadId, organizationId: context.organizationId },
  });
  if (!lead) throw new Error('Lead not found');

  if (input.campaignId) {
    const campaign = await db.campaign.findFirst({
      where: { id: input.campaignId, organizationId: context.organizationId },
    });
    if (!campaign) throw new Error('Campaign not found');
  }

  return enqueueJob('draft-email', {
    organizationId: context.organizationId,
    userId: context.userId,
    leadId: input.leadId,
    campaignId: input.campaignId,
    objective: input.objective,
    traceId,
  });
}

async function batchGenerateAction(input: z.infer<typeof BatchGenerateSchema>, context: UserContext, traceId: string) {
  if (input.campaignId) {
    const campaign = await db.campaign.findFirst({
      where: { id: input.campaignId, organizationId: context.organizationId },
    });
    if (!campaign) throw new Error('Campaign not found');
  }

  const leads = await db.lead.findMany({
    where: { id: { in: input.leadIds }, organizationId: context.organizationId },
    select: { id: true },
  });

  if (leads.length !== input.leadIds.length) {
    throw new Error('One or more leads were not found');
  }

  const jobs = await Promise.all(leads.map(lead => enqueueJob('draft-email', {
    organizationId: context.organizationId,
    userId: context.userId,
    leadId: lead.id,
    campaignId: input.campaignId,
    traceId,
  })));

  return { jobs };
}

async function enableAutonomyAction(input: z.infer<typeof EnableAutonomySchema>, context: UserContext) {
  if (input.campaignId) {
    const campaign = await db.campaign.updateMany({
      where: { id: input.campaignId, organizationId: context.organizationId },
      data: { autonomyEnabled: true },
    });
    if (campaign.count === 0) throw new Error('Campaign not found');

    const leadIds = await db.outreachMessage.findMany({
      where: { organizationId: context.organizationId, campaignId: input.campaignId },
      select: { leadId: true },
      distinct: ['leadId'],
    });

    await db.lead.updateMany({
      where: { organizationId: context.organizationId, id: { in: leadIds.map(row => row.leadId) } },
      data: { autonomyEnabled: true, nextActionAt: new Date() },
    });

    return { enabled: leadIds.length, type: 'campaign' };
  }

  const updated = await db.lead.updateMany({
    where: { id: input.leadId, organizationId: context.organizationId },
    data: { autonomyEnabled: true, nextActionAt: new Date() },
  });
  if (updated.count === 0) throw new Error('Lead not found');
  return { enabled: 1, type: 'lead' };
}

async function addSampleDataAction(context: UserContext) {
  const leads = [
    { name: 'Sarah Chen', email: 'sarah.chen@techcorp.io', company: 'TechCorp', title: 'VP of Engineering', url: 'https://techcorp.io', source: 'sample_data' },
    { name: 'Marcus Johnson', email: 'marcus.j@growthco.com', company: 'GrowthCo', title: 'Head of Sales', url: 'https://growthco.com', source: 'sample_data' },
    { name: 'Aisha Patel', email: 'aisha@innovatelabs.dev', company: 'InnovateLabs', title: 'CTO', url: 'https://innovatelabs.dev', source: 'sample_data' },
  ];

  let created = 0;
  for (const item of leads) {
    const existing = await db.lead.findFirst({
      where: { organizationId: context.organizationId, email: item.email },
    });
    if (existing) continue;

    const lead = await db.lead.create({
      data: { ...item, organizationId: context.organizationId, status: 'new', autonomyEnabled: true },
    });
    await db.signal.create({
      data: {
        organizationId: context.organizationId,
        leadId: lead.id,
        type: 'trigger',
        content: `${lead.title || 'Leader'} at ${lead.company || 'company'} is a relevant outbound prospect`,
        source: 'sample_data',
        relevance: 0.7,
        confidence: 0.7,
        urgency: 0.5,
        reasoning: 'Sample lead for local evaluation',
        recommendedPitchAngle: 'Operational scaling conversation',
        recommendedOffer: 'Free workflow audit',
      },
    });
    await db.activity.create({
      data: {
        organizationId: context.organizationId,
        leadId: lead.id,
        type: 'lead_created',
        description: `Sample lead created: ${lead.name}`,
        phase: 'system',
      },
    });
    created++;
  }

  const existingCampaign = await db.campaign.findFirst({
    where: { organizationId: context.organizationId, name: 'Sample SaaS Outreach' },
  });
  if (!existingCampaign) {
    await db.campaign.create({
      data: {
        organizationId: context.organizationId,
        name: 'Sample SaaS Outreach',
        status: 'draft',
        goal: 'Book qualified discovery calls',
        targetAudience: 'B2B SaaS leaders',
        offer: 'Free workflow audit',
        senderName: 'Alex',
        senderEmail: 'alex@example.com',
        tone: 'professional',
        cta: 'Book a 15-minute call',
        productDescription: 'AI-assisted outbound operating system',
      },
    });
  }

  return { created };
}

function ensureRole(context: UserContext, required: WorkspaceRole) {
  if (!hasRole(context.role, required)) {
    throw new ApiAuthError('Forbidden', 403);
  }
}

function isQueuedResult(result: unknown) {
  if (!result || typeof result !== 'object') return false;
  if ('backend' in result && 'jobId' in result) return true;
  if ('jobs' in result) return true;
  if ('job' in result && (result as { job?: unknown }).job) return true;
  return false;
}
