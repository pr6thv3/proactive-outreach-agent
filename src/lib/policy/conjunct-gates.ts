// ─── 7-DIMENSION CONJUNCT POLICY GATE ENGINE ─────────────────────────
// Non-negotiable pilot guardrail (R2).
// Enforces full conjunct policy gating for auto-dispatch:
// AutonomyPermission AND CampaignPolicy AND RecipientPolicy AND
// SenderPolicy AND ContentPolicy AND DeliverabilityPolicy AND ConfidencePolicy.
//
// AXIOM: Authorized is strictly TRUE IF AND ONLY IF all 7 dimensions
// evaluate to allowed: true. Model confidence score alone must NEVER
// authorize sending under any circumstances.
// ─────────────────────────────────────────────────────────────────────

export type HumanAutonomyMode = 'Review Everything' | 'Review Exceptions' | 'Auto-Run';

export interface AutonomyEvaluationInput {
  mode: HumanAutonomyMode | string;
  leadScore: number;
  spamRisk: number;
  riskScore: number;
}

export interface AutonomyEvaluationResult {
  allowed: boolean;
  reason?: string;
  mode: string;
}

/**
 * Validates autonomy permissions based on the human operating mode and lead risk boundaries.
 */
export function evaluateAutonomyPermission(input: AutonomyEvaluationInput): AutonomyEvaluationResult {
  const { mode, leadScore, spamRisk, riskScore } = input;
  const modeStr = String(mode);

  if (
    modeStr === 'Review Everything' ||
    modeStr === 'LEVEL_0' ||
    modeStr === 'LEVEL_1' ||
    modeStr === 'LEVEL_0_DRAFT' ||
    modeStr === 'LEVEL_1_ASSISTED'
  ) {
    return {
      allowed: false,
      reason: 'Operating in Review Everything mode; all outbound dispatches require explicit human approval.',
      mode: modeStr,
    };
  }

  if (
    modeStr === 'Review Exceptions' ||
    modeStr === 'LEVEL_2' ||
    modeStr === 'LEVEL_2_SUPERVISED'
  ) {
    if (leadScore < 85.0) {
      return {
        allowed: false,
        reason: `Lead score (${leadScore}) is below threshold (85.0) for exception-only review; routing to operator queue.`,
        mode: modeStr,
      };
    }
    if (spamRisk > 0.10) {
      return {
        allowed: false,
        reason: `Content spam risk (${spamRisk}) exceeds threshold (0.10) for exception-only review.`,
        mode: modeStr,
      };
    }
    if (riskScore > 0.15) {
      return {
        allowed: false,
        reason: `Overall risk score (${riskScore}) exceeds threshold (0.15); flagged for human review.`,
        mode: modeStr,
      };
    }
    return { allowed: true, mode: modeStr };
  }

  if (
    modeStr === 'Auto-Run' ||
    modeStr === 'LEVEL_3' ||
    modeStr === 'LEVEL_3_AUTONOMOUS'
  ) {
    if (spamRisk > 0.15) {
      return {
        allowed: false,
        reason: `Content spam risk (${spamRisk}) exceeds hard safety ceiling (0.15) even in Auto-Run.`,
        mode: modeStr,
      };
    }
    if (riskScore > 0.20) {
      return {
        allowed: false,
        reason: `Risk score (${riskScore}) exceeds hard ceiling (0.20) even in Auto-Run.`,
        mode: modeStr,
      };
    }
    return { allowed: true, mode: modeStr };
  }

  return {
    allowed: false,
    reason: `Unknown autonomy mode: ${modeStr}`,
    mode: modeStr,
  };
}

/**
 * Validates recipient email syntax and screens for disposable email domains.
 */
export function validateRecipientEmail(email: string): { valid: boolean; reason?: string } {
  if (!email || typeof email !== 'string') {
    return { valid: false, reason: 'Recipient email address is missing or empty' };
  }

  const clean = email.trim().toLowerCase();
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(clean)) {
    return { valid: false, reason: 'Recipient email address has invalid format' };
  }

  const parts = clean.split('@');
  const domain = parts[1];
  const disposableDomains = new Set([
    'mailinator.com',
    'tempmail.com',
    'guerrillamail.com',
    '10minutemail.com',
    'throwawaymail.com',
    'yopmail.com',
    'trashmail.com',
    'sharklasers.com',
    'getairmail.com',
    'dispostable.com',
  ]);

  if (disposableDomains.has(domain)) {
    return { valid: false, reason: `Recipient email domain (${domain}) is a disposable inbox` };
  }

  return { valid: true };
}

export interface ConjunctGatingParams {
  autonomyMode: HumanAutonomyMode | string;
  leadScore: number;
  riskScore: number;
  campaignStatus: 'ACTIVE' | 'PAUSED' | 'DRAFT' | string;
  dailySendsCount: number;
  maxDailySends: number;
  recipientEmail: string;
  isRecipientSuppressed: boolean;
  senderDomain: string;
  isSenderDomainVerified: boolean;
  contentSpamScore: number;
  bodyText: string;
  domainBounceRate: number;
  domainComplaintRate: number;
  circuitBreakerBounceThreshold?: number;
  circuitBreakerComplaintThreshold?: number;
  modelConfidence: number;
  minConfidenceThreshold?: number;
  // Contextual trace fields
  organizationId?: string;
  campaignId?: string;
  leadId?: string;
  messageId?: string;
  traceId?: string;
}

export interface ConjunctGatingResult {
  authorized: boolean; // Strictly true iff ALL 7 dimensions pass
  dimensions: {
    autonomyPermission: { allowed: boolean; reason?: string; mode: string };
    campaignPolicy: { allowed: boolean; reason?: string };
    recipientPolicy: { allowed: boolean; reason?: string; isSuppressed: boolean };
    senderPolicy: { allowed: boolean; reason?: string };
    contentPolicy: { allowed: boolean; reason?: string };
    deliverabilityPolicy: { allowed: boolean; reason?: string };
    confidencePolicy: { allowed: boolean; reason?: string; score: number };
  };
  failureReasons: string[];
  evaluatedAt: string;
  traceId?: string;
}

/**
 * Evaluates all 7 policy dimensions in conjunction.
 *
 * Formula:
 * Authorized = AutonomyPermission ∧ CampaignPolicy ∧ RecipientPolicy ∧
 *              SenderPolicy ∧ ContentPolicy ∧ DeliverabilityPolicy ∧ ConfidencePolicy
 *
 * Confidence score alone NEVER authorizes sending.
 */
export async function evaluateConjunctDispatchGate(
  params: ConjunctGatingParams
): Promise<ConjunctGatingResult> {
  const failureReasons: string[] = [];

  // ── Dimension 1: Autonomy Permission
  const autonomy = evaluateAutonomyPermission({
    mode: params.autonomyMode,
    leadScore: params.leadScore,
    spamRisk: params.contentSpamScore,
    riskScore: params.riskScore,
  });
  if (!autonomy.allowed) {
    failureReasons.push(`AutonomyPermission: ${autonomy.reason}`);
  }

  // ── Dimension 2: Campaign Policy
  const campaignActive = params.campaignStatus === 'ACTIVE';
  const underDailyLimit = params.dailySendsCount < params.maxDailySends;
  const campaignAllowed = campaignActive && underDailyLimit;
  let campaignReason: string | undefined;
  if (!campaignAllowed) {
    if (!campaignActive) {
      campaignReason = 'Campaign is not in ACTIVE status';
      failureReasons.push(`CampaignPolicy: ${campaignReason}`);
    }
    if (!underDailyLimit) {
      campaignReason = `Daily send limit (${params.maxDailySends}) reached`;
      failureReasons.push(`CampaignPolicy: ${campaignReason}`);
    }
  }

  // ── Dimension 3: Recipient Policy
  const emailValidation = validateRecipientEmail(params.recipientEmail);
  const notSuppressed = !params.isRecipientSuppressed;
  const recipientAllowed = emailValidation.valid && notSuppressed;
  let recipientReason: string | undefined;
  if (!recipientAllowed) {
    if (!emailValidation.valid) {
      recipientReason = 'Recipient email address is invalid or disposable';
      failureReasons.push(`RecipientPolicy: ${recipientReason}`);
    }
    if (!notSuppressed) {
      recipientReason = 'Recipient is suppressed on Do Not Contact list';
      failureReasons.push(`RecipientPolicy: ${recipientReason}`);
    }
  }

  // ── Dimension 4: Sender Policy
  const senderAllowed = params.isSenderDomainVerified && Boolean(params.senderDomain && params.senderDomain.trim().length > 0);
  let senderReason: string | undefined;
  if (!senderAllowed) {
    senderReason = `Sender domain "${params.senderDomain || ''}" is unverified or suspended`;
    failureReasons.push(`SenderPolicy: ${senderReason}`);
  }

  // ── Dimension 5: Content Policy
  const body = params.bodyText || '';
  const hasUnsubFooter = body.toLowerCase().includes('unsubscribe');
  const lowSpam = params.contentSpamScore <= 0.15;
  const contentAllowed = hasUnsubFooter && lowSpam;
  let contentReason: string | undefined;
  if (!contentAllowed) {
    if (!hasUnsubFooter) {
      contentReason = 'Message body is missing mandatory unsubscribe footer';
      failureReasons.push(`ContentPolicy: ${contentReason}`);
    }
    if (!lowSpam) {
      contentReason = `Content spam score (${params.contentSpamScore}) exceeds safe threshold (0.15)`;
      failureReasons.push(`ContentPolicy: ${contentReason}`);
    }
  }

  // ── Dimension 6: Deliverability Policy (Circuit Breakers)
  const bounceThreshold = params.circuitBreakerBounceThreshold ?? 0.03;
  const complaintThreshold = params.circuitBreakerComplaintThreshold ?? 0.001;
  const deliverabilityAllowed =
    params.domainBounceRate < bounceThreshold && params.domainComplaintRate < complaintThreshold;
  let deliverabilityReason: string | undefined;
  if (!deliverabilityAllowed) {
    if (params.domainBounceRate >= bounceThreshold) {
      deliverabilityReason = `Domain bounce rate (${(params.domainBounceRate * 100).toFixed(1)}%) exceeds threshold (${(bounceThreshold * 100).toFixed(1)}%)`;
      failureReasons.push(`DeliverabilityPolicy: ${deliverabilityReason}`);
    }
    if (params.domainComplaintRate >= complaintThreshold) {
      deliverabilityReason = `Domain complaint rate (${(params.domainComplaintRate * 100).toFixed(2)}%) exceeds threshold (${(complaintThreshold * 100).toFixed(2)}%)`;
      failureReasons.push(`DeliverabilityPolicy: ${deliverabilityReason}`);
    }
  }

  // ── Dimension 7: Confidence Policy
  const minConfidence = params.minConfidenceThreshold ?? 0.75;
  const confidenceAllowed = params.modelConfidence >= minConfidence;
  let confidenceReason: string | undefined;
  if (!confidenceAllowed) {
    confidenceReason = `Model confidence score (${params.modelConfidence.toFixed(2)}) is below threshold (${minConfidence.toFixed(2)})`;
    failureReasons.push(`ConfidencePolicy: ${confidenceReason}`);
  }

  // Strictly conjunct: authorized IF AND ONLY IF ALL 7 pass
  const authorized =
    autonomy.allowed &&
    campaignAllowed &&
    recipientAllowed &&
    senderAllowed &&
    contentAllowed &&
    deliverabilityAllowed &&
    confidenceAllowed;

  return {
    authorized,
    dimensions: {
      autonomyPermission: {
        allowed: autonomy.allowed,
        reason: autonomy.reason,
        mode: autonomy.mode,
      },
      campaignPolicy: {
        allowed: campaignAllowed,
        reason: campaignReason,
      },
      recipientPolicy: {
        allowed: recipientAllowed,
        reason: recipientReason,
        isSuppressed: params.isRecipientSuppressed,
      },
      senderPolicy: {
        allowed: senderAllowed,
        reason: senderReason,
      },
      contentPolicy: {
        allowed: contentAllowed,
        reason: contentReason,
      },
      deliverabilityPolicy: {
        allowed: deliverabilityAllowed,
        reason: deliverabilityReason,
      },
      confidencePolicy: {
        allowed: confidenceAllowed,
        reason: confidenceReason,
        score: params.modelConfidence,
      },
    },
    failureReasons,
    evaluatedAt: new Date().toISOString(),
    traceId: params.traceId,
  };
}
