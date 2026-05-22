// ─── INFRASTRUCTURE: Agent Memory System ────────────────
// Compounding intelligence: remembers winning hooks, reply rates, industry patterns
// Makes the system get smarter with every interaction

import { db } from '@/lib/db';

// ─── Memory Types ──────────────────────────────────────
export type MemoryCategory =
  | 'winning_hook'          // Subject lines / opening hooks that got replies
  | 'reply_rate'            // Reply rate stats by segment
  | 'industry_pattern'      // Patterns that work in specific industries
  | 'persona_pattern'       // Patterns that work for specific personas
  | 'channel_effectiveness' // Which channels work best for which segments
  | 'signal_correlation'    // Which signals predict replies/conversions
  | 'campaign_result'       // Overall campaign performance data
  | 'offer_performance';    // Which offers convert best

export interface MemoryEntry {
  category: MemoryCategory;
  key: string;
  value: Record<string, unknown>;
  score: number;          // 0-1 effectiveness
  industry?: string;
  persona?: string;
  channel?: string;
}

export interface MemoryQuery {
  category?: MemoryCategory;
  industry?: string;
  persona?: string;
  channel?: string;
  minScore?: number;
  limit?: number;
}

export interface MemoryFeedback {
  category: MemoryCategory;
  key: string;
  wasSuccessful: boolean;  // Did this lead to a positive outcome?
  industry?: string;
  persona?: string;
  channel?: string;
  leadId?: string;
  campaignId?: string;
}

// ─── Agent Memory Service ──────────────────────────────
export class AgentMemoryService {
  /**
   * Store a new memory entry or update existing one
   */
  static async store(entry: MemoryEntry): Promise<void> {
    const existingKey = await db.agentMemory.findFirst({
      where: { category: entry.category, key: entry.key },
    });

    if (existingKey) {
      // Update existing: blend scores and increment sample size
      const newSampleSize = existingKey.sampleSize + 1;
      const blendedScore = (existingKey.score * existingKey.sampleSize + entry.score) / newSampleSize;
      const newSuccessCount = existingKey.successCount + (entry.score >= 0.5 ? 1 : 0);
      const newFailCount = existingKey.failCount + (entry.score < 0.5 ? 1 : 0);

      await db.agentMemory.update({
        where: { id: existingKey.id },
        data: {
          value: JSON.stringify(entry.value),
          score: blendedScore,
          sampleSize: newSampleSize,
          successCount: newSuccessCount,
          failCount: newFailCount,
          industry: entry.industry || existingKey.industry,
          persona: entry.persona || existingKey.persona,
          channel: entry.channel || existingKey.channel,
          lastUsedAt: new Date(),
          useCount: existingKey.useCount + 1,
        },
      });
    } else {
      await db.agentMemory.create({
        data: {
          category: entry.category,
          key: entry.key,
          value: JSON.stringify(entry.value),
          score: entry.score,
          sampleSize: 1,
          successCount: entry.score >= 0.5 ? 1 : 0,
          failCount: entry.score < 0.5 ? 1 : 0,
          industry: entry.industry,
          persona: entry.persona,
          channel: entry.channel,
          leadId: entry.key.startsWith('lead_') ? undefined : undefined,
        },
      });
    }
  }

  /**
   * Query memory for relevant patterns
   */
  static async query(query: MemoryQuery): Promise<Array<MemoryEntry & { sampleSize: number; useCount: number }>> {
    const where: Record<string, unknown> = {};

    if (query.category) where.category = query.category;
    if (query.industry) where.industry = query.industry;
    if (query.persona) where.persona = query.persona;
    if (query.channel) where.channel = query.channel;
    if (query.minScore) where.score = { gte: query.minScore };

    const results = await db.agentMemory.findMany({
      where,
      orderBy: [
        { score: 'desc' },
        { sampleSize: 'desc' },
      ],
      take: query.limit || 10,
    });

    return results.map(r => ({
      category: r.category as MemoryCategory,
      key: r.key,
      value: JSON.parse(r.value),
      score: r.score,
      industry: r.industry || undefined,
      persona: r.persona || undefined,
      channel: r.channel || undefined,
      sampleSize: r.sampleSize,
      useCount: r.useCount,
    }));
  }

  /**
   * Record feedback — was using this memory item successful or not?
   * This is how the system compounds: every interaction updates memory
   */
  static async recordFeedback(feedback: MemoryFeedback): Promise<void> {
    const existing = await db.agentMemory.findFirst({
      where: { category: feedback.category, key: feedback.key },
    });

    if (existing) {
      const newSuccessCount = existing.successCount + (feedback.wasSuccessful ? 1 : 0);
      const newFailCount = existing.failCount + (feedback.wasSuccessful ? 0 : 1);
      const total = newSuccessCount + newFailCount;
      const newScore = total > 0 ? newSuccessCount / total : existing.score;

      await db.agentMemory.update({
        where: { id: existing.id },
        data: {
          score: newScore,
          successCount: newSuccessCount,
          failCount: newFailCount,
          sampleSize: existing.sampleSize + 1,
          lastUsedAt: new Date(),
          useCount: existing.useCount + 1,
        },
      });
    } else {
      // Create a new memory entry from feedback
      await db.agentMemory.create({
        data: {
          category: feedback.category,
          key: feedback.key,
          value: JSON.stringify({ wasSuccessful: feedback.wasSuccessful }),
          score: feedback.wasSuccessful ? 0.7 : 0.3,
          sampleSize: 1,
          successCount: feedback.wasSuccessful ? 1 : 0,
          failCount: feedback.wasSuccessful ? 0 : 1,
          industry: feedback.industry,
          persona: feedback.persona,
          channel: feedback.channel,
        },
      });
    }
  }

  /**
   * Record a campaign outcome — this is the most valuable feedback
   */
  static async recordCampaignOutcome(data: {
    campaignId: string;
    campaignName: string;
    industry?: string;
    persona?: string;
    channel: string;
    totalSent: number;
    totalReplies: number;
    totalInterested: number;
    topHook?: string;
    topOffer?: string;
    topSignalType?: string;
  }): Promise<void> {
    const replyRate = data.totalSent > 0 ? data.totalReplies / data.totalSent : 0;
    const conversionRate = data.totalSent > 0 ? data.totalInterested / data.totalSent : 0;

    // Store campaign result
    await this.store({
      category: 'campaign_result',
      key: `campaign_${data.campaignId}`,
      value: {
        name: data.campaignName,
        replyRate,
        conversionRate,
        totalSent: data.totalSent,
        totalReplies: data.totalReplies,
        totalInterested: data.totalInterested,
        topHook: data.topHook,
        topOffer: data.topOffer,
        topSignalType: data.topSignalType,
      },
      score: conversionRate,
      industry: data.industry,
      persona: data.persona,
      channel: data.channel,
    });

    // Store winning hook if we have one
    if (data.topHook && replyRate > 0.1) {
      await this.store({
        category: 'winning_hook',
        key: `hook_${data.industry || 'general'}_${data.persona || 'general'}_${Date.now()}`,
        value: { hook: data.topHook, replyRate, channel: data.channel },
        score: replyRate,
        industry: data.industry,
        persona: data.persona,
        channel: data.channel,
      });
    }

    // Store signal correlation
    if (data.topSignalType && conversionRate > 0.05) {
      await this.store({
        category: 'signal_correlation',
        key: `signal_${data.topSignalType}_${data.industry || 'general'}`,
        value: { signalType: data.topSignalType, conversionRate, channel: data.channel },
        score: conversionRate,
        industry: data.industry,
        persona: data.persona,
        channel: data.channel,
      });
    }
  }

  /**
   * Get smart recommendations based on accumulated memory
   */
  static async getRecommendations(params: {
    industry?: string;
    persona?: string;
    channel?: string;
  }): Promise<{
    bestHooks: Array<{ hook: string; score: number; sampleSize: number }>;
    bestOffers: Array<{ offer: string; score: number }>;
    bestChannels: Array<{ channel: string; effectiveness: number }>;
    bestSignalTypes: Array<{ signalType: string; conversionRate: number }>;
  }> {
    const [hooks, offers, channels, signals] = await Promise.all([
      this.query({ category: 'winning_hook', industry: params.industry, persona: params.persona, limit: 5, minScore: 0.3 }),
      this.query({ category: 'offer_performance', industry: params.industry, limit: 5, minScore: 0.3 }),
      this.query({ category: 'channel_effectiveness', industry: params.industry, persona: params.persona, limit: 5, minScore: 0.3 }),
      this.query({ category: 'signal_correlation', industry: params.industry, limit: 5, minScore: 0.3 }),
    ]);

    return {
      bestHooks: hooks.map(h => ({
        hook: (h.value as Record<string, string>).hook || h.key,
        score: h.score,
        sampleSize: h.sampleSize,
      })),
      bestOffers: offers.map(o => ({
        offer: (o.value as Record<string, string>).offer || o.key,
        score: o.score,
      })),
      bestChannels: channels.map(c => ({
        channel: (c.value as Record<string, string>).channel || c.channel || 'email',
        effectiveness: c.score,
      })),
      bestSignalTypes: signals.map(s => ({
        signalType: (s.value as Record<string, string>).signalType || s.key,
        conversionRate: s.score,
      })),
    };
  }

  /**
   * Decay old memories — reduce score of unused entries over time
   * Call this periodically (e.g., daily) to keep memory fresh
   */
  static async decayOldMemories(olderThanDays = 90, decayFactor = 0.95): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 86400000);
    const oldMemories = await db.agentMemory.findMany({
      where: { lastUsedAt: { lt: cutoff }, score: { gt: 0.1 } },
    });

    let decayed = 0;
    for (const memory of oldMemories) {
      const newScore = memory.score * decayFactor;
      if (newScore < 0.05) {
        // Remove very low-score memories
        await db.agentMemory.delete({ where: { id: memory.id } });
      } else {
        await db.agentMemory.update({
          where: { id: memory.id },
          data: { score: newScore },
        });
      }
      decayed++;
    }

    return decayed;
  }
}
