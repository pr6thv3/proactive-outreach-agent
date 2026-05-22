// ─── INFRASTRUCTURE: Autonomous Workflow Engine ─────────
// THE MAGICAL LOOP: Discover → Enrich → Score → Draft → Schedule → Learn
// System continuously discovers leads, enriches them, drafts outreach, and learns from results

import { db } from '@/lib/db';
import { JobQueue, JobType } from './job-queue';
import { AgentMemoryService } from './agent-memory';
import { logger, generateTraceId } from './observability';
import { selectBestChannel } from './multi-channel';

export interface AutonomyConfig {
  maxDailyDiscoveries: number;    // Max new leads to discover per day
  maxDailyEngagements: number;    // Max outreach actions per day
  minLeadScore: number;           // Minimum score to auto-engage
  autoApproveThreshold: number;   // Score above which emails are auto-approved
  channels: string[];             // Channels to use for auto-outreach
  discoverySources: string[];     // Where to find new leads
}

const DEFAULT_AUTONOMY_CONFIG: AutonomyConfig = {
  maxDailyDiscoveries: 20,
  maxDailyEngagements: 15,
  minLeadScore: 60,
  autoApproveThreshold: 85,
  channels: ['email', 'linkedin'],
  discoverySources: ['web_search', 'csv_import'],
};

export class AutonomousWorkflowEngine {
  private config: AutonomyConfig;

  constructor(config?: Partial<AutonomyConfig>) {
    this.config = { ...DEFAULT_AUTONOMY_CONFIG, ...config };
  }

  /**
   * Main autonomous loop — call this periodically (e.g., every 5 minutes)
   *
   * The Magical Loop:
   * 1. Discover new leads
   * 2. Enrich with signals
   * 3. Score leads
   * 4. Draft outreach for high-priority leads
   * 5. Auto-approve if above threshold
   * 6. Schedule sends
   * 7. Learn from past results
   */
  async runCycle(): Promise<{
    discovered: number;
    enriched: number;
    scored: number;
    drafted: number;
    autoApproved: number;
    scheduled: number;
    learned: number;
  }> {
    const traceId = generateTraceId();
    logger.setTraceId(traceId);

    logger.info('Autonomous workflow cycle starting', { traceId, agent: 'AutonomousEngine' });

    const results = {
      discovered: 0,
      enriched: 0,
      scored: 0,
      drafted: 0,
      autoApproved: 0,
      scheduled: 0,
      learned: 0,
    };

    try {
      // Step 1: DISCOVER — find leads that need processing
      results.discovered = await this.discoverLeads(traceId);

      // Step 2: ENRICH — run observe phase on leads that need it
      results.enriched = await this.enrichLeads(traceId);

      // Step 3: SCORE — score leads that have signals
      results.scored = await this.scoreLeads(traceId);

      // Step 4: DRAFT — generate emails for high-priority leads
      results.drafted = await this.draftOutreach(traceId);

      // Step 5: AUTO-APPROVE — approve emails for very high-score leads
      results.autoApproved = await this.autoApproveOutreach(traceId);

      // Step 6: SCHEDULE — schedule sends via job queue
      results.scheduled = await this.scheduleSends(traceId);

      // Step 7: LEARN — update memory from recent outcomes
      results.learned = await this.learnFromOutcomes(traceId);

      logger.info('Autonomous workflow cycle complete', {
        agent: 'AutonomousEngine',
        traceId,
        metadata: results,
      });
    } catch (error) {
      logger.error('Autonomous workflow cycle failed', {
        agent: 'AutonomousEngine',
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return results;
  }

  /**
   * Step 1: Discover leads that need processing
   */
  private async discoverLeads(traceId: string): Promise<number> {
    // Find leads that are new and haven't been enriched yet
    const newLeads = await db.lead.findMany({
      where: {
        status: 'new',
        isBlacklisted: false,
        doNotContact: false,
        autonomyEnabled: true,
      },
      take: this.config.maxDailyDiscoveries,
    });

    // Enqueue observe jobs for each new lead
    let count = 0;
    for (const lead of newLeads) {
      await JobQueue.enqueue('signal_intelligence', { leadId: lead.id }, { priority: 3, traceId });
      await JobQueue.enqueue('scrape', { leadId: lead.id, urls: lead.url ? [lead.url] : [] }, { priority: 4, traceId });
      count++;
    }

    if (count > 0) {
      logger.info(`Discovered ${count} new leads for processing`, { agent: 'AutonomousEngine', phase: 'discover', traceId, metadata: { count } });
    }

    return count;
  }

  /**
   * Step 2: Enrich leads that have pending observe jobs
   */
  private async enrichLeads(traceId: string): Promise<number> {
    // Find leads that were recently enriched (status = enriched, no score yet)
    const enrichedLeads = await db.lead.findMany({
      where: {
        status: 'enriched',
        leadScore: 0, // Not yet scored
        isBlacklisted: false,
        doNotContact: false,
      },
      take: this.config.maxDailyEngagements,
    });

    let count = 0;
    for (const lead of enrichedLeads) {
      await JobQueue.enqueue('score', { leadId: lead.id }, { priority: 2, traceId });
      count++;
    }

    return count;
  }

  /**
   * Step 3: Score leads that have signals but no score
   */
  private async scoreLeads(traceId: string): Promise<number> {
    // Find scored leads that are above the threshold and haven't been generated yet
    const highPriorityLeads = await db.lead.findMany({
      where: {
        status: { in: ['enriched', 'scored'] },
        leadScore: { gte: this.config.minLeadScore },
        isBlacklisted: false,
        doNotContact: false,
      },
      take: this.config.maxDailyEngagements,
      orderBy: { leadScore: 'desc' },
    });

    let count = 0;
    for (const lead of highPriorityLeads) {
      await db.lead.update({ where: { id: lead.id }, data: { status: 'scored' } });
      count++;
    }

    return count;
  }

  /**
   * Step 4: Draft outreach for high-priority leads
   */
  private async draftOutreach(traceId: string): Promise<number> {
    const leadsToDraft = await db.lead.findMany({
      where: {
        status: 'scored',
        leadScore: { gte: this.config.minLeadScore },
        isBlacklisted: false,
        doNotContact: false,
      },
      include: { signals: { orderBy: { urgency: 'desc' }, take: 3 } },
      take: this.config.maxDailyEngagements,
      orderBy: { leadScore: 'desc' },
    });

    let count = 0;
    for (const lead of leadsToDraft) {
      await JobQueue.enqueue('generate_email', {
        leadId: lead.id,
        topSignalType: lead.signals[0]?.type,
        topUrgency: lead.signals[0]?.urgency,
      }, { priority: 2, traceId });
      count++;
    }

    return count;
  }

  /**
   * Step 5: Auto-approve outreach for very high-score leads
   */
  private async autoApproveOutreach(traceId: string): Promise<number> {
    if (this.config.autoApproveThreshold < 100) {
      // Find messages for leads with very high scores that are still in 'generated' status
      const autoApproveLeads = await db.lead.findMany({
        where: {
          leadScore: { gte: this.config.autoApproveThreshold },
          status: 'generated',
          isBlacklisted: false,
          doNotContact: false,
        },
        take: 5,
      });

      let count = 0;
      for (const lead of autoApproveLeads) {
        const generatedMessages = await db.outreachMessage.findMany({
          where: { leadId: lead.id, status: 'generated', sequencePos: 0 },
        });

        for (const msg of generatedMessages) {
          await db.outreachMessage.update({
            where: { id: msg.id },
            data: { status: 'approved', approvedAt: new Date(), approvedBy: 'autonomous_engine' },
          });
          await db.lead.update({ where: { id: lead.id }, data: { status: 'approved' } });
          count++;
        }
      }

      return count;
    }

    return 0;
  }

  /**
   * Step 6: Schedule sends via job queue
   */
  private async scheduleSends(traceId: string): Promise<number> {
    const approvedMessages = await db.outreachMessage.findMany({
      where: { status: 'approved', sequencePos: 0 },
      include: { lead: true },
      take: this.config.maxDailyEngagements,
    });

    let count = 0;
    for (const msg of approvedMessages) {
      const channel = await selectBestChannel(
        {
          leadId: msg.leadId,
          lead: {
            id: msg.lead.id, name: msg.lead.name, email: msg.lead.email,
            company: msg.lead.company || undefined, title: msg.lead.title || undefined,
            url: msg.lead.url || undefined, linkedinUrl: msg.lead.linkedinUrl || undefined,
            status: msg.lead.status as 'new', source: msg.lead.source,
            emailVerified: msg.lead.emailVerified, isBlacklisted: msg.lead.isBlacklisted,
            doNotContact: msg.lead.doNotContact,
          },
          signals: [], previousMessages: [],
        },
        msg.channel as 'email' | 'linkedin' | 'twitter' | 'sms' | 'contact_form',
      );

      await JobQueue.enqueue('send_email', {
        leadId: msg.leadId,
        messageId: msg.id,
        channel,
        dryRun: false,
      }, { priority: 1, traceId });
      count++;
    }

    return count;
  }

  /**
   * Step 7: Learn from recent outcomes — THIS IS THE COMPOUNDING STEP
   */
  private async learnFromOutcomes(traceId: string): Promise<number> {
    let learned = 0;

    // 1. Learn from recent replies
    const recentReplies = await db.replyClassification.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 86400000) } },
      include: { message: { include: { lead: true } } },
    });

    for (const reply of recentReplies) {
      const lead = reply.message.lead;
      const industry = lead.company || undefined;
      const persona = lead.title || undefined;

      // Record feedback on the hook/strategy used
      if (reply.message.strategy) {
        await AgentMemoryService.recordFeedback({
          category: 'persona_pattern',
          key: `strategy_${reply.message.strategy}_${persona || 'unknown'}`,
          wasSuccessful: reply.category === 'interested',
          industry,
          persona,
          channel: reply.message.channel,
        });
        learned++;
      }

      // Record feedback on the pitch angle
      if (reply.message.angle) {
        await AgentMemoryService.recordFeedback({
          category: 'industry_pattern',
          key: `angle_${reply.message.angle}_${industry || 'unknown'}`,
          wasSuccessful: reply.category === 'interested',
          industry,
          persona,
          channel: reply.message.channel,
        });
        learned++;
      }

      // Record channel effectiveness
      await AgentMemoryService.recordFeedback({
        category: 'channel_effectiveness',
        key: `channel_${reply.message.channel}_${industry || 'unknown'}_${persona || 'unknown'}`,
        wasSuccessful: reply.category === 'interested' || reply.category === 'neutral',
        industry,
        persona,
        channel: reply.message.channel,
      });
      learned++;
    }

    // 2. Decay old memories periodically
    const decayed = await AgentMemoryService.decayOldMemories(90, 0.95);
    learned += decayed;

    // 3. Decay old signals
    await this.decayStaleSignals();

    if (learned > 0) {
      logger.info(`Learned from ${learned} outcomes`, { agent: 'AutonomousEngine', phase: 'learn', traceId, metadata: { learned } });
    }

    return learned;
  }

  /**
   * Decay stale signals — reduce urgency of old signals
   */
  private async decayStaleSignals(): Promise<void> {
    const staleSignals = await db.signal.findMany({
      where: {
        expiresAt: { lt: new Date() },
        urgency: { gt: 0.1 },
      },
      take: 100,
    });

    for (const signal of staleSignals) {
      const daysSinceDetection = (Date.now() - new Date(signal.detectedAt).getTime()) / 86400000;
      const newUrgency = Math.max(0.05, signal.urgency - signal.decayRate * daysSinceDetection);

      await db.signal.update({
        where: { id: signal.id },
        data: { urgency: newUrgency },
      });
    }
  };

  /**
   * Enable autonomy for a lead
   */
  static async enableForLead(leadId: string): Promise<void> {
    await db.lead.update({
      where: { id: leadId },
      data: {
        autonomyEnabled: true,
        nextActionAt: new Date(), // Start immediately
      },
    });
  }

  /**
   * Enable autonomy for all leads in a campaign
   */
  static async enableForCampaign(campaignId: string): Promise<number> {
    const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) return 0;

    // Enable autonomy for the campaign
    await db.campaign.update({
      where: { id: campaignId },
      data: { autonomyEnabled: true },
    });

    // Enable for all leads that have messages in this campaign
    const leadIds = await db.outreachMessage.findMany({
      where: { campaignId },
      select: { leadId: true },
      distinct: ['leadId'],
    });

    for (const { leadId } of leadIds) {
      await db.lead.update({
        where: { id: leadId },
        data: { autonomyEnabled: true, nextActionAt: new Date() },
      });
    }

    return leadIds.length;
  }
}
