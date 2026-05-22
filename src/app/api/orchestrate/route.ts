// ─── API: Orchestrate ─────────────────────────────────
// Production orchestration endpoints with Signal Intelligence, Scoring, Memory, Autonomy

import { NextRequest, NextResponse } from 'next/server';
import { orchestrator } from '@/lib/orchestrator';
import { db } from '@/lib/db';
import { validateEmail, isOnDncList, parseCsv } from '@/lib/safety';
import { AutonomousWorkflowEngine } from '@/lib/agents/infrastructure/autonomous-engine';
import { AgentMemoryService } from '@/lib/agents/infrastructure/agent-memory';
import { JobQueue } from '@/lib/agents/infrastructure/job-queue';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'run_observe': {
        const { leadId } = body;
        if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });
        const result = await orchestrator.runObserve(leadId, body.urls);
        return NextResponse.json({ success: true, data: result });
      }

      case 'run_think': {
        const { leadId, campaignId, objective } = body;
        if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });
        const result = await orchestrator.runThink(leadId, campaignId, objective);
        return NextResponse.json({ success: true, data: result });
      }

      case 'run_full_pipeline': {
        const { leadId, campaignId, objective } = body;
        if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });
        const result = await orchestrator.runFullPipeline(leadId, { campaignId, objective });
        return NextResponse.json({ success: true, data: result });
      }

      case 'batch_generate': {
        const { leadIds, campaignId } = body;
        if (!leadIds?.length) return NextResponse.json({ error: 'leadIds required' }, { status: 400 });
        const results = await orchestrator.batchGenerate(leadIds, campaignId);
        return NextResponse.json({ success: true, data: results });
      }

      case 'approve_message': {
        const { messageId, editedSubject, editedBody } = body;
        if (!messageId) return NextResponse.json({ error: 'messageId required' }, { status: 400 });
        const result = await orchestrator.approveMessage(messageId, editedSubject, editedBody);
        return NextResponse.json(result);
      }

      case 'send_message': {
        const { messageId, dryRun } = body;
        if (!messageId) return NextResponse.json({ error: 'messageId required' }, { status: 400 });
        const result = await orchestrator.sendMessage(messageId, dryRun === true); // Only dry run if explicitly true
        return NextResponse.json({ success: result.success, data: result });
      }

      case 'run_reeval': {
        const { leadId, messageId, replyText } = body;
        if (!leadId || !messageId || !replyText) return NextResponse.json({ error: 'leadId, messageId, replyText required' }, { status: 400 });
        const result = await orchestrator.runReEval(leadId, messageId, replyText);
        return NextResponse.json({ success: true, data: result });
      }

      case 'add_lead': {
        const { name, email, company, title, url, linkedinUrl, autonomyEnabled } = body;
        if (!name || !email) return NextResponse.json({ error: 'name and email required' }, { status: 400 });
        const emailCheck = validateEmail(email);
        if (!emailCheck.valid) return NextResponse.json({ error: `Invalid email: ${emailCheck.reason}` }, { status: 400 });
        const onDnc = await isOnDncList(email);
        if (onDnc) return NextResponse.json({ error: 'Email is on Do-Not-Contact list' }, { status: 403 });
        const existing = await db.lead.findUnique({ where: { email: email.trim().toLowerCase() } });
        if (existing) return NextResponse.json({ error: 'Lead with this email already exists', data: existing }, { status: 409 });
        const lead = await db.lead.create({
          data: {
            name: name.trim(), email: email.trim().toLowerCase(), company, title, url, linkedinUrl,
            source: 'manual', status: 'new', emailVerified: false, isBlacklisted: false, doNotContact: false,
            autonomyEnabled: autonomyEnabled || false,
          },
        });
        await db.activity.create({ data: { type: 'lead_created', description: `Lead created: ${name}`, phase: 'system', leadId: lead.id } });
        return NextResponse.json({ success: true, data: lead });
      }

      case 'import_csv': {
        const { csvText, source } = body;
        if (!csvText) return NextResponse.json({ error: 'csvText required' }, { status: 400 });
        const result = await orchestrator.importCsv(csvText, source || 'csv_import');
        return NextResponse.json({ success: true, data: result });
      }

      // ─── NEW: Signal Intelligence ──────────────────
      case 'run_signal_intelligence': {
        const { leadId } = body;
        if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });
        // Run observe which includes signal intelligence
        const result = await orchestrator.runObserve(leadId, body.urls);
        return NextResponse.json({ success: true, data: result });
      }

      // ─── NEW: Score Lead ───────────────────────────
      case 'score_lead': {
        const { leadId, forceRescore } = body;
        if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });
        const { ScoringEngine } = await import('@/lib/agents/think/scoring-engine');
        const engine = new ScoringEngine();
        const context = await (orchestrator as unknown as { buildContext: (id: string) => Promise<unknown> }).buildContext?.(leadId);
        if (!context) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        const result = await engine.run({ forceRescore }, context as Parameters<typeof engine.run>[1]);
        return NextResponse.json({ success: true, data: result });
      }

      // ─── NEW: Enable Autonomy for Lead ─────────────
      case 'enable_autonomy': {
        const { leadId, campaignId } = body;
        if (!leadId && !campaignId) return NextResponse.json({ error: 'leadId or campaignId required' }, { status: 400 });

        if (campaignId) {
          const count = await AutonomousWorkflowEngine.enableForCampaign(campaignId);
          return NextResponse.json({ success: true, data: { enabled: count, type: 'campaign' } });
        }

        await AutonomousWorkflowEngine.enableForLead(leadId);
        return NextResponse.json({ success: true, data: { enabled: 1, type: 'lead' } });
      }

      // ─── NEW: Run Autonomous Cycle ─────────────────
      case 'run_autonomous_cycle': {
        const result = await orchestrator.runAutonomousCycle();
        return NextResponse.json({ success: true, data: result });
      }

      // ─── NEW: Get Memory Recommendations ───────────
      case 'get_memory_recommendations': {
        const { industry, persona, channel } = body;
        const recommendations = await orchestrator.getMemoryRecommendations({ industry, persona, channel });
        return NextResponse.json({ success: true, data: recommendations });
      }

      // ─── NEW: Get Queue Stats ──────────────────────
      case 'get_queue_stats': {
        const stats = await orchestrator.getQueueStats();
        return NextResponse.json({ success: true, data: stats });
      }

      // ─── NEW: Process Queue Jobs ───────────────────
      case 'process_queue': {
        const { limit = 5 } = body;
        const jobs = await JobQueue.dequeue(limit);
        const results: Array<{ jobId: string; type: string; success: boolean; error?: string }> = [];

        for (const job of jobs) {
          try {
            // Process each job based on type
            let result;
            switch (job.type) {
              case 'scrape':
                result = await orchestrator.runObserve(job.payload.leadId!, job.payload.urls as string[]);
                break;
              case 'signal_intelligence':
              case 'signal_extract':
                result = await orchestrator.runObserve(job.payload.leadId!);
                break;
              case 'score':
                // Score is handled within runObserve now
                result = await orchestrator.runObserve(job.payload.leadId!);
                break;
              case 'generate_email':
                result = await orchestrator.runThink(job.payload.leadId!, job.payload.campaignId as string);
                break;
              case 'send_email':
                result = await orchestrator.sendMessage(job.payload.messageId as string, job.payload.dryRun as boolean);
                break;
              default:
                result = { success: false, error: `Unknown job type: ${job.type}` };
            }

            await JobQueue.complete(job.id, {
              success: result?.success ?? false,
              data: result?.data ? JSON.parse(JSON.stringify(result.data, null, 2)) : undefined,
            });
            results.push({ jobId: job.id, type: job.type, success: true });
          } catch (error) {
            await JobQueue.fail(job.id, error instanceof Error ? error.message : String(error));
            results.push({ jobId: job.id, type: job.type, success: false, error: error instanceof Error ? error.message : String(error) });
          }
        }

        return NextResponse.json({ success: true, data: { processed: results } });
      }

      case 'add_sample_data': {
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
        let created = 0;
        for (const l of leads) {
          const existing = await db.lead.findFirst({ where: { email: l.email } });
          if (!existing) {
            const lead = await db.lead.create({ data: { ...l, status: 'new', emailVerified: false, isBlacklisted: false, doNotContact: false } });
            // Create signals with intelligence data
            await db.signal.create({
              data: {
                type: 'trigger', content: `${l.title} at ${l.company} — potential outreach target`,
                source: 'lead_ingestion', relevance: 0.6, confidence: 0.7, leadId: lead.id,
                urgency: 0.5, reasoning: `New lead from ${l.source}`,
                recommendedPitchAngle: `Relevant solutions for ${l.company}`,
                recommendedOffer: 'Free consultation',
                decayRate: 0.02,
                detectedAt: new Date(),
                expiresAt: new Date(Date.now() + 45 * 86400000),
              },
            });
            await db.activity.create({ data: { type: 'lead_created', description: `Lead created from ${l.source}`, phase: 'system', leadId: lead.id } });
            created++;
          }
        }
        // Ensure a sample campaign exists
        const existingCampaign = await db.campaign.findFirst();
        if (!existingCampaign) {
          await db.campaign.create({
            data: {
              name: 'Q1 SaaS Outreach', status: 'running',
              goal: 'Book 20 demo calls with VP Engineering at SaaS companies',
              targetAudience: 'VP Engineering, CTO at B2B SaaS (50-500 employees)',
              offer: 'Free 14-day trial + personalized onboarding',
              senderName: 'Alex Chen', senderEmail: 'alex@outreachai.com',
              tone: 'professional', cta: 'Book a 15-min discovery call',
              maxDailySends: 50, followUpSchedule: '[3,7,14]',
              productDescription: 'OutreachAI automates personalized outreach, signal detection, and follow-ups for B2B sales teams.',
              dailySendsCount: 0, dailySendsDate: new Date().toISOString().split('T')[0],
              channels: '["email","linkedin"]', linkedinEnabled: true,
            },
          });
        }
        // Add sample memory data
        await seedSampleMemory();
        return NextResponse.json({ success: true, data: { created, message: `${created} sample leads added` } });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const runs = await db.pipelineRun.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    return NextResponse.json({ success: true, data: runs });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Server error' }, { status: 500 });
  }
}

async function seedSampleMemory() {
  const existing = await db.agentMemory.count();
  if (existing > 0) return; // Only seed once

  const sampleMemories = [
    { category: 'winning_hook', key: 'hook_funding_round_saas', value: JSON.stringify({ hook: 'Congratulations on the funding! Here is how to scale faster.', replyRate: 0.32 }), score: 0.8, industry: 'SaaS', persona: 'VP Engineering', channel: 'email' },
    { category: 'winning_hook', key: 'hook_hiring_spike_saas', value: JSON.stringify({ hook: 'Saw you are hiring — let us help your new team hit the ground running.', replyRate: 0.28 }), score: 0.7, industry: 'SaaS', persona: 'CTO', channel: 'linkedin' },
    { category: 'channel_effectiveness', key: 'channel_email_saas_vp', value: JSON.stringify({ channel: 'email', effectiveness: 0.22 }), score: 0.65, industry: 'SaaS', persona: 'VP Engineering', channel: 'email' },
    { category: 'channel_effectiveness', key: 'channel_linkedin_saas_cto', value: JSON.stringify({ channel: 'linkedin', effectiveness: 0.35 }), score: 0.75, industry: 'SaaS', persona: 'CTO', channel: 'linkedin' },
    { category: 'signal_correlation', key: 'signal_funding_round_saas', value: JSON.stringify({ signalType: 'funding_round', conversionRate: 0.12 }), score: 0.8, industry: 'SaaS', channel: 'email' },
    { category: 'signal_correlation', key: 'signal_hiring_spike_saas', value: JSON.stringify({ signalType: 'hiring_spike', conversionRate: 0.08 }), score: 0.6, industry: 'SaaS', channel: 'linkedin' },
    { category: 'persona_pattern', key: 'pattern_vp_eng_professional', value: JSON.stringify({ strategy: 'value-first', bestTone: 'professional', bestCta: 'Book a 15-min chat' }), score: 0.7, persona: 'VP Engineering', channel: 'email' },
    { category: 'offer_performance', key: 'offer_free_trial_saas', value: JSON.stringify({ offer: 'Free 14-day trial + personalized onboarding', conversionRate: 0.09 }), score: 0.65, industry: 'SaaS', channel: 'email' },
  ];

  for (const m of sampleMemories) {
    await db.agentMemory.create({
      data: {
        category: m.category, key: m.key, value: m.value, score: m.score,
        sampleSize: Math.floor(Math.random() * 20) + 5,
        successCount: Math.floor(m.score * 25),
        failCount: Math.floor((1 - m.score) * 15),
        industry: m.industry, persona: m.persona, channel: m.channel,
      },
    });
  }
}
