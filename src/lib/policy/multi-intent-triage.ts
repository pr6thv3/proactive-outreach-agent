// ─── MULTI-INTENT REPLY TRIAGE MODEL ──────────────────────────────────
// Upgrades reply triage from single-label to a multi-intent model returning:
// primary_intent, secondary_intents, risk_flags, confidence, required_action,
// selected_policy, policy_version ('v1.0.0'), and extraction metadata (R2, R8).
// ─────────────────────────────────────────────────────────────────────────────

import {
  CanonicalIntent,
  RiskFlag,
  RequiredAction,
  resolveMultiIntentPrecedence,
  PrecedenceResolutionResult,
} from './reply-precedence';

export type { CanonicalIntent, RiskFlag, RequiredAction };

export interface MultiIntentClassificationResult {
  primary_intent: CanonicalIntent;
  secondary_intents: CanonicalIntent[];
  risk_flags: RiskFlag[];
  confidence: number;
  required_action: RequiredAction;
  policy_version: 'v1.0.0';
  selected_policy: string;
  extractedReferralEmail?: string;
  returnDate?: string;
  reasoning: string;
}

/**
 * Triages an inbound prospect reply using multi-intent pattern recognition
 * and resolves collisions via deterministic Policy Precedence Table v1.0.0.
 *
 * Non-negotiable: Detects all co-occurring intents simultaneously (e.g. positive
 * interest + GDPR opt-out), passing them to the precedence engine to guarantee
 * that statutory/safety policies strictly override commercial interests.
 */
export function triageInboundReply(
  text: string,
  metadata?: Record<string, unknown>
): MultiIntentClassificationResult {
  const raw = text || '';
  const lower = raw.toLowerCase().trim();

  // Pattern detection for all canonical intents
  const hasPrivacy = /\b(gdpr|article 17|right to be forgotten|data protection|ccpa|privacy request|delete my data|remove my data|data subject|personal data|subject access request|dpo)\b/i.test(lower);
  const hasLegal = /\b(lawyer|attorney|litigation|sue|legal action|cease and desist|harassment|statutory violation|court|arbitration)\b/i.test(lower);
  const hasSecurity = /\b(phishing|spoofing|reported to it|security team|malware|soc2|infosec|security gateway|spam alert|cybersecurity)\b/i.test(lower);
  const hasUnsubscribe = /\b(unsubscribe|remove\s+(?:me|my\s+(?:\w+\s+)?email)|opt[ -]?out|stop emailing|take me off|delete me|do not contact|stop contacting|leave me alone|lose my number)\b/i.test(lower);
  const hasBounce = /\b(550|5\.1\.1|5\.7\.1|user unknown|mailbox unavailable|undeliverable|returned to sender|delivery status notification|address rejected|recipient address rejected)\b/i.test(lower);
  const hasOoo = /\b(out of the? office|on vacation|away from my email|maternity leave|parental leave|annual leave|returning on|back on|holiday)\b/i.test(lower);
  const hasReferral = /\b(reach out to|contact my colleague|talk to|loop in|looping in|speak with|refer you to|better person to talk to|contact)\b/i.test(lower);
  const hasMeeting = /\b(calendly|schedule a call|book a time|let's chat|free next tuesday|free next|tuesday at|demo|zoom|google meet|set up a (?:time|call)|have a call|speak next week|grab 15 mins|hop on a call|jump on a call)\b/i.test(lower);
  const hasQuestion = /\b(pricing|how does it work|integrate with|what is the cost|case studies|whitepaper|how much|tell me more about|what are the features|features)\b/i.test(lower) || (lower.includes('?') && /\b(how|what|when|where|why|can you|could you)\b/i.test(lower));
  const hasPositive = /\b(interested|sounds great|looks good|looks fantastic|tell me more|yes|awesome|fantastic|great|love|super relevant|happy to connect|definitely)\b/i.test(lower);
  const hasNegative = /\b(not interested|no thanks|pass on this|not a fit|not looking|remove|not right now|no interest|please stop)\b/i.test(lower);
  const hasForward = /\b(fwd:|forwarded message|forwarding this to|passing this along)\b/i.test(lower);
  const hasAutoReply = /\b(automated response|auto-reply|auto-response|auto reply|do not reply)\b/i.test(lower);

  // Extract return date if OOO detected
  let returnDate: string | undefined;
  const dateMatch = lower.match(/(?:returning(?:\s+on)?|back(?:\s+on)?|until)\s+([a-zA-Z]+\s+\d{1,2}(?:st|nd|rd|th)?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i);
  if (dateMatch) {
    returnDate = dateMatch[1];
  }

  // Extract referral email if referral detected
  let extractedReferralEmail: string | undefined;
  const allEmails = raw.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g);
  if (allEmails && allEmails.length > 0) {
    const senderEmail = typeof metadata?.from === 'string' ? metadata.from.toLowerCase() : '';
    // Find the first email that is not the sender's own email
    const candidate = allEmails.find(e => !senderEmail.includes(e.toLowerCase()));
    extractedReferralEmail = candidate || allEmails[0];
  }

  // Aggregate all co-occurring intents
  const detectedIntents: CanonicalIntent[] = [];
  if (hasPrivacy) detectedIntents.push('PRIVACY_REQUEST');
  if (hasLegal) detectedIntents.push('LEGAL_REQUEST');
  if (hasSecurity) detectedIntents.push('SECURITY_WARNING');
  if (hasUnsubscribe) detectedIntents.push('UNSUBSCRIBE');
  if (hasBounce) detectedIntents.push('BOUNCE');
  if (hasReferral) detectedIntents.push('REFERRAL');
  if (hasForward) detectedIntents.push('FORWARD');
  if (hasMeeting) detectedIntents.push('MEETING_REQUEST');
  if (hasQuestion) detectedIntents.push('QUESTION');
  if (hasPositive) detectedIntents.push('POSITIVE');
  if (hasOoo) detectedIntents.push('OUT_OF_OFFICE');
  if (hasAutoReply) detectedIntents.push('AUTO_REPLY');
  if (hasNegative && !hasUnsubscribe) detectedIntents.push('NEGATIVE');

  // Collect explicit risk flags
  const explicitRiskFlags: RiskFlag[] = [];
  if (hasPrivacy) {
    explicitRiskFlags.push('PRIVACY_GDPR_CCPA');
    explicitRiskFlags.push('PRIVACY_GDPR_REQUEST');
  }
  if (hasLegal) {
    explicitRiskFlags.push('LEGAL_LITIGATION');
    explicitRiskFlags.push('LEGAL_THREAT');
  }
  if (hasSecurity) {
    explicitRiskFlags.push('SECURITY_GATEWAY_ALERT');
    explicitRiskFlags.push('SECURITY_WARNING');
  }
  if (hasUnsubscribe) {
    explicitRiskFlags.push('EXPLICIT_DNC');
  }
  if (hasBounce) {
    explicitRiskFlags.push('REPUTATION_RISK');
  }
  if (hasLegal || (hasPrivacy && hasNegative)) {
    explicitRiskFlags.push('COMPLIANCE_DISPUTE');
  }

  // Resolve precedence using deterministic versioned engine
  const resolution: PrecedenceResolutionResult = resolveMultiIntentPrecedence(
    detectedIntents,
    {
      returnDate,
      extractedReferralEmail,
      explicitRiskFlags,
    }
  );

  return {
    primary_intent: resolution.primary_intent,
    secondary_intents: resolution.secondary_intents,
    risk_flags: resolution.risk_flags,
    confidence: resolution.confidence,
    required_action: resolution.required_action,
    policy_version: resolution.policy_version,
    selected_policy: resolution.selected_policy,
    extractedReferralEmail: resolution.extractedReferralEmail,
    returnDate: resolution.returnDate,
    reasoning: resolution.reasoning,
  };
}
