/**
 * Human Autonomy Operating Modes (R1)
 * Replaces raw numeric levels (L0–L3) in user-facing UI, API, and documentation with
 * 3 plain-English operating modes:
 * - "Review Everything" (maps to LEVEL_0_DRAFT / LEVEL_1_ASSISTED)
 * - "Review Exceptions" (maps to LEVEL_2_SUPERVISED)
 * - "Auto-Run" (maps to LEVEL_3_AUTONOMOUS)
 */

import { AutonomyLevel } from './types';

export type HumanAutonomyMode = 'Review Everything' | 'Review Exceptions' | 'Auto-Run';

export type PrismaAutonomyLevel = 'LEVEL_0_DRAFT' | 'LEVEL_1_ASSISTED' | 'LEVEL_2_SUPERVISED' | 'LEVEL_3_AUTONOMOUS';

export function mapLevelToPrisma(level: AutonomyLevel | number | string): PrismaAutonomyLevel {
  const mode = mapAutonomyLevelToMode(level);
  if (mode === 'Review Everything') {
    const str = String(level);
    if (str === '0' || str.toUpperCase().includes('LEVEL_0')) return 'LEVEL_0_DRAFT';
    return 'LEVEL_1_ASSISTED';
  }
  if (mode === 'Review Exceptions') return 'LEVEL_2_SUPERVISED';
  if (mode === 'Auto-Run') return 'LEVEL_3_AUTONOMOUS';
  return 'LEVEL_1_ASSISTED';
}

export const HUMAN_AUTONOMY_MODES: Record<string, HumanAutonomyMode> = {
  REVIEW_EVERYTHING: 'Review Everything',
  REVIEW_EXCEPTIONS: 'Review Exceptions',
  AUTO_RUN: 'Auto-Run',
};

export interface HumanModeConfig {
  mode: HumanAutonomyMode;
  level: AutonomyLevel;
  label: string;
  tagline: string;
  description: string;
  recommendedFor: string;
  boundaries: {
    autoApproveThreshold: number;
    maxSpamRiskThreshold: number;
    requiresOperatorSignoff: boolean;
    quotaBehavior: string;
  };
  badgeVariant: 'secondary' | 'outline' | 'default';
}

/**
 * Maps code-level AutonomyLevel (or numeric / string representation) to human-centered mode.
 */
export function mapAutonomyLevelToMode(level?: AutonomyLevel | number | string | null): HumanAutonomyMode {
  if (level === undefined || level === null) {
    return 'Review Everything';
  }

  if (typeof level === 'number') {
    if (level === 0 || level === 1) return 'Review Everything';
    if (level === 2) return 'Review Exceptions';
    if (level === 3) return 'Auto-Run';
    return 'Review Everything';
  }

  const str = String(level).trim();
  if (
    str === 'Review Everything' ||
    str.toUpperCase() === 'LEVEL_0_DRAFT' ||
    str.toUpperCase() === 'LEVEL_1_ASSISTED' ||
    str.toUpperCase() === 'REVIEW_EVERYTHING' ||
    str === '0' ||
    str === '1' ||
    str.toLowerCase() === 'draft' ||
    str.toLowerCase() === 'assisted'
  ) {
    return 'Review Everything';
  }

  if (
    str === 'Review Exceptions' ||
    str.toUpperCase() === 'LEVEL_2_SUPERVISED' ||
    str.toUpperCase() === 'REVIEW_EXCEPTIONS' ||
    str === '2' ||
    str.toLowerCase() === 'supervised'
  ) {
    return 'Review Exceptions';
  }

  if (
    str === 'Auto-Run' ||
    str.toUpperCase() === 'LEVEL_3_AUTONOMOUS' ||
    str.toUpperCase() === 'AUTO_RUN' ||
    str.toLowerCase() === 'autorun' ||
    str === '3' ||
    str.toLowerCase() === 'autonomous' ||
    str.toLowerCase() === 'autopilot'
  ) {
    return 'Auto-Run';
  }

  return 'Review Everything';
}

/**
 * Maps a human-centered mode string to code-level AutonomyLevel enum.
 */
export function mapModeToAutonomyLevel(mode?: HumanAutonomyMode | string | null): AutonomyLevel {
  if (!mode) {
    return AutonomyLevel.LEVEL_1_ASSISTED;
  }

  const normalized = String(mode).trim();
  if (
    normalized === 'Review Everything' ||
    normalized.toUpperCase() === 'REVIEW_EVERYTHING' ||
    normalized.toUpperCase() === 'LEVEL_1_ASSISTED' ||
    normalized.toLowerCase() === 'assisted'
  ) {
    return AutonomyLevel.LEVEL_1_ASSISTED;
  }

  if (normalized.toUpperCase() === 'LEVEL_0_DRAFT' || normalized.toLowerCase() === 'draft') {
    return AutonomyLevel.LEVEL_0_DRAFT;
  }

  if (
    normalized === 'Review Exceptions' ||
    normalized.toUpperCase() === 'REVIEW_EXCEPTIONS' ||
    normalized.toUpperCase() === 'LEVEL_2_SUPERVISED' ||
    normalized.toLowerCase() === 'supervised'
  ) {
    return AutonomyLevel.LEVEL_2_SUPERVISED;
  }

  if (
    normalized === 'Auto-Run' ||
    normalized.toUpperCase() === 'AUTO_RUN' ||
    normalized.toLowerCase() === 'autorun' ||
    normalized.toUpperCase() === 'LEVEL_3_AUTONOMOUS' ||
    normalized.toLowerCase() === 'autonomous' ||
    normalized.toLowerCase() === 'autopilot'
  ) {
    return AutonomyLevel.LEVEL_3_AUTONOMOUS;
  }

  return AutonomyLevel.LEVEL_1_ASSISTED;
}

/**
 * Returns comprehensive metadata and operational boundaries for an operating mode.
 */
export function getHumanModeDetails(modeInput: HumanAutonomyMode | AutonomyLevel | string): HumanModeConfig {
  const mode = typeof modeInput === 'string' && (modeInput === 'Review Everything' || modeInput === 'Review Exceptions' || modeInput === 'Auto-Run')
    ? (modeInput as HumanAutonomyMode)
    : mapAutonomyLevelToMode(modeInput);

  switch (mode) {
    case 'Review Everything':
      return {
        mode: 'Review Everything',
        level: AutonomyLevel.LEVEL_1_ASSISTED,
        label: 'Review Everything',
        tagline: '100% human sign-off on all outbound touches',
        description: 'AI discovers, enriches, and drafts personalized outreach, but never dispatches without explicit operator review.',
        recommendedFor: 'Recommended for Day 1 pilots, sensitive enterprise accounts, and regulated compliance sectors.',
        boundaries: {
          autoApproveThreshold: 100, // Never auto-approves
          maxSpamRiskThreshold: 0.10,
          requiresOperatorSignoff: true,
          quotaBehavior: 'Drafts held in review queue until approved',
        },
        badgeVariant: 'secondary',
      };

    case 'Review Exceptions':
      return {
        mode: 'Review Exceptions',
        level: AutonomyLevel.LEVEL_2_SUPERVISED,
        label: 'Review Exceptions',
        tagline: 'Supervised velocity with exception routing',
        description: 'High-confidence leads (score ≥ 85, spam risk ≤ 10%) dispatch automatically. Ambiguous leads, unverified domains, and compliance risks route to the Exception Queue.',
        recommendedFor: 'Standard outbound campaigns seeking high velocity with rigorous safety guardrails.',
        boundaries: {
          autoApproveThreshold: 85,
          maxSpamRiskThreshold: 0.10,
          requiresOperatorSignoff: false,
          quotaBehavior: 'High confidence auto-dispatched; exceptions queued',
        },
        badgeVariant: 'outline',
      };

    case 'Auto-Run':
      return {
        mode: 'Auto-Run',
        level: AutonomyLevel.LEVEL_3_AUTONOMOUS,
        label: 'Auto-Run',
        tagline: 'Continuous autonomous AI SDR autopilot',
        description: 'Continuous autonomous discovery, scoring, drafting, and dispatch within daily send limits and circuit breakers.',
        recommendedFor: 'Mature outbound workflows with established domain reputation and verified ICP.',
        boundaries: {
          autoApproveThreshold: 60,
          maxSpamRiskThreshold: 0.25,
          requiresOperatorSignoff: false,
          quotaBehavior: 'Autonomous dispatch within daily quota and circuit breakers',
        },
        badgeVariant: 'default',
      };
  }
}

/**
 * Returns all three human-centered operating modes with their configuration details.
 */
export function getAllHumanModes(): HumanModeConfig[] {
  return [
    getHumanModeDetails('Review Everything'),
    getHumanModeDetails('Review Exceptions'),
    getHumanModeDetails('Auto-Run'),
  ];
}

/**
 * Deterministically evaluates whether a lead/email can be dispatched under a human autonomy mode.
 */
export function evaluateAutonomyPermission(params: {
  mode: HumanAutonomyMode | string;
  leadScore: number;
  spamRisk: number;
  riskScore?: number;
  minLeadScore?: number;
}): { allowed: boolean; reason?: string; requiresHumanReview: boolean } {
  const mode = mapAutonomyLevelToMode(params.mode);
  const minScore = params.minLeadScore ?? 60;
  const riskScore = params.riskScore ?? 0;

  if (mode === 'Review Everything') {
    return {
      allowed: false,
      requiresHumanReview: true,
      reason: 'Review Everything mode requires mandatory operator sign-off before any outbound dispatch.',
    };
  }

  if (mode === 'Review Exceptions') {
    if (params.leadScore < 85) {
      return {
        allowed: false,
        requiresHumanReview: true,
        reason: `Lead score (${params.leadScore}) is below Supervised threshold (85). Routing to Exception Queue.`,
      };
    }
    if (params.spamRisk > 0.10) {
      return {
        allowed: false,
        requiresHumanReview: true,
        reason: `Spam risk (${(params.spamRisk * 100).toFixed(1)}%) exceeds safety boundary (10%). Routing to Exception Queue.`,
      };
    }
    if (riskScore > 20) {
      return {
        allowed: false,
        requiresHumanReview: true,
        reason: `Risk score (${riskScore}) exceeds safe threshold (20). Routing to Exception Queue.`,
      };
    }
    return { allowed: true, requiresHumanReview: false };
  }

  if (mode === 'Auto-Run') {
    if (params.leadScore < minScore) {
      return {
        allowed: false,
        requiresHumanReview: true,
        reason: `Lead score (${params.leadScore}) below configured minimum threshold (${minScore}).`,
      };
    }
    if (params.spamRisk > 0.25) {
      return {
        allowed: false,
        requiresHumanReview: true,
        reason: `Elevated spam risk (${(params.spamRisk * 100).toFixed(1)}%) exceeds hard ceiling (25%).`,
      };
    }
    if (riskScore >= 40) {
      return {
        allowed: false,
        requiresHumanReview: true,
        reason: `Composite risk score (${riskScore}) exceeds circuit breaker threshold (40).`,
      };
    }
    return { allowed: true, requiresHumanReview: false };
  }

  return { allowed: false, requiresHumanReview: true, reason: 'Unknown autonomy mode.' };
}
