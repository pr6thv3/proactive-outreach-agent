// ─── Pipeline Orchestrator ────────────────────────────
// Production orchestrator with Signal Intelligence, Scoring, Memory, Multi-channel, Autonomy
// Now includes edit tracking for human-in-the-loop learning

import { LeadIngestionAgent } from '../agents/observe/lead-ingestion';
import { WebScraperAgent } from '../agents/observe/web-scraper';
import { SignalExtractorAgent } from '../agents/observe/signal-extractor';
import { SignalIntelligenceAgent } from '../agents/observe/signal-intelligence';
import { LLMReasoningAgent } from '../agents/think/llm-reasoning';
import { PitchStrategistAgent } from '../agents/think/pitch-strategist';
import { PersonalizerAgent } from '../agents/think/personalizer';
import { ScoringEngine } from '../agents/think/scoring-engine';
import { CRMLoggerAgent } from '../agents/act/crm-logger';
import { EmailSenderAgent } from '../agents/act/email-sender';
import { FollowUpSchedulerAgent } from '../agents/act/followup-scheduler';
import { ReplyClassifierAgent } from '../agents/reeval/reply-classifier';
import { AgentMemoryService } from '../agents/infrastructure/agent-memory';
import { AutonomousWorkflowEngine } from '../agents/infrastructure/autonomous-engine';
import { JobQueue } from '../agents/infrastructure/job-queue';
import { selectBestChannel, type Channel } from '../agents/infrastructure/multi-channel';
import { logger, generateTraceId } from '../agents/infrastructure/observability';
import { trackEdit, feedEditToMemory, updateEditOutcome } from '../agents/act/edit-tracker';
import { db } from '@/lib/db';
import { isLeadSafeToContact, parseCsv } from '@/lib/safety';
import {
  AgentContext, AgentResult, ObserveOutput, ThinkOutput, ActOutput, ReEvalOutput,
  PipelineState, OrchestratorConfig, DEFAULT_CONFIG, SignalData, LeadData,
  CampaignConfig, LeadIngestionResult, MessageData, AutonomousCycleResult,
} from '../agents/types';

const leadIngestion = new LeadIngestionAgent();
const webScraper = new WebScraperAgent();
const signalExtractor = new SignalExtractorAgent();
const signalIntelligence = new SignalIntelligenceAgent();
const llmReasoning = new LLMReasoningAgent();
const pitchStrategist = new PitchStrategistAgent();
const personalizer = new PersonalizerAgent();
const scoringEngine = new ScoringEngine();
const crmLogger = new CRMLoggerAgent();
const emailSender = new EmailSenderAgent();
const followUpScheduler = new FollowUpSchedulerAgent();
const replyClassifier = new ReplyClassifierAgent();

export class Orchestrator {
  private config: OrchestratorConfig;

  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── CSV Import ───────────────────────────────────
  async importCsv(csvText: string, source = 'csv_import'): Promise<LeadIngestionResult> {
    const { leads, errors: parseErrors } = parseCsv(csvText);
    const context = await this.buildContext((await db.lead.findFirst())?.id || '');
    if (!context) return { created: 0, updated: 0, skipped: leads.length, dncBlocked: 0, leads: [], errors: [...parseErrors.map(e => ({ email: '', reason: e.reason })), { email: '', reason: 'No context available' }] };
    const result = await leadIngestion.run({ leads, source }, context);
    return result.success ? result.data : { created: 0, updated: 0, skipped: leads.length, dncBlocked: 0, leads: [], errors: [...parseErrors.map(e => ({ email: '', reason: e.reason })), { email: '', reason: result.error || 'Ingestion failed' }] };
  }

  // ─── OBSERVE Phase (Enhanced with Signal Intelligence) ───
  async runObserve(leadId: string, urls?: string[]): Promise<AgentResult<ObserveOutput>> {
    const traceId = generateTraceId();
    logger.setTraceId(traceId);
    logger.info('Starting OBSERVE phase', { agent: 'Orchestrator', phase: 'observe', leadId, traceId });

    const context = await this.buildContext(leadId);
    if (!context) return this.leadNotFound('ObservePipeline');

    // 1. Scrape company website
    const scrapeResult = await webScraper.run({ urls }, context);
    const allSignals = [...context.signals, ...(scrapeResult.success && scrapeResult.data ? scrapeResult.data.signals : [])];

    // 2. Extract basic signals
    const extractResult = await signalExtractor.run({ existingSignals: allSignals }, context);
    const combinedSignals = [...allSignals, ...(extractResult.success && extractResult.data ? extractResult.data.signals : [])];

    // 3. THE MOAT: Signal Intelligence (WHY NOW?)
    if (this.config.enableSignalIntelligence) {
      const intelContext = await this.buildContext(leadId);
      if (intelContext) {
        const intelResult = await signalIntelligence.run({ existingSignals: intelContext.signals }, intelContext);
        if (intelResult.success && intelResult.data) {
          logger.info(`Signal Intelligence: top signal = ${intelResult.data.topPriority?.signal_type} (urgency: ${intelResult.data.topPriority?.urgency?.toFixed(2)}), action = ${intelResult.data.recommendedAction}`, {
            agent: 'SignalIntelligence', phase: 'observe', leadId, traceId,
            metadata: { topSignal: intelResult.data.topPriority?.signal_type, urgency: intelResult.data.topPriority?.urgency, action: intelResult.data.recommendedAction },
          });
        }
      }
    }

    // 4. Score the lead
    if (this.config.enableScoring) {
      const scoreContext = await this.buildContext(leadId);
      if (scoreContext) await scoringEngine.run({}, scoreContext);
    }

    const enrichedLead = extractResult.success && extractResult.data ? extractResult.data.enrichedLead : context.lead;

    // Update lead status
    await db.lead.update({ where: { id: leadId }, data: { status: 'enriched' } });

    const finalContext = await this.buildContext(leadId);
    const finalSignals = finalContext?.signals || combinedSignals;

    return {
      success: scrapeResult.success || extractResult.success,
      data: { signals: finalSignals, enrichedLead, scrapeResults: [...(scrapeResult.data?.scrapeResults || []), ...(extractResult.data?.scrapeResults || [])] },
      durationMs: (scrapeResult.durationMs || 0) + (extractResult.durationMs || 0),
      agentName: 'ObservePipeline', phase: 'observe', traceId,
    };
  }

  // ─── THINK Phase (Enhanced with Signal Intelligence Context) ───
  async runThink(leadId: string, campaignId?: string, objective?: string): Promise<AgentResult<ThinkOutput>> {
    const traceId = generateTraceId();
    logger.setTraceId(traceId);
    logger.info('Starting THINK phase', { agent: 'Orchestrator', phase: 'think', leadId, traceId });

    const context = await this.buildContext(leadId, campaignId);
    if (!context) return this.leadNotFound('ThinkPipeline');

    // Get top signal intelligence for pitch context
    const topSignal = context.signals
      .filter(s => s.urgency && s.urgency > 0)
      .sort((a, b) => (b.urgency || 0) - (a.urgency || 0))[0];

    const reasoningResult = await llmReasoning.run({
      signals: context.signals,
      objective,
      campaignConfig: context.campaignConfig,
      ...(topSignal ? {
        topSignalType: topSignal.type,
        topUrgency: topSignal.urgency,
        topPitchAngle: topSignal.recommendedPitchAngle,
        topRecommendedOffer: topSignal.recommendedOffer,
      } : {}),
    }, context);

    if (!reasoningResult.success || !reasoningResult.data) return reasoningResult as AgentResult<ThinkOutput>;

    const pitchResult = await pitchStrategist.run({ initialStrategy: reasoningResult.data, campaignConfig: context.campaignConfig }, context);
    const refined = pitchResult.success && pitchResult.data ? pitchResult.data : reasoningResult.data;

    const personalResult = await personalizer.run({ strategy: refined, campaignConfig: context.campaignConfig }, context);
    const finalStrategy = personalResult.success && personalResult.data ? personalResult.data : refined;

    // Inject signal intelligence context into the final strategy
    const enrichedStrategy: ThinkOutput = {
      ...finalStrategy,
      signalTypeUsed: topSignal?.type,
      urgencyAtGeneration: topSignal?.urgency,
      pitchAngleUsed: topSignal?.recommendedPitchAngle || finalStrategy.angle,
      recommendedChannel: topSignal?.recommendedPitchAngle
        ? (await selectBestChannel(context)).toString() as ThinkOutput['recommendedChannel']
        : 'email',
    };

    // Save the generated email sequence to CRM
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const crmResult = await crmLogger.run({
      message: {
        id: messageId,
        subject: enrichedStrategy.subject,
        body: enrichedStrategy.body,
        channel: enrichedStrategy.recommendedChannel || 'email',
        status: 'generated',
        strategy: enrichedStrategy.strategy,
        angle: enrichedStrategy.angle,
        tone: enrichedStrategy.tone,
        cta: enrichedStrategy.cta,
        sequencePos: 0,
        campaignId,
        signalTypeUsed: enrichedStrategy.signalTypeUsed,
        urgencyAtGeneration: enrichedStrategy.urgencyAtGeneration,
        pitchAngleUsed: enrichedStrategy.pitchAngleUsed,
      },
      emailSequence: enrichedStrategy.emailSequence,
    }, context);

    // Schedule follow-ups if CRM logging succeeded
    if (crmResult.success && this.config.enableFollowUps) {
      await followUpScheduler.run({ messageId, schedule: context.campaignConfig?.followUpSchedule }, context);
    }

    // Update lead status with signal context
    await db.lead.update({ where: { id: leadId }, data: { status: 'generated' } });
    await db.outreachMessage.update({
      where: { id: messageId },
      data: {
        signalTypeUsed: enrichedStrategy.signalTypeUsed,
        urgencyAtGeneration: enrichedStrategy.urgencyAtGeneration,
        pitchAngleUsed: enrichedStrategy.pitchAngleUsed,
      },
    }).catch(() => { /* Field may not exist yet */ });

    await db.activity.create({
      data: {
        type: 'email_generated',
        description: `Email sequence generated (${enrichedStrategy.emailSequence?.length || 1} emails). Signal: ${topSignal?.type || 'none'} (urgency: ${(topSignal?.urgency || 0).toFixed(2)}). Pitch: ${enrichedStrategy.pitchAngleUsed || enrichedStrategy.angle}`,
        phase: 'think',
        leadId,
        metadata: JSON.stringify({
          messageId,
          signalType: topSignal?.type,
          urgency: topSignal?.urgency,
          pitchAngle: enrichedStrategy.pitchAngleUsed,
          channel: enrichedStrategy.recommendedChannel,
        }),
      },
    });

    return {
      success: true,
      data: enrichedStrategy,
      durationMs: (reasoningResult.durationMs || 0) + (pitchResult.durationMs || 0) + (personalResult.durationMs || 0),
      agentName: 'ThinkPipeline', phase: 'think', traceId,
    };
  }

  // ─── APPROVE a generated message (with edit tracking) ────
  async approveMessage(messageId: string, editedSubject?: string, editedBody?: string): Promise<{ success: boolean; error?: string }> {
    const msg = await db.outreachMessage.findUnique({ where: { id: messageId } });
    if (!msg) return { success: false, error: 'Message not found' };
    if (msg.status !== 'generated' && msg.status !== 'draft') return { success: false, error: `Cannot approve message in "${msg.status}" status` };

    const safety = await isLeadSafeToContact(msg.leadId);
    if (!safety.safe) return { success: false, error: `Lead not safe to contact: ${safety.reasons.join(', ')}` };

    // ═══ EDIT TRACKING (Human-in-the-Loop Learning) ═══
    const hasSubjectEdit = editedSubject && editedSubject !== msg.subject;
    const hasBodyEdit = editedBody && editedBody !== msg.body;

    if (hasSubjectEdit) {
      await trackEdit({
        messageId,
        fieldName: 'subject',
        originalValue: msg.subject,
        editedValue: editedSubject!,
        signalType: msg.signalTypeUsed || undefined,
        pitchAngle: msg.pitchAngleUsed || undefined,
        urgency: msg.urgencyAtGeneration ?? undefined,
        leadId: msg.leadId,
        campaignId: msg.campaignId || undefined,
      });
    }

    if (hasBodyEdit) {
      await trackEdit({
        messageId,
        fieldName: 'body',
        originalValue: msg.body,
        editedValue: editedBody!,
        signalType: msg.signalTypeUsed || undefined,
        pitchAngle: msg.pitchAngleUsed || undefined,
        urgency: msg.urgencyAtGeneration ?? undefined,
        leadId: msg.leadId,
        campaignId: msg.campaignId || undefined,
      });
    }

    // Feed edits to memory for learning
    const edits = await db.messageEdit.findMany({ where: { messageId, fedToMemory: false } });
    for (const edit of edits) {
      await feedEditToMemory(edit.id);
    }

    await db.outreachMessage.update({
      where: { id: messageId },
      data: {
        status: 'approved',
        subject: editedSubject || msg.subject,
        body: editedBody || msg.body,
        approvedAt: new Date(),
        approvedBy: 'user',
      },
    });

    await db.lead.update({ where: { id: msg.leadId }, data: { status: 'approved' } });
    await db.activity.create({ data: { type: 'email_approved', description: `Email approved${hasSubjectEdit || hasBodyEdit ? ' (with edits)' : ''}: "${editedSubject || msg.subject}"`, phase: 'act', leadId: msg.leadId } });

    return { success: true };
  }

  // ─── SEND an approved message ─────────────────────
  async sendMessage(messageId: string, dryRun = false): Promise<AgentResult<ActOutput>> {
    const msg = await db.outreachMessage.findUnique({ where: { id: messageId }, include: { lead: true } });
    if (!msg) return { success: false, data: null as unknown as ActOutput, error: 'Message not found', durationMs: 0, agentName: 'EmailSender', phase: 'act' };
    if (msg.status !== 'approved') return { success: false, data: null as unknown as ActOutput, error: `Message must be "approved", got "${msg.status}"`, durationMs: 0, agentName: 'EmailSender', phase: 'act' };

    const context = await this.buildContext(msg.leadId, msg.campaignId || undefined);
    if (!context) return this.leadNotFound('EmailSender');

    return emailSender.run({
      message: {
        id: msg.id, subject: msg.subject, body: msg.body, channel: msg.channel as MessageData['channel'], status: msg.status as MessageData['status'], strategy: msg.strategy || undefined, angle: msg.angle || undefined, tone: msg.tone || undefined, cta: msg.cta || undefined, sequencePos: msg.sequencePos, campaignId: msg.campaignId || undefined,
      },
      dryRun,
    }, context);
  }

  // ─── RE-EVAL Phase (Enhanced with Memory Learning) ───
  async runReEval(leadId: string, messageId: string, replyText: string): Promise<AgentResult<ReEvalOutput>> {
    const traceId = generateTraceId();
    logger.setTraceId(traceId);

    const context = await this.buildContext(leadId);
    if (!context) return this.leadNotFound('ReEvalPipeline');

    const result = await replyClassifier.run({ messageId, replyText }, context);

    // Learn from the outcome (THE COMPOUNDING STEP)
    if (result.success && this.config.enableMemoryLearning) {
      const lead = context.lead;
      const msg = await db.outreachMessage.findUnique({ where: { id: messageId } });

      if (msg) {
        // Record feedback on the strategy/hook used
        await AgentMemoryService.recordFeedback({
          category: 'persona_pattern',
          key: `strategy_${msg.strategy || 'unknown'}_${lead.title || 'unknown'}`,
          wasSuccessful: result.data.category === 'interested',
          industry: lead.company || undefined,
          persona: lead.title || undefined,
          channel: msg.channel,
        });

        // Record feedback on the signal type used
        if (msg.signalTypeUsed) {
          await AgentMemoryService.recordFeedback({
            category: 'signal_correlation',
            key: `signal_${msg.signalTypeUsed}_${lead.company || 'unknown'}`,
            wasSuccessful: result.data.category === 'interested',
            industry: lead.company || undefined,
            channel: msg.channel,
          });
        }

        // Record channel effectiveness
        await AgentMemoryService.recordFeedback({
          category: 'channel_effectiveness',
          key: `channel_${msg.channel}_${lead.company || 'unknown'}_${lead.title || 'unknown'}`,
          wasSuccessful: result.data.category === 'interested' || result.data.category === 'neutral',
          industry: lead.company || undefined,
          persona: lead.title || undefined,
          channel: msg.channel,
        });

        // Record hook performance
        if (msg.pitchAngleUsed) {
          await AgentMemoryService.recordFeedback({
            category: 'winning_hook',
            key: `hook_${msg.pitchAngleUsed.replace(/\s+/g, '_').slice(0, 50)}_${lead.company || 'unknown'}`,
            wasSuccessful: result.data.category === 'interested',
            industry: lead.company || undefined,
            persona: lead.title || undefined,
            channel: msg.channel,
          });
        }

        // Update edit outcomes — did the edited email get a reply?
        const category = result.data.category;
        const outcome = category === 'interested' ? 'interested' :
                        category === 'neutral' ? 'replied' :
                        category === 'negative' ? 'replied' :
                        category === 'unsubscribe' ? 'unsubscribed' : 'no_response';
        await updateEditOutcome(messageId, outcome as 'replied' | 'interested' | 'bounced' | 'unsubscribed' | 'no_response');

        logger.info('Memory updated from reply classification', {
          agent: 'Orchestrator', phase: 'reeval', leadId, traceId,
          metadata: { category: result.data.category, strategy: msg.strategy, signalType: msg.signalTypeUsed },
        });
      }
    }

    return { ...result, traceId };
  }

  // ─── Full Pipeline (observe + think + score, no auto-send) ──
  async runFullPipeline(leadId: string, options?: { campaignId?: string; objective?: string }): Promise<PipelineState> {
    const traceId = generateTraceId();
    logger.setTraceId(traceId);
    logger.info('Starting full pipeline', { agent: 'Orchestrator', leadId, traceId });

    const state: PipelineState = {
      leadId, currentPhase: 'observe', status: 'running', errors: [], retryCount: 0,
      startedAt: new Date(), traceId,
    };

    // OBSERVE
    const observeResult = await this.runObserve(leadId);
    state.observeResult = observeResult;
    if (!observeResult.success) state.errors.push({ phase: 'observe', message: observeResult.error || 'Observe failed', timestamp: new Date() });

    // THINK
    const thinkResult = await this.runThink(leadId, options?.campaignId, options?.objective);
    state.thinkResult = thinkResult;
    if (!thinkResult.success) state.errors.push({ phase: 'think', message: thinkResult.error || 'Think failed', timestamp: new Date() });

    // Get final scores
    const lead = await db.lead.findUnique({ where: { id: leadId } });
    if (lead) {
      state.scores = {
        leadScore: lead.leadScore,
        signalScore: lead.signalScore,
        replyProb: lead.replyProb,
        conversionProb: lead.conversionProb,
        spamRisk: lead.spamRisk,
        priorityTier: lead.priorityTier as PipelineState['scores'] extends undefined ? never : 'hot' | 'warm' | 'cold',
      };
    }

    // Get signal intelligence summary
    const topSignal = await db.signal.findFirst({
      where: { leadId, urgency: { gt: 0 } },
      orderBy: { urgency: 'desc' },
    });
    if (topSignal) {
      state.signalIntelligence = {
        topSignalType: topSignal.type,
        topUrgency: topSignal.urgency,
        recommendedAction: topSignal.urgency >= 0.7 ? 'reach_out_now' : topSignal.urgency >= 0.4 ? 'reach_out_soon' : 'monitor',
        recommendedChannel: (topSignal.recommendedPitchAngle?.includes('LinkedIn') ? 'linkedin' : 'email') as PipelineState['signalIntelligence'] extends undefined ? never : 'email' | 'linkedin' | 'twitter' | 'sms' | 'contact_form',
      };
    }

    state.currentPhase = 'reeval';
    state.status = state.errors.length > 0 ? 'failed' : 'completed';
    state.completedAt = new Date();

    // Log pipeline run
    await db.pipelineRun.create({
      data: {
        phase: 'full_pipeline',
        status: state.status,
        leadId,
        durationMs: state.completedAt ? state.completedAt.getTime() - state.startedAt.getTime() : 0,
        traceId,
        output: JSON.stringify({
          scores: state.scores,
          signalIntelligence: state.signalIntelligence,
          errorCount: state.errors.length,
        }),
      },
    });

    return state;
  }

  // ─── Batch: generate for multiple leads ───────────
  async batchGenerate(leadIds: string[], campaignId?: string): Promise<Array<{ leadId: string; success: boolean; error?: string }>> {
    const results: Array<{ leadId: string; success: boolean; error?: string }> = [];
    for (const leadId of leadIds) {
      try {
        await this.runObserve(leadId);
        await this.runThink(leadId, campaignId);
        results.push({ leadId, success: true });
      } catch (error) {
        results.push({ leadId, success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }
    return results;
  }

  // ─── Run Autonomous Cycle ──────────────────────────
  async runAutonomousCycle(organizationId?: string): Promise<AutonomousCycleResult> {
    const engine = new AutonomousWorkflowEngine({
      organizationId,
      minLeadScore: this.config.autonomyMinScore,
      autoApproveThreshold: this.config.autoApproveThreshold,
      channels: this.config.channels as string[],
    });
    return engine.runCycle();
  }

  // ─── Get Memory Recommendations ────────────────────
  async getMemoryRecommendations(params: { industry?: string; persona?: string; channel?: string }) {
    return AgentMemoryService.getRecommendations(params);
  }

  // ─── Get Queue Stats ───────────────────────────────
  async getQueueStats() {
    return JobQueue.getStats();
  }

  // ─── Helpers ────────────────────────────────────────
  private async buildContext(leadId: string, campaignId?: string): Promise<AgentContext | null> {
    const lead = await db.lead.findUnique({ where: { id: leadId } });
    if (!lead) return null;

    const signals = await db.signal.findMany({ where: { leadId } });
    const previousMessages = await db.outreachMessage.findMany({ where: { leadId } });

    let campaignConfig: CampaignConfig | undefined;
    if (campaignId) {
      const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
      if (campaign) {
        campaignConfig = {
          goal: campaign.goal || '',
          targetAudience: campaign.targetAudience || '',
          offer: campaign.offer || '',
          senderName: campaign.senderName || 'Alex',
          senderEmail: campaign.senderEmail || 'alex@company.com',
          tone: campaign.tone,
          cta: campaign.cta || '',
          maxDailySends: campaign.maxDailySends,
          followUpSchedule: JSON.parse(campaign.followUpSchedule || '[3,7,14]'),
          productDescription: campaign.productDescription || '',
          channels: JSON.parse(campaign.channels || '["email"]'),
          autonomyEnabled: campaign.autonomyEnabled,
          autonomyMinScore: campaign.autonomyMinScore,
        };
      }
    }

    return {
      organizationId: lead.organizationId || undefined,
      leadId,
      lead: mapLead(lead),
      signals: signals.map(mapSignal),
      previousMessages: previousMessages.map(mapMsg),
      campaignId,
      campaignConfig,
    };
  }

  private leadNotFound<T>(name: string): AgentResult<T> {
    return { success: false, data: null as unknown as T, error: 'Lead not found', durationMs: 0, agentName: name, phase: 'observe' };
  }
}

function mapLead(l: { id: string; name: string; email: string; company: string | null; title: string | null; url: string | null; linkedinUrl: string | null; status: string; source: string; emailVerified: boolean; isBlacklisted: boolean; doNotContact: boolean; lastContacted: Date | null; notes: string | null; leadScore: number | null; signalScore: number | null; replyProb: number | null; conversionProb: number | null; spamRisk: number | null; priorityTier: string | null; autonomyEnabled: boolean | null; nextActionAt: Date | null; organizationId?: string | null }): LeadData {
  return {
    id: l.id, name: l.name, email: l.email,
    company: l.company || undefined, title: l.title || undefined,
    url: l.url || undefined, linkedinUrl: l.linkedinUrl || undefined,
    status: l.status as LeadData['status'], source: l.source,
    emailVerified: l.emailVerified, isBlacklisted: l.isBlacklisted,
    doNotContact: l.doNotContact, lastContacted: l.lastContacted || undefined,
    notes: l.notes || undefined,
    leadScore: l.leadScore ?? undefined,
    signalScore: l.signalScore ?? undefined,
    replyProb: l.replyProb ?? undefined,
    conversionProb: l.conversionProb ?? undefined,
    spamRisk: l.spamRisk ?? undefined,
    priorityTier: (l.priorityTier as LeadData['priorityTier']) ?? undefined,
    autonomyEnabled: l.autonomyEnabled ?? undefined,
    nextActionAt: l.nextActionAt ?? undefined,
  };
}
function mapSignal(s: { id: string; type: string; content: string; source: string; relevance: number; confidence: number; rawSnippet: string | null; urgency: number | null; reasoning: string | null; recommendedPitchAngle: string | null; recommendedOffer: string | null; decayRate: number | null; detectedAt: Date | null; expiresAt: Date | null }): SignalData {
  return {
    id: s.id, type: s.type as SignalData['type'], content: s.content, source: s.source,
    relevance: s.relevance, confidence: s.confidence, rawSnippet: s.rawSnippet || undefined,
    urgency: s.urgency ?? undefined,
    reasoning: s.reasoning ?? undefined,
    recommendedPitchAngle: s.recommendedPitchAngle ?? undefined,
    recommendedOffer: s.recommendedOffer ?? undefined,
    decayRate: s.decayRate ?? undefined,
    detectedAt: s.detectedAt ?? undefined,
    expiresAt: s.expiresAt ?? undefined,
  };
}
function mapMsg(m: { id: string; subject: string; body: string; channel: string; status: string; strategy: string | null; angle: string | null; tone: string | null; cta: string | null; sequencePos: number; campaignId: string | null; approvedBy: string | null; approvedAt: Date | null; sentAt: Date | null; signalTypeUsed: string | null; urgencyAtGeneration: number | null; pitchAngleUsed: string | null }): MessageData {
  return {
    id: m.id, subject: m.subject, body: m.body,
    channel: m.channel as MessageData['channel'], status: m.status as MessageData['status'],
    strategy: m.strategy || undefined, angle: m.angle || undefined,
    tone: m.tone || undefined, cta: m.cta || undefined,
    sequencePos: m.sequencePos, campaignId: m.campaignId || undefined,
    approvedBy: m.approvedBy || undefined, approvedAt: m.approvedAt || undefined,
    sentAt: m.sentAt || undefined,
    signalTypeUsed: m.signalTypeUsed || undefined,
    urgencyAtGeneration: m.urgencyAtGeneration ?? undefined,
    pitchAngleUsed: m.pitchAngleUsed || undefined,
  };
}

export const orchestrator = new Orchestrator();
export * from '../agents/types';
