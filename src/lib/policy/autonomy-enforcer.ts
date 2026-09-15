/**
 * Programmatic Progressive Autonomy Engine
 * Enforces strict, code-level progressive autonomy across 4 tiers:
 * - Level 0: Draft Only (Zero automated execution)
 * - Level 1: Assisted (100% manual review for dispatch)
 * - Level 2: Supervised (Auto-approves High-Confidence >=85, Spam<=0.10)
 * - Level 3: Autonomous (Full Autopilot with hard daily quota caps & circuit breakers)
 */

import {
  AutonomyLevel,
  AutonomyConfig,
  DeterministicPolicyGate,
  PolicyViolationError,
  PolicyViolation,
} from './types';

export { AutonomyLevel };

/**
 * Return operational boundaries for a given Autonomy Level
 */
export function getAutonomyConfig(level: AutonomyLevel): AutonomyConfig {
  switch (level) {
    case AutonomyLevel.LEVEL_0_DRAFT:
      return {
        level,
        autoApproveThreshold: 100, // Never auto-approves
        maxSpamRiskThreshold: 0.0,
        maxDailySends: 0,
        circuitBreakerBounceThreshold: 0.03,
        circuitBreakerComplaintThreshold: 0.001,
      };
    case AutonomyLevel.LEVEL_1_ASSISTED:
      return {
        level,
        autoApproveThreshold: 100, // Never auto-approves (requires manual review)
        maxSpamRiskThreshold: 0.10,
        maxDailySends: 50,
        circuitBreakerBounceThreshold: 0.03,
        circuitBreakerComplaintThreshold: 0.001,
      };
    case AutonomyLevel.LEVEL_2_SUPERVISED:
      return {
        level,
        autoApproveThreshold: 85, // Only high confidence (>= 85)
        maxSpamRiskThreshold: 0.10,
        maxDailySends: 100,
        circuitBreakerBounceThreshold: 0.03,
        circuitBreakerComplaintThreshold: 0.001,
      };
    case AutonomyLevel.LEVEL_3_AUTONOMOUS:
      return {
        level,
        autoApproveThreshold: 60, // Autonomous above base minimum threshold
        maxSpamRiskThreshold: 0.25,
        maxDailySends: 250,
        circuitBreakerBounceThreshold: 0.03,
        circuitBreakerComplaintThreshold: 0.001,
      };
    default:
      return {
        level: AutonomyLevel.LEVEL_1_ASSISTED,
        autoApproveThreshold: 100,
        maxSpamRiskThreshold: 0.10,
        maxDailySends: 50,
        circuitBreakerBounceThreshold: 0.03,
        circuitBreakerComplaintThreshold: 0.001,
      };
  }
}

/**
 * Map arbitrary inputs (string, number, enum) into valid AutonomyLevel enum
 */
export function mapStringToAutonomyLevel(levelInput?: string | number | null): AutonomyLevel {
  if (levelInput === undefined || levelInput === null) {
    return AutonomyLevel.LEVEL_1_ASSISTED;
  }

  if (typeof levelInput === 'number') {
    if (levelInput >= 0 && levelInput <= 3) {
      return levelInput as AutonomyLevel;
    }
    return AutonomyLevel.LEVEL_1_ASSISTED;
  }

  const str = String(levelInput).trim().toUpperCase();
  if (str === '0' || str === 'LEVEL_0' || str === 'LEVEL_0_DRAFT' || str === 'DRAFT') {
    return AutonomyLevel.LEVEL_0_DRAFT;
  }
  if (str === '1' || str === 'LEVEL_1' || str === 'LEVEL_1_ASSISTED' || str === 'ASSISTED') {
    return AutonomyLevel.LEVEL_1_ASSISTED;
  }
  if (str === '2' || str === 'LEVEL_2' || str === 'LEVEL_2_SUPERVISED' || str === 'SUPERVISED') {
    return AutonomyLevel.LEVEL_2_SUPERVISED;
  }
  if (str === '3' || str === 'LEVEL_3' || str === 'LEVEL_3_AUTONOMOUS' || str === 'AUTONOMOUS' || str === 'AUTOPILOT') {
    return AutonomyLevel.LEVEL_3_AUTONOMOUS;
  }

  return AutonomyLevel.LEVEL_1_ASSISTED;
}

/**
 * Classify a prospect or draft into a confidence tier
 */
export function classifyConfidenceTier(
  leadScore: number,
  spamRisk: number = 0,
  riskScore: number = 0
): 'high' | 'medium' | 'attention' {
  if (spamRisk > 0.20 || riskScore >= 40 || leadScore < 60) {
    return 'attention';
  }
  if (leadScore >= 85 && spamRisk <= 0.10 && riskScore < 20) {
    return 'high';
  }
  return 'medium';
}

/**
 * Deterministically evaluate whether an action can execute autonomously
 * without human operator intervention.
 */
export function canExecuteAutonomously(params: {
  level: AutonomyLevel;
  leadScore: number;
  riskScore?: number;
  spamRisk?: number;
  autoApproveThreshold?: number;
  domainVerified?: boolean;
  withinQuota?: boolean;
}): { allowed: boolean; reason?: string } {
  const {
    level,
    leadScore,
    riskScore = 0,
    spamRisk = 0,
    autoApproveThreshold,
    domainVerified = true,
    withinQuota = true,
  } = params;

  if (level === AutonomyLevel.LEVEL_0_DRAFT) {
    return {
      allowed: false,
      reason: 'Level 0 (Draft) strictly prohibits automated execution; manual operator review required.',
    };
  }

  if (level === AutonomyLevel.LEVEL_1_ASSISTED) {
    return {
      allowed: false,
      reason: 'Level 1 (Assisted) requires explicit human sign-off on every outbound communication.',
    };
  }

  if (withinQuota === false) {
    return {
      allowed: false,
      reason: 'Daily or hourly send quota exceeded. Action routed to queue for operator review.',
    };
  }

  if (domainVerified === false) {
    return {
      allowed: false,
      reason: 'Sending domain is not fully verified (SPF/DKIM/DMARC pending). Autonomous dispatch blocked.',
    };
  }

  if (level === AutonomyLevel.LEVEL_2_SUPERVISED) {
    const requiredScore = Math.max(85, autoApproveThreshold ?? 85);
    if (leadScore < requiredScore) {
      return {
        allowed: false,
        reason: `Level 2 (Supervised) requires human review for lead score (${leadScore}) below high-confidence threshold (${requiredScore}).`,
      };
    }
    if (spamRisk > 0.10) {
      return {
        allowed: false,
        reason: `Level 2 (Supervised) routes messages with spam risk (${(spamRisk * 100).toFixed(1)}% > 10.0%) to review queue.`,
      };
    }
    if (riskScore > 20) {
      return {
        allowed: false,
        reason: `Level 2 (Supervised) routes messages with composite risk score (${riskScore} > 20) to review queue.`,
      };
    }
    return { allowed: true };
  }

  if (level === AutonomyLevel.LEVEL_3_AUTONOMOUS) {
    const minThreshold = autoApproveThreshold ?? 60;
    if (leadScore < minThreshold) {
      return {
        allowed: false,
        reason: `Lead score (${leadScore}) below configured autonomy threshold (${minThreshold}).`,
      };
    }
    if (spamRisk > 0.25) {
      return {
        allowed: false,
        reason: `Level 3 (Autonomous) blocks messages with critical spam risk (${(spamRisk * 100).toFixed(1)}% > 25.0%).`,
      };
    }
    if (riskScore >= 40) {
      return {
        allowed: false,
        reason: `Level 3 (Autonomous) triggered circuit breaker or high risk score (${riskScore} >= 40).`,
      };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: 'Unknown or unsupported autonomy level.' };
}

/**
 * Assert autonomy permissions and throw PolicyViolationError if unauthorized
 */
export function assertAutonomyPermission(
  action: 'draft' | 'approve' | 'dispatch' | 'auto_approve',
  level: AutonomyLevel,
  context: {
    leadScore?: number;
    spamRisk?: number;
    riskScore?: number;
    autoApproveThreshold?: number;
    domainVerified?: boolean;
    withinQuota?: boolean;
  } = {}
): void {
  // Drafting is allowed at all levels
  if (action === 'draft') {
    return;
  }

  // Level 0: prohibits any auto execution, auto-approval, or dispatch
  if (level === AutonomyLevel.LEVEL_0_DRAFT) {
    if (action === 'auto_approve' || action === 'dispatch') {
      const violation: PolicyViolation = {
        policyId: 'LEVEL_0_PROHIBITS_AUTO_EXECUTION',
        gate: DeterministicPolicyGate.AUTONOMY_LEVEL_PERMISSION,
        severity: 'fatal',
        reason: 'Workspace is operating under Level 0 (Draft Only). Automated approvals and dispatches are forbidden in code.',
        remediationAction: 'Upgrade workspace to Level 1, 2, or 3, or manually approve and dispatch from Review Deck.',
      };
      throw new PolicyViolationError('LEVEL_0_PROHIBITS_AUTO_EXECUTION', violation.reason, violation.gate, [violation]);
    }
  }

  // Level 1: prohibits auto-approval
  if (level === AutonomyLevel.LEVEL_1_ASSISTED) {
    if (action === 'auto_approve') {
      const violation: PolicyViolation = {
        policyId: 'LEVEL_1_PROHIBITS_AUTO_APPROVAL',
        gate: DeterministicPolicyGate.AUTONOMY_LEVEL_PERMISSION,
        severity: 'fatal',
        reason: 'Level 1 (Assisted) strictly requires human sign-off on 100% of outbound communications.',
        remediationAction: 'Route item to Review Deck for manual confirmation, or upgrade to Level 2 (Supervised).',
      };
      throw new PolicyViolationError('LEVEL_1_PROHIBITS_AUTO_APPROVAL', violation.reason, violation.gate, [violation]);
    }
  }

  // Auto-approval checks for Level 2 and Level 3
  if (action === 'auto_approve' || action === 'dispatch') {
    const check = canExecuteAutonomously({
      level,
      leadScore: context.leadScore ?? 0,
      riskScore: context.riskScore ?? 0,
      spamRisk: context.spamRisk ?? 0,
      autoApproveThreshold: context.autoApproveThreshold,
      domainVerified: context.domainVerified,
      withinQuota: context.withinQuota,
    });

    if (!check.allowed) {
      const violation: PolicyViolation = {
        policyId: 'AUTONOMY_PERMISSION_DENIED',
        gate: DeterministicPolicyGate.AUTONOMY_LEVEL_PERMISSION,
        severity: 'fatal',
        reason: check.reason || 'Autonomous execution denied by progressive autonomy engine.',
        remediationAction: 'Hold message in WAITING_APPROVAL state and display in Review Deck.',
      };
      throw new PolicyViolationError('AUTONOMY_PERMISSION_DENIED', violation.reason, violation.gate, [violation]);
    }
  }
}
