// ─── DETERMINISTIC VERSIONED POLICY PRECEDENCE ENGINE (v1.0.0) ─────────
// Enforces non-negotiable safety, legal, privacy, and suppression precedence
// over ordinary commercial intent (R2, R8).
// Canonical hierarchy: Statutory Privacy / Legal / Security > Opt-Out / Bounce
// > Referral / Forward > Meeting / Positive / Question > OOO / Negative / Unclear.
// ─────────────────────────────────────────────────────────────────────────────

export const POLICY_PRECEDENCE_VERSION = 'v1.0.0' as const;
export type PolicyPrecedenceVersion = typeof POLICY_PRECEDENCE_VERSION;

export type CanonicalIntent =
  | 'PRIVACY_REQUEST'
  | 'LEGAL_REQUEST'
  | 'SECURITY_WARNING'
  | 'UNSUBSCRIBE'
  | 'BOUNCE'
  | 'AUTO_REPLY'
  | 'REFERRAL'
  | 'FORWARD'
  | 'MEETING_REQUEST'
  | 'POSITIVE'
  | 'QUESTION'
  | 'OUT_OF_OFFICE'
  | 'NEGATIVE'
  | 'UNCLEAR';

export type RiskFlag =
  | 'PRIVACY_GDPR_CCPA'
  | 'LEGAL_LITIGATION'
  | 'SECURITY_GATEWAY_ALERT'
  | 'REPUTATION_RISK'
  | 'COMPLIANCE_DISPUTE'
  | 'PRIVACY_GDPR_REQUEST'
  | 'LEGAL_THREAT'
  | 'SECURITY_WARNING'
  | 'EXPLICIT_DNC'
  | 'COMPLAINT_RISK';

export type RequiredAction =
  | 'IMMEDIATE_DNC_SUPPRESSION'
  | 'IMMEDIATE_DNC_SUPPRESSION_AND_ESCALATION'
  | 'PAUSE_SEQUENCE_UNTIL_RETURN_DATE'
  | 'EXTRACT_REFERRAL_AND_STAGE_DRAFT'
  | 'ROUTE_TO_REP_AND_BOOK_MEETING'
  | 'GENERATE_DRAFT_REPLY_FOR_REVIEW'
  | 'MARK_BOUNCED_AND_HALT'
  | 'QUEUE_FOR_HUMAN_TRIAGE'
  | 'suppress_immediate'
  | 'escalate_legal'
  | 'escalate_security'
  | 'escalate_calendar'
  | 'draft_contextual_reply'
  | 'snooze_sequence'
  | 'stop_sequence'
  | 'human_triage';

export type RiskCategory = 'SAFETY' | 'LEGAL' | 'PRIVACY' | 'SECURITY' | 'COMMERCIAL' | 'OPERATIONAL';

export interface PrecedenceTierRule {
  priority: number; // 100 = Highest (Statutory/Safety) to 0 = Lowest (Ambiguous)
  intent: CanonicalIntent;
  riskCategory: RiskCategory;
  governingPolicy: string;
  resultingAction: RequiredAction;
  overridesSubordinate: boolean;
  description: string;
}

/**
 * Deterministic Versioned Policy Precedence Table v1.0.0.
 * Strict descending priority hierarchy.
 */
export const PRECEDENCE_TABLE_V1: readonly PrecedenceTierRule[] = [
  // ── Tier 1: Statutory Privacy, Legal Disputes, and Security Gateways (Priority 100-90)
  {
    priority: 100,
    intent: 'PRIVACY_REQUEST',
    riskCategory: 'PRIVACY',
    governingPolicy: 'POLICY_SAFETY_LEGAL_PRIVACY_ESCALATION',
    resultingAction: 'IMMEDIATE_DNC_SUPPRESSION_AND_ESCALATION',
    overridesSubordinate: true,
    description: 'Statutory privacy / GDPR / CCPA right-to-be-forgotten demand. Strictly halts communication and escalates to compliance.',
  },
  {
    priority: 95,
    intent: 'LEGAL_REQUEST',
    riskCategory: 'LEGAL',
    governingPolicy: 'POLICY_SAFETY_LEGAL_PRIVACY_ESCALATION',
    resultingAction: 'IMMEDIATE_DNC_SUPPRESSION_AND_ESCALATION',
    overridesSubordinate: true,
    description: 'Litigation, attorney involvement, or harassment dispute. Strictly halts communication and escalates to legal.',
  },
  {
    priority: 90,
    intent: 'SECURITY_WARNING',
    riskCategory: 'SECURITY',
    governingPolicy: 'POLICY_SAFETY_LEGAL_PRIVACY_ESCALATION',
    resultingAction: 'IMMEDIATE_DNC_SUPPRESSION_AND_ESCALATION',
    overridesSubordinate: true,
    description: 'Phishing, spoofing, or automated corporate security gateway alert. Strictly isolates sender domain and alerts SecOps.',
  },

  // ── Tier 2: Explicit Opt-Out & Deliverability Failures (Priority 80-75)
  {
    priority: 80,
    intent: 'UNSUBSCRIBE',
    riskCategory: 'SAFETY',
    governingPolicy: 'POLICY_OPT_OUT_SUPPRESSION',
    resultingAction: 'IMMEDIATE_DNC_SUPPRESSION',
    overridesSubordinate: true,
    description: 'Explicit opt-out or unsubscribe request. Strictly overrides any conversational or positive sentiment.',
  },
  {
    priority: 75,
    intent: 'BOUNCE',
    riskCategory: 'SAFETY',
    governingPolicy: 'POLICY_DELIVERABILITY_BOUNCE_HALT',
    resultingAction: 'MARK_BOUNCED_AND_HALT',
    overridesSubordinate: true,
    description: 'Hard SMTP bounce or non-existent recipient mailbox. Terminates sequence to protect domain deliverability.',
  },

  // ── Tier 3: Referrals & Colleague Routing (Priority 60-55)
  {
    priority: 60,
    intent: 'REFERRAL',
    riskCategory: 'COMMERCIAL',
    governingPolicy: 'POLICY_REFERRAL_COLLEAGUE_STAGE',
    resultingAction: 'EXTRACT_REFERRAL_AND_STAGE_DRAFT',
    overridesSubordinate: false,
    description: 'Recipient referred to alternative decision-maker. Extract colleague details and stage outreach draft.',
  },
  {
    priority: 55,
    intent: 'FORWARD',
    riskCategory: 'COMMERCIAL',
    governingPolicy: 'POLICY_FORWARD_INVESTIGATION',
    resultingAction: 'QUEUE_FOR_HUMAN_TRIAGE',
    overridesSubordinate: false,
    description: 'Email forwarded internally or externally. Queue for human SDR review.',
  },

  // ── Tier 4: Commercial Interest, Questions & Meetings (Priority 40-30)
  {
    priority: 40,
    intent: 'MEETING_REQUEST',
    riskCategory: 'COMMERCIAL',
    governingPolicy: 'POLICY_COMMERCIAL_MEETING_BOOK',
    resultingAction: 'ROUTE_TO_REP_AND_BOOK_MEETING',
    overridesSubordinate: false,
    description: 'Direct calendar or meeting booking request. Route to sales representative for rapid confirmation.',
  },
  {
    priority: 35,
    intent: 'POSITIVE',
    riskCategory: 'COMMERCIAL',
    governingPolicy: 'POLICY_POSITIVE_ENGAGEMENT',
    resultingAction: 'GENERATE_DRAFT_REPLY_FOR_REVIEW',
    overridesSubordinate: false,
    description: 'Favorable interest or positive reception. Generate context-aware follow-up draft for human review.',
  },
  {
    priority: 30,
    intent: 'QUESTION',
    riskCategory: 'COMMERCIAL',
    governingPolicy: 'POLICY_QUESTION_ASSISTED_REPLY',
    resultingAction: 'GENERATE_DRAFT_REPLY_FOR_REVIEW',
    overridesSubordinate: false,
    description: 'Product, pricing, technical, or SOC2 inquiry. Generate assisted answer grounded in company knowledge base.',
  },

  // ── Tier 5: Operational Holds, Soft Declines & Ambiguity (Priority 20-0)
  {
    priority: 20,
    intent: 'OUT_OF_OFFICE',
    riskCategory: 'OPERATIONAL',
    governingPolicy: 'POLICY_OUT_OF_OFFICE_RESCHEDULE',
    resultingAction: 'PAUSE_SEQUENCE_UNTIL_RETURN_DATE',
    overridesSubordinate: false,
    description: 'Automatic out-of-office notification. Pause campaign sequence until specified return date.',
  },
  {
    priority: 15,
    intent: 'AUTO_REPLY',
    riskCategory: 'OPERATIONAL',
    governingPolicy: 'POLICY_OUT_OF_OFFICE_RESCHEDULE',
    resultingAction: 'PAUSE_SEQUENCE_UNTIL_RETURN_DATE',
    overridesSubordinate: false,
    description: 'Automated receipt acknowledgment or vacation auto-reply without explicit dates.',
  },
  {
    priority: 10,
    intent: 'NEGATIVE',
    riskCategory: 'COMMERCIAL',
    governingPolicy: 'POLICY_SOFT_DECLINE_HALT',
    resultingAction: 'QUEUE_FOR_HUMAN_TRIAGE',
    overridesSubordinate: false,
    description: 'Polite refusal or bad timing. Safely conclude active sequence without triggering permanent DNC.',
  },
  {
    priority: 0,
    intent: 'UNCLEAR',
    riskCategory: 'OPERATIONAL',
    governingPolicy: 'POLICY_LOW_CONFIDENCE_HUMAN_TRIAGE',
    resultingAction: 'QUEUE_FOR_HUMAN_TRIAGE',
    overridesSubordinate: false,
    description: 'Ambiguous or low-confidence reply text. Route to operator exception inbox for human verification.',
  },
] as const;

/**
 * Find precedence rule for a given canonical intent.
 */
export function getPrecedenceRule(intent: CanonicalIntent): PrecedenceTierRule {
  const found = PRECEDENCE_TABLE_V1.find(r => r.intent === intent);
  if (found) return found;
  return PRECEDENCE_TABLE_V1[PRECEDENCE_TABLE_V1.length - 1]; // Fallback to UNCLEAR
}

/**
 * Precedence resolution input options.
 */
export interface PrecedenceResolutionOptions {
  returnDate?: string;
  extractedReferralEmail?: string;
  explicitRiskFlags?: RiskFlag[];
  baseConfidence?: number;
}

/**
 * Result of deterministic policy precedence resolution.
 */
export interface PrecedenceResolutionResult {
  primary_intent: CanonicalIntent;
  secondary_intents: CanonicalIntent[];
  risk_flags: RiskFlag[];
  confidence: number;
  required_action: RequiredAction;
  policy_version: 'v1.0.0';
  selected_policy: string;
  overridesApplied: boolean;
  reasoning: string;
  extractedReferralEmail?: string;
  returnDate?: string;
}

/**
 * Deterministically resolves multi-intent collisions according to Table v1.0.0.
 * Highest applicable safety, legal, privacy, or suppression policy strictly
 * supersedes any subordinate commercial intent.
 */
export function resolveMultiIntentPrecedence(
  detectedIntents: CanonicalIntent[],
  options: PrecedenceResolutionOptions = {}
): PrecedenceResolutionResult {
  const uniqueIntents = Array.from(new Set(detectedIntents));

  if (uniqueIntents.length === 0) {
    uniqueIntents.push('UNCLEAR');
  }

  // Sort detected intents by Precedence Table priority descending
  const sorted = [...uniqueIntents].sort((a, b) => {
    const prioA = getPrecedenceRule(a).priority;
    const prioB = getPrecedenceRule(b).priority;
    return prioB - prioA;
  });

  const primary = sorted[0];
  const secondary = sorted.slice(1);
  const rule = getPrecedenceRule(primary);

  // Collect risk flags
  const riskFlagsSet = new Set<RiskFlag>(options.explicitRiskFlags || []);

  if (uniqueIntents.includes('PRIVACY_REQUEST')) {
    riskFlagsSet.add('PRIVACY_GDPR_CCPA');
    riskFlagsSet.add('PRIVACY_GDPR_REQUEST');
  }
  if (uniqueIntents.includes('LEGAL_REQUEST')) {
    riskFlagsSet.add('LEGAL_LITIGATION');
    riskFlagsSet.add('LEGAL_THREAT');
  }
  if (uniqueIntents.includes('SECURITY_WARNING')) {
    riskFlagsSet.add('SECURITY_GATEWAY_ALERT');
    riskFlagsSet.add('SECURITY_WARNING');
  }
  if (uniqueIntents.includes('UNSUBSCRIBE')) {
    riskFlagsSet.add('EXPLICIT_DNC');
  }
  if (uniqueIntents.includes('BOUNCE')) {
    riskFlagsSet.add('REPUTATION_RISK');
  }

  const riskFlags = Array.from(riskFlagsSet);

  // Determine whether higher-tier safety override was applied over subordinate commercial intent
  const hasSubordinateCommercial = secondary.some(i =>
    ['MEETING_REQUEST', 'POSITIVE', 'QUESTION', 'REFERRAL'].includes(i)
  );
  const overridesApplied = rule.overridesSubordinate && hasSubordinateCommercial;

  // Confidence computation
  let confidence = options.baseConfidence ?? 0.85;
  if (primary === 'PRIVACY_REQUEST' || primary === 'LEGAL_REQUEST' || primary === 'SECURITY_WARNING') {
    confidence = Math.max(confidence, 0.98);
  } else if (primary === 'UNSUBSCRIBE' || primary === 'BOUNCE') {
    confidence = Math.max(confidence, 0.95);
  } else if (primary === 'MEETING_REQUEST') {
    confidence = Math.max(confidence, 0.94);
  } else if (primary === 'OUT_OF_OFFICE') {
    confidence = Math.max(confidence, 0.92);
  } else if (primary === 'REFERRAL') {
    confidence = Math.max(confidence, 0.88);
  } else if (primary === 'POSITIVE') {
    confidence = Math.max(confidence, 0.82);
  } else if (primary === 'QUESTION') {
    confidence = Math.max(confidence, 0.85);
  } else if (primary === 'UNCLEAR') {
    confidence = Math.min(confidence, 0.40);
  }

  // Construct transparent reasoning statement
  let reasoning = rule.description;
  if (overridesApplied) {
    const commercialList = secondary
      .filter(i => ['MEETING_REQUEST', 'POSITIVE', 'QUESTION', 'REFERRAL'].includes(i))
      .join(', ');
    reasoning = `Policy Precedence v1.0.0: ${primary} (Priority ${rule.priority}) strictly overrides commercial intent [${commercialList}]. ${rule.description}`;
  }

  return {
    primary_intent: primary,
    secondary_intents: secondary,
    risk_flags: riskFlags,
    confidence,
    required_action: rule.resultingAction,
    policy_version: POLICY_PRECEDENCE_VERSION,
    selected_policy: rule.governingPolicy,
    overridesApplied,
    reasoning,
    extractedReferralEmail: options.extractedReferralEmail,
    returnDate: options.returnDate,
  };
}

/**
 * Returns true if an intent or intent list mandates immediate workspace-wide suppression.
 */
export function requiresImmediateSuppression(
  primaryIntent: CanonicalIntent,
  secondaryIntents: CanonicalIntent[] = []
): boolean {
  const all = [primaryIntent, ...secondaryIntents];
  return all.some(i => ['PRIVACY_REQUEST', 'LEGAL_REQUEST', 'UNSUBSCRIBE', 'BOUNCE'].includes(i));
}

/**
 * Returns true if an intent or risk flag mandates human escalation.
 */
export function requiresHumanEscalation(
  primaryIntent: CanonicalIntent,
  riskFlags: RiskFlag[] = []
): boolean {
  if (['PRIVACY_REQUEST', 'LEGAL_REQUEST', 'SECURITY_WARNING', 'UNCLEAR'].includes(primaryIntent)) {
    return true;
  }
  return riskFlags.length > 0;
}
