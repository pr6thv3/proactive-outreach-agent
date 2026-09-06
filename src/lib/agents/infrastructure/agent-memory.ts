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
  | 'offer_performance'    // Which offers convert best
  | 'human_feedback'        // Notes and approval feedback
  | 'pitch_rejection'       // Rejected angles and strategies
  | 'rejection_reason'      // Reason feedback on rejected outreach
  | 'regeneration_prompt';  // Prompts and directives from regeneration requests

export interface MemoryEntry {
  organizationId?: string;
  category: MemoryCategory;
  key: string;
  value: Record<string, unknown>;
  score: number;          // 0-1 effectiveness
  industry?: string;
  persona?: string;
  channel?: string;
}

export interface MemoryQuery {
  organizationId?: string;
  category?: MemoryCategory;
  key?: string;
  industry?: string;
  persona?: string;
  channel?: string;
  minScore?: number;
  limit?: number;
}

export interface MemoryFeedback {
  organizationId?: string;
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
      where: { category: entry.category, key: entry.key, ...(entry.organizationId ? { organizationId: entry.organizationId } : {}) },
    });

    if (existingKey) {
      let existingVal: Record<string, any> = {};
      try {
        existingVal = typeof existingKey.value === 'string' ? JSON.parse(existingKey.value) : existingKey.value || {};
      } catch {}

      const oldSampleSize = (existingVal.sampleSize ?? 1) as number;
      const oldSuccessCount = (existingVal.successCount ?? (existingKey.score >= 0.5 ? 1 : 0)) as number;
      const oldFailCount = (existingVal.failCount ?? (existingKey.score < 0.5 ? 1 : 0)) as number;
      const oldUseCount = (existingVal.useCount ?? 1) as number;

      const newSampleSize = oldSampleSize + 1;
      const blendedScore = (existingKey.score * oldSampleSize + entry.score) / newSampleSize;
      const newSuccessCount = oldSuccessCount + (entry.score >= 0.5 ? 1 : 0);
      const newFailCount = oldFailCount + (entry.score < 0.5 ? 1 : 0);

      const mergedValue = {
        ...(typeof entry.value === 'object' ? entry.value : {}),
        industry: entry.industry || existingVal.industry,
        persona: entry.persona || existingVal.persona,
        channel: entry.channel || existingVal.channel,
        sampleSize: newSampleSize,
        successCount: newSuccessCount,
        failCount: newFailCount,
        useCount: oldUseCount + 1,
        lastUsedAt: new Date().toISOString(),
      };

      await db.agentMemory.update({
        where: { id: existingKey.id },
        data: {
          value: JSON.stringify(mergedValue),
          score: blendedScore,
        },
      });
    } else {
      const initialValue = {
        ...(typeof entry.value === 'object' ? entry.value : {}),
        industry: entry.industry,
        persona: entry.persona,
        channel: entry.channel,
        sampleSize: 1,
        successCount: entry.score >= 0.5 ? 1 : 0,
        failCount: entry.score < 0.5 ? 1 : 0,
        useCount: 1,
        lastUsedAt: new Date().toISOString(),
      };

      await db.agentMemory.create({
        data: {
          category: entry.category,
          organizationId: entry.organizationId,
          key: entry.key,
          value: JSON.stringify(initialValue),
          score: entry.score,
        },
      });
    }
  }

  /**
   * Query memory for relevant patterns
   */
  static async query(query: MemoryQuery): Promise<Array<MemoryEntry & { sampleSize: number; useCount: number }>> {
    const where: Record<string, unknown> = {};

    if (query.organizationId) where.organizationId = query.organizationId;
    if (query.category) where.category = query.category;
    if (query.key) where.key = query.key;
    if (query.minScore) where.score = { gte: query.minScore };

    const results = await db.agentMemory.findMany({
      where,
      orderBy: [
        { score: 'desc' },
      ],
      take: (query.limit || 10) * 3,
    });

    const parsed = results.map((r: any) => {
      let parsedVal: Record<string, any> = {};
      try {
        parsedVal = typeof r.value === 'string' ? JSON.parse(r.value) : r.value || {};
      } catch {}

      return {
        category: r.category as MemoryCategory,
        key: r.key,
        value: parsedVal,
        score: r.score,
        industry: parsedVal.industry || undefined,
        persona: parsedVal.persona || undefined,
        channel: parsedVal.channel || undefined,
        sampleSize: parsedVal.sampleSize ?? 1,
        useCount: parsedVal.useCount ?? 1,
      };
    });

    const filtered = parsed.filter((item: any) => {
      if (query.industry && item.industry && item.industry !== query.industry) return false;
      if (query.persona && item.persona && item.persona !== query.persona) return false;
      if (query.channel && item.channel && item.channel !== query.channel) return false;
      return true;
    });

    return filtered.slice(0, query.limit || 10);
  }

  /**
   * Alias for query to support compatibility
   */
  static async retrieveRelevantMemories(params: any): Promise<any[]> {
    return this.query(params);
  }

  /**
   * Record feedback — was using this memory item successful or not?
   * This is how the system compounds: every interaction updates memory
   */
  static async recordFeedback(feedback: MemoryFeedback): Promise<void> {
    const existing = await db.agentMemory.findFirst({
      where: { category: feedback.category, key: feedback.key, ...(feedback.organizationId ? { organizationId: feedback.organizationId } : {}) },
    });

    if (existing) {
      let existingVal: Record<string, any> = {};
      try {
        existingVal = typeof existing.value === 'string' ? JSON.parse(existing.value) : existing.value || {};
      } catch {}

      const oldSuccessCount = (existingVal.successCount ?? (existing.score >= 0.5 ? 1 : 0)) as number;
      const oldFailCount = (existingVal.failCount ?? (existing.score < 0.5 ? 1 : 0)) as number;
      const oldSampleSize = (existingVal.sampleSize ?? 1) as number;
      const oldUseCount = (existingVal.useCount ?? 1) as number;

      const newSuccessCount = oldSuccessCount + (feedback.wasSuccessful ? 1 : 0);
      const newFailCount = oldFailCount + (feedback.wasSuccessful ? 0 : 1);
      const total = newSuccessCount + newFailCount;
      const newScore = total > 0 ? newSuccessCount / total : existing.score;

      const updatedVal = {
        ...existingVal,
        successCount: newSuccessCount,
        failCount: newFailCount,
        sampleSize: oldSampleSize + 1,
        useCount: oldUseCount + 1,
        lastUsedAt: new Date().toISOString(),
      };

      await db.agentMemory.update({
        where: { id: existing.id },
        data: {
          value: JSON.stringify(updatedVal),
          score: newScore,
        },
      });
    } else {
      // Create a new memory entry from feedback
      const initialVal = {
        wasSuccessful: feedback.wasSuccessful,
        industry: feedback.industry,
        persona: feedback.persona,
        channel: feedback.channel,
        sampleSize: 1,
        successCount: feedback.wasSuccessful ? 1 : 0,
        failCount: feedback.wasSuccessful ? 0 : 1,
        useCount: 1,
        lastUsedAt: new Date().toISOString(),
      };

      await db.agentMemory.create({
        data: {
          category: feedback.category,
          organizationId: feedback.organizationId,
          key: feedback.key,
          value: JSON.stringify(initialVal),
          score: feedback.wasSuccessful ? 0.7 : 0.3,
        },
      });
    }
  }

  /**
   * Record a campaign outcome — this is the most valuable feedback
   */
  static async recordCampaignOutcome(data: {
    organizationId?: string;
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
      organizationId: data.organizationId,
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
        organizationId: data.organizationId,
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
        organizationId: data.organizationId,
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
    organizationId?: string;
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
      this.query({ organizationId: params.organizationId, category: 'winning_hook', industry: params.industry, persona: params.persona, limit: 5, minScore: 0.3 }),
      this.query({ organizationId: params.organizationId, category: 'offer_performance', industry: params.industry, limit: 5, minScore: 0.3 }),
      this.query({ organizationId: params.organizationId, category: 'channel_effectiveness', industry: params.industry, persona: params.persona, limit: 5, minScore: 0.3 }),
      this.query({ organizationId: params.organizationId, category: 'signal_correlation', industry: params.industry, limit: 5, minScore: 0.3 }),
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
      where: { updatedAt: { lt: cutoff }, score: { gt: 0.1 } },
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
