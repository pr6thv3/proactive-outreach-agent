// ─── Agent System Types ───────────────────────────────
// Shared types for the Proactive Outreach Agent system

export type Phase = 'observe' | 'think' | 'act' | 'reeval';

export type LeadStatus =
  | 'new'
  | 'enriched'
  | 'scored'
  | 'generated'
  | 'approved'
  | 'sent'
  | 'replied'
  | 'interested'
  | 'negative'
  | 'unsubscribed'
  | (string & {});

export type SignalType =
  | 'pain_point'
  | 'hiring'
  | 'hiring_spike'
  | 'engineering_hiring_spike'
  | 'growth'
  | 'tech_stack'
  | 'tech_stack_migration'
  | 'personalization_hook'
  | 'trigger'
  | 'news'
  | 'funding'
  | 'funding_round'
  | 'expansion'
  | 'traffic_drop'
  | 'product_launch'
  | 'rebranding'
  | 'seo_decline'
  | 'competitor_pressure'
  | 'ai_adoption_signal'
  | 'hiring_sdrs'
  | 'ai_adoption'
  | 'job_change';

export type MessageChannel = 'email' | 'linkedin' | 'twitter' | 'sms' | 'contact_form' | 'voice_note';

export type MessageStatus =
  | 'draft'
  | 'generated'
  | 'approved'
  | 'sent'
  | 'delivered'
  | 'bounced'
  | 'replied';

export type ReplyCategory =
  | 'interested'
  | 'meeting_request'
  | 'question'
  | 'not_interested'
  | 'out_of_office'
  | 'unsubscribe'
  | 'neutral'
  | 'negative'
  | 'needs_info'
  | 'ooo';

export type FollowUpType = 'reminder' | 'value_add' | 'check_in' | 'last_attempt' | 'bump' | 'case_study' | 'breakup';

export type FollowUpSchedule = 'T+3' | 'T+7' | 'T+14';

export type PriorityTier = 'hot' | 'warm' | 'cold';

// ─── Campaign Configuration ───────────────────────────
export interface CampaignConfig {
  goal: string;
  targetAudience: string;
  offer: string;
  senderName: string;
  senderEmail: string;
  tone: string;
  cta: string;
  maxDailySends: number;
  followUpSchedule: number[];
  productDescription: string;
  channels?: MessageChannel[];
  autonomyEnabled?: boolean;
  autonomyMinScore?: number;
}

// ─── Email Sequence ───────────────────────────────────
export interface EmailSequenceItem {
  subject: string;
  body: string;
  sequencePos: number;
  type: 'initial' | 'followup_1' | 'followup_2' | 'followup_3';
  channel?: MessageChannel;
}

export type EmailSequence = EmailSequenceItem[];

// ─── Agent Context ────────────────────────────────────
export interface AgentContext {
  organizationId?: string;
  leadId: string;
  lead: LeadData;
  signals: SignalData[];
  previousMessages: MessageData[];
  campaignId?: string;
  campaignConfig?: CampaignConfig;
  traceId?: string;
  metadata?: Record<string, unknown>;
}

export interface LeadData {
  id: string;
  organizationId?: string;
  name: string;
  email: string;
  company?: string;
  title?: string;
  url?: string;
  linkedinUrl?: string;
  status: LeadStatus;
  source: string;
  emailVerified: boolean;
  isBlacklisted: boolean;
  doNotContact: boolean;
  lastContacted?: Date;
  notes?: string;
  // Scoring
  leadScore?: number;
  signalScore?: number;
  replyProb?: number;
  conversionProb?: number;
  spamRisk?: number;
  priorityTier?: PriorityTier;
  // Autonomy
  autonomyEnabled?: boolean;
  nextActionAt?: Date;
}

export interface SignalData {
  id: string;
  type: SignalType;
  content: string;
  source: string;
  relevance: number;
  confidence: number;
  rawSnippet?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  citationQuality?: 'strong' | 'medium' | 'weak';
  // Signal Intelligence
  urgency?: number;
  reasoning?: string;
  recommendedPitchAngle?: string;
  recommendedOffer?: string;
  decayRate?: number;
  detectedAt?: Date;
  expiresAt?: Date;
}

export interface MessageData {
  id: string;
  subject: string;
  body: string;
  channel: MessageChannel;
  status: MessageStatus;
  strategy?: string;
  angle?: string;
  tone?: string;
  cta?: string;
  sequencePos: number;
  campaignId?: string;
  approvedBy?: string;
  approvedAt?: Date;
  sentAt?: Date;
  // Signal Intelligence Context
  signalTypeUsed?: string;
  urgencyAtGeneration?: number;
  pitchAngleUsed?: string;
  evidenceSnapshot?: unknown;
  // Delivery Tracking
  deliveredAt?: Date;
  bouncedAt?: Date;
  openedAt?: Date;
  clickedAt?: Date;
  repliedAt?: Date;
}

// ─── Scrape Data ──────────────────────────────────────
export interface ScrapeData {
  id: string;
  url: string;
  pageTitle?: string;
  aboutText?: string;
  careersText?: string;
  blogText?: string;
  newsText?: string;
  rawHtml?: string;
  status: 'pending' | 'completed' | 'failed';
  errorMessage?: string;
  scrapedAt?: Date;
  leadId: string;
  createdAt: Date;
}

// ─── Activity Data ────────────────────────────────────
export interface ActivityData {
  id: string;
  type: string;
  description: string;
  metadata?: string;
  phase?: Phase | 'system' | 'autonomy' | 'memory';
  leadId: string;
  createdAt: Date;
}

// ─── Do Not Contact Entry ────────────────────────────
export interface DoNotContactEntry {
  id: string;
  email: string;
  reason?: string;
  source?: string;
  leadId?: string;
  createdAt: Date;
}

// ─── Agent Result ─────────────────────────────────────
export interface AgentResult<T = unknown> {
  success: boolean;
  data: T;
  error?: string;
  durationMs: number;
  agentName: string;
  phase: Phase;
  traceId?: string;
}

// ─── Pipeline State ───────────────────────────────────
export interface PipelineState {
  leadId: string;
  currentPhase: Phase;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'paused';
  observeResult?: AgentResult;
  thinkResult?: AgentResult;
  actResult?: AgentResult;
  reevalResult?: AgentResult;
  errors: Array<{ phase: Phase; message: string; timestamp: Date }>;
  retryCount: number;
  startedAt: Date;
  completedAt?: Date;
  traceId?: string;
  // New fields
  scores?: {
    leadScore: number;
    signalScore: number;
    replyProb: number;
    conversionProb: number;
    spamRisk: number;
    priorityTier: PriorityTier;
  };
  signalIntelligence?: {
    topSignalType: string;
    topUrgency: number;
    recommendedAction: string;
    recommendedChannel: MessageChannel;
  };
}

// ─── Orchestrator Config ──────────────────────────────
export interface OrchestratorConfig {
  maxRetries: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  enableFollowUps: boolean;
  followUpSchedule: FollowUpSchedule[];
  channels: MessageChannel[];
  defaultTone: string;
  // New config options
  enableSignalIntelligence: boolean;
  enableScoring: boolean;
  enableMemoryLearning: boolean;
  enableAutonomy: boolean;
  autonomyMinScore: number;
  autoApproveThreshold: number;
}

export const DEFAULT_CONFIG: OrchestratorConfig = {
  maxRetries: 3,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 30000,
  enableFollowUps: true,
  followUpSchedule: ['T+3', 'T+7', 'T+14'],
  channels: ['email'],
  defaultTone: 'professional',
  enableSignalIntelligence: true,
  enableScoring: true,
  enableMemoryLearning: true,
  enableAutonomy: false,
  autonomyMinScore: 60,
  autoApproveThreshold: 100,
};

// ─── Observe Phase Output ─────────────────────────────
export interface ObserveOutput {
  signals: SignalData[];
  enrichedLead: LeadData;
  scrapeResults: Array<{
    url: string;
    title: string;
    snippets: string[];
  }>;
}

// ─── Think Phase Output ──────────────────────────────
export interface ThinkOutput {
  strategy: string;
  angle: string;
  hook: string;
  subject: string;
  body: string;
  tone: string;
  reasoning: string;
  emailSequence?: EmailSequence;
  cta?: string;
  // Signal Intelligence Context
  signalTypeUsed?: string;
  urgencyAtGeneration?: number;
  pitchAngleUsed?: string;
  recommendedChannel?: MessageChannel;
}

// ─── Act Phase Output ────────────────────────────────
export interface ActOutput {
  messageId: string;
  channel: MessageChannel;
  sentAt?: Date;
  crmLogged: boolean;
  followUpsScheduled: Array<{
    type: FollowUpType;
    scheduledAt: Date;
  }>;
}

// ─── Re-Eval Phase Output ────────────────────────────
export interface ReEvalOutput {
  category: ReplyCategory;
  confidence: number;
  reasoning: string;
  nextAction:
    | 'escalate'
    | 'auto_reply'
    | 'schedule_followup'
    | 'mark_unsub'
    | 'stop_sequence'
    | 'no_action'
    | 'snooze_sequence'
    | 'book_meeting';
  calendarLink?: string;
  suggestedReply?: string;
  returnDate?: Date | string;
  suppressed?: boolean;
  sentiment?: 'very_positive' | 'positive' | 'neutral' | 'negative' | 'hostile';
}

// ─── Lead Ingestion Result ────────────────────────────
export interface LeadIngestionResult {
  created: number;
  updated: number;
  skipped: number;
  dncBlocked: number;
  leads: LeadData[];
  errors: Array<{ email: string; reason: string }>;
}

// ─── Autonomous Cycle Result ──────────────────────────
export interface AutonomousCycleResult {
  discovered: number;
  enriched: number;
  scored: number;
  drafted: number;
  autoApproved: number;
  scheduled: number;
  learned: number;
}
