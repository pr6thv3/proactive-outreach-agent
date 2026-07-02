import { Lead, Signal, OutreachMessage, ReplyClassification, AgentMemory, Campaign } from '@prisma/client';

export type StrategyName =
  | 'signal-led'
  | 'funding-growth'
  | 'hiring-spike'
  | 'job-change'
  | 'tech-migration'
  | 'traffic-seo-decline'
  | 'competitor-pressure'
  | 'ai-adoption'
  | 'persona-based'
  | 'personalization-hook'
  | 'follow-up'
  | 'breakup'
  | 'reply-driven';

export interface StrategyRecommendation {
  strategy: StrategyName;
  confidence: number;
  reasoning: string;
  signalId?: string;
  budgetAllocation: number; // Send credits required
  eligible: boolean;
}

export interface StrategyContext {
  lead: Lead;
  signals: Signal[];
  previousMessages?: OutreachMessage[];
  replies?: ReplyClassification[];
  memories?: AgentMemory[];
  campaign?: Campaign | null;
  cooldownWindowDays?: number; // overall contact cooldown (default: 3)
  strategyCooldownWindowDays?: number; // duplicate strategy cooldown (default: 30)
}

export interface CooldownCheckResult {
  onCooldown: boolean;
  reason?: string;
}
