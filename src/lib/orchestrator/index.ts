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
import { logger, generateTraceId, recordAgentEvent } from '../agents/infrastructure/observability';
import { trackEdit, feedEditToMemory, updateEditOutcome } from '../agents/act/edit-tracker';
import { buildEvidenceSnapshot } from '../agents/think/evidence';
import { db } from '@/lib/db';
import { isLeadSafeToContact, parseCsv } from '@/lib/safety';
import { StrategySelector } from '../strategy';
import { evaluateRisk } from '../risk';
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
  async runObserve(leadId: string, urls?: string[], organizationId?: string, traceId = generateTraceId()): Promise<AgentResult<ObserveOutput>> {
    logger.setTraceId(traceId);
    logger.info('Starting OBSERVE phase', { agent: 'Orchestrator', phase: 'observe', leadId, traceId });

    const context = await this.buildContext(leadId, undefined, organizationId, traceId);
    if (!context) return this.leadNotFound('ObservePipeline');

    // 1. Scrape company website
    const scrapeResult = await webScraper.run({ urls }, context);
    const allSignals = [...context.signals, ...(scrapeResult.success && scrapeResult.data ? scrapeResult.data.signals : [])];

    // 2. Extract basic signals
    const extractResult = await signalExtractor.run({ existingSignals: allSignals }, context);
    const combinedSignals = [...allSignals, ...(extractResult.success && extractResult.data ? extractResult.data.signals : [])];

    // 3. THE MOAT: Signal Intelligence (WHY NOW?)
    if (this.config.enableSignalIntelligence) {
      const intelContext = await this.buildContext(leadId, undefined, context.organizationId, traceId);
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
      const scoreContext = await this.buildContext(leadId, undefined, context.organizationId, traceId);
      if (scoreContext) await scoringEngine.run({}, scoreContext);
    }

    const enrichedLead = extractResult.success && extractResult.data ? extractResult.data.enrichedLead : context.lead;

    // Update lead status
    await db.lead.updateMany({ where: { id: leadId, ...(context.organizationId ? { organizationId: context.organizationId } : {}) }, data: { status: 'enriched' } });

    const finalContext = await this.buildContext(leadId, undefined, context.organizationId, traceId);
    const finalSignals = finalContext?.signals || combinedSignals;
    const durationMs = (scrapeResult.durationMs || 0) + (extractResult.durationMs || 0);

    await recordAgentEvent({
      organizationId: context.organizationId,
      leadId,
      agentName: 'Orchestrator',
      stepName: 'observe_pipeline',
      phase: 'observe',
      level: 'info',
      message: `Observe pipeline completed: ${finalSignals.length} signals discovered`,
      inputData: { leadId, urls },
      outputData: { signalCount: finalSignals.length, enrichedLead },
      status: 'completed',
      traceId,
      durationMs,
    }).catch(() => {});

    return {
      success: scrapeResult.success || extractResult.success,
      data: { signals: finalSignals, enrichedLead, scrapeResults: [...(scrapeResult.data?.scrapeResults || []), ...(extractResult.data?.scrapeResults || [])] },
      durationMs,
      agentName: 'ObservePipeline', phase: 'observe', traceId,
    };
  }

  // ─── THINK Phase (Enhanced with Signal Intelligence Context) ───
  async runThink(leadId: string, campaignId?: string, objective?: string, organizationId?: string, traceId = generateTraceId()): Promise<AgentResult<ThinkOutput>> {
    logger.setTraceId(traceId);
    logger.info('Starting THINK phase', { agent: 'Orchestrator', phase: 'think', leadId, traceId });

    const context = await this.buildContext(leadId, campaignId, organizationId, traceId);
    if (!context) return this.leadNotFound('ThinkPipeline');

    const orgId = organizationId || context.organizationId;

    // 1. Choose the best strategy
    const strategyRecommendation = await StrategySelector.selectBestStrategyForLead(
      leadId,
      orgId
    );
    const selectedStrategy = strategyRecommendation?.strategy || 'persona-based';
    const selectedStrategyConfidence = strategyRecommendation?.confidence ?? 0.5;

    // 2. Resolve sending domain and senderId
    let domainId: string | undefined;
    let senderId: string | undefined;
    if (campaignId && orgId) {
      const poolEntry = await db.campaignSenderPool.findFirst({
        where: {
          campaignId,
          enabled: true,
          organizationId: orgId,
          domainId: { not: null },
        },
      });
      if (poolEntry?.domainId) {
        domainId = poolEntry.domainId;
      }
      if (poolEntry?.senderId) {
        senderId = poolEntry.senderId;
      }
    }
    if (!domainId && orgId) {
      const firstDomain = await db.sendingDomain.findFirst({
        where: { organizationId: orgId },
        orderBy: { status: 'desc' },
      });
      domainId = firstDomain?.id;
    }

    // 3. Call evaluateRisk and handle block state
    const riskAssessment = await evaluateRisk({
      organizationId: orgId || '',
      domainId: domainId || 'default-domain',
      campaignId,
      leadId,
      senderId,
      strategyName: selectedStrategy,
    });

    if (riskAssessment.status === 'block') {
      logger.warn('Risk assessment blocked THINK phase', {
        leadId,
        campaignId,
        metadata: {
          domainId,
          remediation: riskAssessment.remediationSteps,
        },
      });

      // Handle block state: mark status/result as blocked to prevent enqueuing
      await db.lead.updateMany({
        where: { id: leadId, ...(orgId ? { organizationId: orgId } : {}) },
        data: { status: 'blocked' },
      }).catch(() => {});

      await db.activity.create({
        data: {
          type: 'risk_blocked',
          description: `Outreach blocked by risk engine: ${riskAssessment.remediationSteps.join(', ')}`,
          phase: 'think',
          organizationId: orgId,
          leadId,
          metadata: JSON.stringify({
            riskScore: riskAssessment.score,
            remediation: riskAssessment.remediationSteps,
          }),
        },
      }).catch(() => {});

      return {
        success: false,
        data: null as unknown as ThinkOutput,
        error: `Risk block: ${riskAssessment.remediationSteps.join(', ')}`,
        durationMs: 0,
        agentName: 'ThinkPipeline',
        phase: 'think',
        traceId,
      };
    }

    // Get top signal intelligence for pitch context
    const topSignal = context.signals
      .filter(s => s.urgency && s.urgency > 0)
      .sort((a, b) => (b.urgency || 0) - (a.urgency || 0))[0];

    const reasoningResult = await llmReasoning.run({
      signals: context.signals,
      objective,
      campaignConfig: context.campaignConfig,
      selectedStrategy,
      selectedStrategyConfidence,
      ...(topSignal ? {
        topSignalType: topSignal.type,
        topUrgency: topSignal.urgency,
        topPitchAngle: topSignal.recommendedPitchAngle,
        topRecommendedOffer: topSignal.recommendedOffer,
      } : {}),
    }, context);

    if (!reasoningResult.success || !reasoningResult.data) return reasoningResult as AgentResult<ThinkOutput>;

    const pitchResult = await pitchStrategist.run({
      initialStrategy: reasoningResult.data,
      campaignConfig: context.campaignConfig,
      selectedStrategy,
      selectedStrategyConfidence,
    }, context);
    const refined = pitchResult.success && pitchResult.data ? pitchResult.data : reasoningResult.data;

    const personalResult = await personalizer.run({ strategy: refined, campaignConfig: context.campaignConfig }, context);
    const finalStrategy = personalResult.success && personalResult.data ? personalResult.data : refined;

    // Inject signal intelligence context into the final strategy
    const enrichedStrategy: ThinkOutput = {
      ...finalStrategy,
      strategy: selectedStrategy,
      signalTypeUsed: topSignal?.type,
      urgencyAtGeneration: topSignal?.urgency,
      pitchAngleUsed: topSignal?.recommendedPitchAngle || finalStrategy.angle,
      recommendedChannel: topSignal?.recommendedPitchAngle
        ? (await selectBestChannel(context)).toString() as ThinkOutput['recommendedChannel']
        : 'email',
    };
    const evidenceSnapshot = buildEvidenceSnapshot(context.signals, enrichedStrategy);

    // Save the generated email sequence to CRM
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const crmResult = await crmLogger.run({
      message: {
        id: messageId,
        subject: enrichedStrategy.subject,
        body: enrichedStrategy.body,
        channel: enrichedStrategy.recommendedChannel || 'email',
        status: 'generated',
        strategy: selectedStrategy,
        angle: enrichedStrategy.angle,
        tone: enrichedStrategy.tone,
        cta: enrichedStrategy.cta,
        sequencePos: 0,
        campaignId,
        signalTypeUsed: enrichedStrategy.signalTypeUsed,
        urgencyAtGeneration: enrichedStrategy.urgencyAtGeneration,
        pitchAngleUsed: enrichedStrategy.pitchAngleUsed,
        evidenceSnapshot,
      },
      emailSequence: enrichedStrategy.emailSequence,
    }, context);

    // Schedule follow-ups if CRM logging succeeded
    if (crmResult.success && this.config.enableFollowUps) {
      await followUpScheduler.run({ messageId, schedule: context.campaignConfig?.followUpSchedule }, context);
    }

    // Update lead status with signal context
    await db.lead.updateMany({ where: { id: leadId, ...(context.organizationId ? { organizationId: context.organizationId } : {}) }, data: { status: 'generated' } });
    await db.outreachMessage.updateMany({
      where: { id: messageId, ...(context.organizationId ? { organizationId: context.organizationId } : {}) },
      data: {
        signalTypeUsed: enrichedStrategy.signalTypeUsed,
        urgencyAtGeneration: enrichedStrategy.urgencyAtGeneration,
        pitchAngleUsed: enrichedStrategy.pitchAngleUsed,
        strategy: selectedStrategy,
      },
    }).catch(() => { /* Field may not exist yet */ });

    await db.activity.create({
      data: {
        type: 'email_generated',
        description: `Email sequence generated (${enrichedStrategy.emailSequence?.length || 1} emails). Signal: ${topSignal?.type || 'none'} (urgency: ${(topSignal?.urgency || 0).toFixed(2)}). Pitch: ${enrichedStrategy.pitchAngleUsed || enrichedStrategy.angle}`,
        phase: 'think',
        organizationId: context.organizationId,
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

    const thinkDuration = (reasoningResult.durationMs || 0) + (pitchResult.durationMs || 0) + (personalResult.durationMs || 0);

    await recordAgentEvent({
      organizationId: context.organizationId,
      leadId,
      campaignId,
      agentName: 'Orchestrator',
      stepName: 'think_pipeline',
      phase: 'think',
      level: 'info',
      message: `Think pipeline completed: generated copy for strategy ${selectedStrategy}`,
      inputData: { leadId, campaignId, objective, selectedStrategy },
      outputData: enrichedStrategy,
      status: 'completed',
      traceId,
      durationMs: thinkDuration,
    }).catch(() => {});

    return {
      success: true,
      data: enrichedStrategy,
      durationMs: thinkDuration,
      agentName: 'ThinkPipeline', phase: 'think', traceId,
    };
  }

  // ─── APPROVE a generated message (with edit tracking) ────
  async approveMessage(messageId: string, editedSubject?: string, editedBody?: string, organizationId?: string): Promise<{ success: boolean; error?: string }> {
    const msg = await db.outreachMessage.findFirst({ where: { id: messageId, ...(organizationId ? { organizationId } : {}) } });
    if (!msg) return { success: false, error: 'Message not found' };
    if (msg.status !== 'generated' && msg.status !== 'draft') return { success: false, error: `Cannot approve message in "${msg.status}" status` };

    const safety = await isLeadSafeToContact(msg.leadId, organizationId || msg.organizationId || undefined);
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

    await db.outreachMessage.updateMany({
      where: { id: messageId, ...(organizationId || msg.organizationId ? { organizationId: organizationId || msg.organizationId || undefined } : {}) },
      data: {
        status: 'approved',
        subject: editedSubject || msg.subject,
        body: editedBody || msg.body,
        approvedAt: new Date(),
        approvedBy: 'user',
      },
    });

    await db.lead.updateMany({ where: { id: msg.leadId, ...(organizationId || msg.organizationId ? { organizationId: organizationId || msg.organizationId || undefined } : {}) }, data: { status: 'approved' } });
    await db.activity.create({ data: { organizationId: organizationId || msg.organizationId, type: 'email_approved', description: `Email approved${hasSubjectEdit || hasBodyEdit ? ' (with edits)' : ''}: "${editedSubject || msg.subject}"`, phase: 'act', leadId: msg.leadId } });

    return { success: true };
  }

  // ─── SEND an approved message ─────────────────────
  async sendMessage(messageId: string, dryRun = false, organizationId?: string, traceId?: string): Promise<AgentResult<ActOutput>> {
    const msg = await db.outreachMessage.findFirst({
      where: { id: messageId, ...(organizationId ? { organizationId } : {}) },
      include: { lead: true },
    });
    if (!msg) return { success: false, data: null as unknown as ActOutput, error: 'Message not found', durationMs: 0, agentName: 'EmailSender', phase: 'act' };
    if (msg.status !== 'approved' && msg.status !== 'sending') {
      return { success: false, data: null as unknown as ActOutput, error: `Message must be "approved", got "${msg.status}"`, durationMs: 0, agentName: 'EmailSender', phase: 'act' };
    }

    // Atomic CAS claiming if not already claimed by caller
    if (msg.status === 'approved') {
      const updated = await db.outreachMessage.updateMany({
        where: { id: messageId, status: 'approved' },
        data: { status: 'sending' },
      });
      if (updated.count === 0) {
        return { success: false, data: null as unknown as ActOutput, error: 'Message already claimed or not in approved state', durationMs: 0, agentName: 'EmailSender', phase: 'act' };
      }
    }

    const context = await this.buildContext(msg.leadId, msg.campaignId || undefined, organizationId || msg.organizationId || undefined, traceId);
    if (!context) return this.leadNotFound('EmailSender');

    try {
      const result = await emailSender.run({
        message: {
          id: msg.id, subject: msg.subject, body: msg.body, channel: msg.channel as MessageData['channel'], status: msg.status as MessageData['status'], strategy: msg.strategy || undefined, angle: msg.angle || undefined, tone: msg.tone || undefined, cta: msg.cta || undefined, sequencePos: msg.sequencePos, campaignId: msg.campaignId || undefined, evidenceSnapshot: msg.evidenceSnapshot,
        },
        dryRun,
      }, context);

      if (!result.success) {
        await db.outreachMessage.updateMany({
          where: { id: messageId, status: 'sending' },
          data: { status: 'failed' },
        });
      }

      await recordAgentEvent({
        organizationId: context.organizationId,
        leadId: msg.leadId,
        campaignId: msg.campaignId || undefined,
        agentName: 'Orchestrator',
        stepName: 'act_pipeline',
        phase: 'act',
        level: result.success ? 'info' : 'error',
        message: result.success ? `Outreach message dispatched: ${messageId}` : `Dispatch failed: ${result.error}`,
        inputData: { messageId, dryRun },
        outputData: result.data,
        status: result.success ? 'completed' : 'failed',
        error: result.error,
        traceId: context.traceId,
        durationMs: result.durationMs,
      }).catch(() => {});

      return result;
    } catch (error) {
      await db.outreachMessage.updateMany({
        where: { id: messageId, status: 'sending' },
        data: { status: 'approved' },
      });
      throw error;
    }
  }

  // ─── RE-EVAL Phase (Enhanced with Memory Learning) ───
  async runReEval(leadId: string, messageId: string, replyText: string, organizationId?: string, traceId = generateTraceId()): Promise<AgentResult<ReEvalOutput>> {
    logger.setTraceId(traceId);

    const context = await this.buildContext(leadId, undefined, organizationId, traceId);
    if (!context) return this.leadNotFound('ReEvalPipeline');

    const result = await replyClassifier.run({ messageId, replyText }, context);

    await recordAgentEvent({
      organizationId: context.organizationId,
      leadId,
      agentName: 'Orchestrator',
      stepName: 'reeval_pipeline',
      phase: 'reeval',
      level: result.success ? 'info' : 'error',
      message: result.success ? `Reply classified as ${result.data?.category}` : `Reeval failed: ${result.error}`,
      inputData: { leadId, messageId, replyText },
      outputData: result.data,
      status: result.success ? 'completed' : 'failed',
      error: result.error,
      traceId,
      durationMs: result.durationMs,
    }).catch(() => {});

    // Learn from the outcome (THE COMPOUNDING STEP)
    if (result.success && this.config.enableMemoryLearning) {
      const lead = context.lead;
      const msg = await db.outreachMessage.findFirst({
        where: {
          id: messageId,
          leadId,
          ...(context.organizationId ? { organizationId: context.organizationId } : {}),
        },
      });

      if (msg) {
        // Record feedback on the strategy/hook used
        await AgentMemoryService.recordFeedback({
          organizationId: context.organizationId,
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
            organizationId: context.organizationId,
            category: 'signal_correlation',
            key: `signal_${msg.signalTypeUsed}_${lead.company || 'unknown'}`,
            wasSuccessful: result.data.category === 'interested',
            industry: lead.company || undefined,
            channel: msg.channel,
          });
        }

        // Record channel effectiveness
        await AgentMemoryService.recordFeedback({
          organizationId: context.organizationId,
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
            organizationId: context.organizationId,
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
  async runFullPipeline(leadId: string, options?: { campaignId?: string; objective?: string; organizationId?: string; traceId?: string }): Promise<PipelineState> {
    const traceId = options?.traceId || generateTraceId();
    const organizationId = options?.organizationId;
    logger.setTraceId(traceId);
    logger.info('Starting full pipeline', { agent: 'Orchestrator', leadId, traceId });

    const state: PipelineState = {
      leadId, currentPhase: 'observe', status: 'running', errors: [], retryCount: 0,
      startedAt: new Date(), traceId,
    };

    // OBSERVE
    const observeResult = await this.runObserve(leadId, undefined, organizationId, traceId);
    state.observeResult = observeResult;
    if (!observeResult.success) state.errors.push({ phase: 'observe', message: observeResult.error || 'Observe failed', timestamp: new Date() });

    // THINK
    const thinkResult = await this.runThink(leadId, options?.campaignId, options?.objective, organizationId, traceId);
    state.thinkResult = thinkResult;
    if (!thinkResult.success) state.errors.push({ phase: 'think', message: thinkResult.error || 'Think failed', timestamp: new Date() });

    // Get final scores
    const lead = await db.lead.findFirst({ where: { id: leadId, ...(organizationId ? { organizationId } : {}) } });
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
      where: { leadId, ...(lead?.organizationId ? { organizationId: lead.organizationId } : {}), urgency: { gt: 0 } },
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
    const durationMs = state.completedAt ? state.completedAt.getTime() - state.startedAt.getTime() : 0;

    // Log pipeline run
    await db.pipelineRun.create({
      data: {
        phase: 'full_pipeline',
        status: state.status,
        organizationId: lead?.organizationId,
        leadId,
        durationMs,
        traceId,
        output: JSON.stringify({
          scores: state.scores,
          signalIntelligence: state.signalIntelligence,
          errorCount: state.errors.length,
        }),
      },
    });

    await recordAgentEvent({
      organizationId: lead?.organizationId,
      leadId,
      campaignId: options?.campaignId,
      agentName: 'Orchestrator',
      stepName: 'full_pipeline',
      phase: 'full_pipeline',
      level: state.status === 'completed' ? 'info' : 'warn',
      message: `Full pipeline completed with status ${state.status}`,
      inputData: { leadId, options },
      outputData: {
        scores: state.scores,
        signalIntelligence: state.signalIntelligence,
        errors: state.errors,
      },
      status: state.status,
      traceId,
      durationMs,
    }).catch(() => {});

    return state;
  }

  // ─── Batch: generate for multiple leads ───────────
  async batchGenerate(leadIds: string[], campaignId?: string, organizationId?: string, traceId = generateTraceId()): Promise<Array<{ leadId: string; success: boolean; error?: string }>> {
    const results: Array<{ leadId: string; success: boolean; error?: string }> = [];
    for (const leadId of leadIds) {
      try {
        await this.runObserve(leadId, undefined, organizationId, traceId);
        await this.runThink(leadId, campaignId, undefined, organizationId, traceId);
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
  private async buildContext(leadId: string, campaignId?: string, organizationId?: string, traceId?: string): Promise<AgentContext | null> {
    const lead = await db.lead.findFirst({ where: { id: leadId, ...(organizationId ? { organizationId } : {}) } });
    if (!lead) return null;

    const scopedOrganizationId = organizationId || lead.organizationId || undefined;
    const signals = await db.signal.findMany({ where: { leadId, ...(scopedOrganizationId ? { organizationId: scopedOrganizationId } : {}) } });
    const previousMessages = await db.outreachMessage.findMany({ where: { leadId, ...(scopedOrganizationId ? { organizationId: scopedOrganizationId } : {}) } });

    let campaignConfig: CampaignConfig | undefined;
    if (campaignId) {
      const campaign = await db.campaign.findFirst({ where: { id: campaignId, ...(scopedOrganizationId ? { organizationId: scopedOrganizationId } : {}) } });
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
      organizationId: scopedOrganizationId,
      leadId,
      lead: mapLead(lead),
      signals: signals.map(mapSignal),
      previousMessages: previousMessages.map(mapMsg),
      campaignId,
      campaignConfig,
      traceId,
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
function mapSignal(s: { id: string; type: string; content: string; source: string; relevance: number; confidence: number; rawSnippet: string | null; sourceUrl?: string | null; sourceTitle?: string | null; urgency: number | null; reasoning: string | null; recommendedPitchAngle: string | null; recommendedOffer: string | null; decayRate: number | null; detectedAt: Date | null; expiresAt: Date | null }): SignalData {
  return {
    id: s.id, type: s.type as SignalData['type'], content: s.content, source: s.source,
    relevance: s.relevance, confidence: s.confidence, rawSnippet: s.rawSnippet || undefined,
    sourceUrl: s.sourceUrl || undefined,
    sourceTitle: s.sourceTitle || undefined,
    urgency: s.urgency ?? undefined,
    reasoning: s.reasoning ?? undefined,
    recommendedPitchAngle: s.recommendedPitchAngle ?? undefined,
    recommendedOffer: s.recommendedOffer ?? undefined,
    decayRate: s.decayRate ?? undefined,
    detectedAt: s.detectedAt ?? undefined,
    expiresAt: s.expiresAt ?? undefined,
  };
}
function mapMsg(m: { id: string; subject: string; body: string; channel: string; status: string; strategy: string | null; angle: string | null; tone: string | null; cta: string | null; sequencePos: number; campaignId: string | null; approvedBy: string | null; approvedAt: Date | null; sentAt: Date | null; signalTypeUsed: string | null; urgencyAtGeneration: number | null; pitchAngleUsed: string | null; evidenceSnapshot?: unknown }): MessageData {
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
    evidenceSnapshot: m.evidenceSnapshot ?? undefined,
  };
}

export const orchestrator = new Orchestrator();
export * from '../agents/types';
