// ─── LAYERED 14-CATEGORY INBOUND REPLY CLASSIFIER ─────────────────
// Milestone 3 (R3): Enterprise-grade reply taxonomy with human escalation
// and compliance-critical opt-out / legal triage.
// ──────────────────────────────────────────────────────────────────

export type LayeredReplyCategory =
  | 'POSITIVE'
  | 'NEGATIVE'
  | 'QUESTION'
  | 'MEETING_REQUEST'
  | 'UNSUBSCRIBE'
  | 'OUT_OF_OFFICE'
  | 'BOUNCE'
  | 'AUTO_REPLY'
  | 'REFERRAL'
  | 'FORWARD'
  | 'UNCLEAR'
  | 'SECURITY_WARNING'
  | 'LEGAL_REQUEST'
  | 'PRIVACY_REQUEST';

export interface LayeredClassificationResult {
  category: LayeredReplyCategory;
  confidence: number;
  reasoning: string;
  nextAction:
    | 'book_meeting'
    | 'escalate_warm'
    | 'auto_reply'
    | 'stop_sequence'
    | 'snooze_sequence'
    | 'mark_unsub'
    | 'mark_bounced'
    | 'human_review'
    | 'security_alert'
    | 'legal_escalation';
  requiresHumanEscalation: boolean;
  dncSuppressionRequired: boolean;
  suggestedActionLabel: string;
  extractedReferralEmail?: string;
}

export class LayeredReplyClassifier {
  /**
   * Deterministic rule-based classification across the 14-category taxonomy.
   */
  static classify(text: string): LayeredClassificationResult {
    const raw = (text || '').trim();
    const lower = raw.toLowerCase();

    // 1. Legal / Compliance / Privacy Request (GDPR / CCPA / SOX)
    if (
      lower.includes('gdpr') ||
      lower.includes('ccpa') ||
      lower.includes('privacy policy') ||
      lower.includes('delete my data') ||
      lower.includes('right to be forgotten') ||
      lower.includes('subject access request') ||
      lower.includes('data protection officer')
    ) {
      return {
        category: 'PRIVACY_REQUEST',
        confidence: 0.98,
        reasoning: 'Explicit privacy/data subject request detected (GDPR/CCPA)',
        nextAction: 'legal_escalation',
        requiresHumanEscalation: true,
        dncSuppressionRequired: true,
        suggestedActionLabel: 'Review Data Deletion / Privacy Request',
      };
    }

    if (
      lower.includes('attorney') ||
      lower.includes('legal counsel') ||
      lower.includes('cease and desist') ||
      lower.includes('sue') ||
      lower.includes('lawsuit') ||
      lower.includes('statutory violation')
    ) {
      return {
        category: 'LEGAL_REQUEST',
        confidence: 0.95,
        reasoning: 'Legal warning or formal dispute detected',
        nextAction: 'legal_escalation',
        requiresHumanEscalation: true,
        dncSuppressionRequired: true,
        suggestedActionLabel: 'Review Legal Escalation',
      };
    }

    // 2. Security Warning (Email gateway, Phishing warning, DMARC rejection)
    if (
      lower.includes('security warning') ||
      lower.includes('phishing alert') ||
      lower.includes('suspicious message') ||
      lower.includes('external sender warning') ||
      lower.includes('blocked by policy') ||
      lower.includes('spam trap') ||
      lower.includes('proofpoint') ||
      lower.includes('mimecast flagged')
    ) {
      return {
        category: 'SECURITY_WARNING',
        confidence: 0.92,
        reasoning: 'Security gateway banner or suspicious activity warning',
        nextAction: 'security_alert',
        requiresHumanEscalation: true,
        dncSuppressionRequired: false,
        suggestedActionLabel: 'Check Domain Reputation & Security Warning',
      };
    }

    // 3. Explicit Unsubscribe / DNC
    if (
      lower.includes('unsubscribe') ||
      lower.includes('remove me') ||
      lower.includes('take me off') ||
      lower.includes('stop emailing') ||
      lower.includes('do not contact') ||
      lower.includes('opt out') ||
      lower.includes('opt-out') ||
      lower === 'stop' ||
      lower === 'unsub'
    ) {
      return {
        category: 'UNSUBSCRIBE',
        confidence: 0.99,
        reasoning: 'Explicit opt-out request detected',
        nextAction: 'mark_unsub',
        requiresHumanEscalation: false,
        dncSuppressionRequired: true,
        suggestedActionLabel: 'Permanent DNC Suppressed',
      };
    }

    // 4. Meeting Request
    if (
      lower.includes('book a time') ||
      lower.includes('schedule a call') ||
      lower.includes('calendar link') ||
      lower.includes('let\'s talk') ||
      lower.includes('available next week') ||
      lower.includes('free tuesday') ||
      lower.includes('send over an invite') ||
      lower.includes('hop on a call') ||
      lower.includes('demo')
    ) {
      return {
        category: 'MEETING_REQUEST',
        confidence: 0.96,
        reasoning: 'Explicit meeting or call scheduling intent',
        nextAction: 'book_meeting',
        requiresHumanEscalation: true,
        dncSuppressionRequired: false,
        suggestedActionLabel: 'Send Cal.com Booking Link',
      };
    }

    // 5. Referral / Forward to Colleague
    const emailMatch = raw.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (
      (lower.includes('reach out to') ||
        lower.includes('cc\'d') ||
        lower.includes('loop in') ||
        lower.includes('speak with') ||
        lower.includes('contact my colleague') ||
        lower.includes('refer you to')) &&
      emailMatch
    ) {
      return {
        category: 'REFERRAL',
        confidence: 0.94,
        reasoning: `Referral to colleague with contact email (${emailMatch[1]})`,
        nextAction: 'escalate_warm',
        requiresHumanEscalation: true,
        dncSuppressionRequired: false,
        suggestedActionLabel: `Enroll Referred Contact (${emailMatch[1]})`,
        extractedReferralEmail: emailMatch[1],
      };
    }

    if (lower.includes('fwd:') || lower.includes('forwarded message')) {
      return {
        category: 'FORWARD',
        confidence: 0.88,
        reasoning: 'Forwarded email thread received',
        nextAction: 'human_review',
        requiresHumanEscalation: true,
        dncSuppressionRequired: false,
        suggestedActionLabel: 'Review Forwarded Context',
      };
    }

    // 6. Out of Office / Auto Reply
    if (
      lower.includes('out of the office') ||
      lower.includes('auto-reply') ||
      lower.includes('automatic reply') ||
      lower.includes('on leave') ||
      lower.includes('annual leave') ||
      lower.includes('away from my desk') ||
      lower.includes('paternity leave') ||
      lower.includes('maternity leave')
    ) {
      return {
        category: 'OUT_OF_OFFICE',
        confidence: 0.95,
        reasoning: 'Automated out-of-office responder',
        nextAction: 'snooze_sequence',
        requiresHumanEscalation: false,
        dncSuppressionRequired: false,
        suggestedActionLabel: 'Sequence Snoozed (7 Days)',
      };
    }

    // 7. Bounce
    if (
      lower.includes('delivery status notification') ||
      lower.includes('undeliverable') ||
      lower.includes('550 5.1.1') ||
      lower.includes('mailbox unavailable') ||
      lower.includes('user unknown')
    ) {
      return {
        category: 'BOUNCE',
        confidence: 0.98,
        reasoning: 'Delivery failure notice / SMTP bounce',
        nextAction: 'mark_bounced',
        requiresHumanEscalation: false,
        dncSuppressionRequired: true,
        suggestedActionLabel: 'Mark Lead Bounced',
      };
    }

    // 8. Positive interest
    if (
      lower.includes('interested') ||
      lower.includes('sounds interesting') ||
      lower.includes('send more info') ||
      lower.includes('share a deck') ||
      lower.includes('tell me more') ||
      lower.includes('pricing info') ||
      lower.includes('sounds promising')
    ) {
      return {
        category: 'POSITIVE',
        confidence: 0.90,
        reasoning: 'Expressed interest in value proposition',
        nextAction: 'escalate_warm',
        requiresHumanEscalation: true,
        dncSuppressionRequired: false,
        suggestedActionLabel: 'Reply with Overview & Case Study',
      };
    }

    // 9. Question
    if (
      lower.includes('how much') ||
      lower.includes('what is the cost') ||
      lower.includes('does it support') ||
      lower.includes('how do you compare') ||
      lower.includes('is it compatible') ||
      raw.includes('?')
    ) {
      return {
        category: 'QUESTION',
        confidence: 0.88,
        reasoning: 'Specific inquiry regarding pricing, capability, or specs',
        nextAction: 'auto_reply',
        requiresHumanEscalation: true,
        suggestedActionLabel: 'Draft Contextual Answer',
        dncSuppressionRequired: false,
      };
    }

    // 10. Negative (Soft decline without explicit legal unsubscribe)
    if (
      lower.includes('not interested') ||
      lower.includes('no thanks') ||
      lower.includes('not a fit') ||
      lower.includes('we already use') ||
      lower.includes('bad timing') ||
      lower.includes('pass on this')
    ) {
      return {
        category: 'NEGATIVE',
        confidence: 0.92,
        reasoning: 'Polite decline or no current need',
        nextAction: 'stop_sequence',
        requiresHumanEscalation: false,
        dncSuppressionRequired: false, // Soft decline pauses campaign for this lead, does not blackball globally
        suggestedActionLabel: 'Halt Sequence Follow-ups',
      };
    }

    // 11. Fallback: UNCLEAR / Human review required
    return {
      category: 'UNCLEAR',
      confidence: 0.40,
      reasoning: 'Reply content is ambiguous or does not map cleanly to standard intents',
      nextAction: 'human_review',
      requiresHumanEscalation: true,
      dncSuppressionRequired: false,
      suggestedActionLabel: 'Assign to SDR for Manual Triage',
    };
  }
}
