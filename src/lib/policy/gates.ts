/**
 * Deterministic Policy Validation Gates (ZERO LLM Veto)
 * 8 non-bypassable, code-enforced gates that protect domain reputation,
 * legal compliance, recipient safety, and workspace quota boundaries.
 */

import { db } from '@/lib/db';
import { isOnDncList, validateEmail } from '@/lib/safety';
import { isInSendWindow } from '@/lib/deliverability/send-cadence';
import {
  DeterministicPolicyGate,
  PolicyExecutionContext,
  ExecutionPlan,
  PolicyValidationResult,
  PolicyViolation,
  AutonomyLevel,
} from './types';
import { canExecuteAutonomously } from './autonomy-enforcer';

export const SPAM_KEYWORDS = [
  'free gift',
  'guaranteed revenue',
  'risk-free deal',
  'make money',
  'click here',
  '100% free',
  'act now',
  'urgent response required',
  'wire transfer',
  'no catch',
  'unlimited leads',
  'double your income',
];

/**
 * Gate 1: Autonomy Level & Permission Gate
 */
export async function evaluateAutonomyGate(
  context: PolicyExecutionContext,
  plan: ExecutionPlan
): Promise<PolicyViolation[]> {
  const violations: PolicyViolation[] = [];
  const { autonomyLevel, taskType } = context;

  // Auto-dispatch and auto-approval are restricted by progressive autonomy
  const isDispatchOrApprove = 
    taskType === 'email_dispatch' || 
    plan.proposedMutations.some(m => m.proposedState.status === 'approved' || m.proposedState.status === 'sending');

  if (isDispatchOrApprove) {
    if (autonomyLevel === AutonomyLevel.LEVEL_0_DRAFT) {
      violations.push({
        policyId: 'LEVEL_0_PROHIBITS_AUTO_EXECUTION',
        gate: DeterministicPolicyGate.AUTONOMY_LEVEL_PERMISSION,
        severity: 'fatal',
        reason: 'Workspace is in Level 0 (Draft Only). Automated approval or dispatch is prohibited in code.',
        remediationAction: 'Hold in WAITING_APPROVAL for manual operator confirmation in Review Deck.',
      });
    } else if (autonomyLevel === AutonomyLevel.LEVEL_1_ASSISTED && context.metadata?.isAutonomousRun) {
      violations.push({
        policyId: 'LEVEL_1_PROHIBITS_AUTO_APPROVAL',
        gate: DeterministicPolicyGate.AUTONOMY_LEVEL_PERMISSION,
        severity: 'fatal',
        reason: 'Workspace is in Level 1 (Assisted). 100% of outbound communications require explicit human approval.',
        remediationAction: 'Route draft to Review Deck for operator sign-off.',
      });
    }
  }

  return violations;
}

/**
 * Gate 2: Suppression & DNC Compliance Gate
 */
export async function evaluateSuppressionDncGate(
  context: PolicyExecutionContext,
  plan: ExecutionPlan
): Promise<PolicyViolation[]> {
  const violations: PolicyViolation[] = [];
  const email = plan.recipientEmail || (context.input as any)?.email;

  if (!email) {
    return violations;
  }

  // 1. Check workspace DNC list (supports exact match + normalized plus-addressing)
  const onDnc = await isOnDncList(email, context.organizationId);
  if (onDnc) {
    violations.push({
      policyId: 'SUPPRESSION_DNC_MATCH',
      gate: DeterministicPolicyGate.SUPPRESSION_DNC_COMPLIANCE,
      severity: 'fatal',
      reason: `Recipient (${email}) is on the Do Not Contact (DNC) suppression list.`,
      remediationAction: 'Cancel outreach task immediately. Recipient is globally suppressed.',
    });
    return violations;
  }

  // 2. Check Lead record status if leadId is available
  const leadId = context.leadId || (context.input as any)?.leadId;
  if (leadId) {
    const lead = await db.lead.findFirst({
      where: { id: leadId, organizationId: context.organizationId },
    });

    if (lead) {
      if (lead.doNotContact || lead.isBlacklisted || lead.status === 'unsubscribed' || lead.status === 'blocked') {
        violations.push({
          policyId: 'LEAD_MARKED_DO_NOT_CONTACT',
          gate: DeterministicPolicyGate.SUPPRESSION_DNC_COMPLIANCE,
          severity: 'fatal',
          reason: `Lead ${lead.name} (${lead.email}) is marked as ${lead.isBlacklisted ? 'Blacklisted' : 'Do Not Contact / Unsubscribed'}.`,
          remediationAction: 'Do not contact lead; purge active sequences.',
        });
      }
    }
  }

  return violations;
}

/**
 * Gate 3: Domain Verification & Reputation Gate
 */
export async function evaluateDomainVerificationGate(
  context: PolicyExecutionContext,
  plan: ExecutionPlan
): Promise<PolicyViolation[]> {
  const violations: PolicyViolation[] = [];
  
  // Find sending domain for workspace
  const domainId = context.domainId || (context.input as any)?.domainId;
  const domain = domainId
    ? await db.sendingDomain.findFirst({ where: { id: domainId, organizationId: context.organizationId } })
    : await db.sendingDomain.findFirst({ where: { organizationId: context.organizationId } });

  if (!domain) {
    // If no domain configured yet, warn or block depending on taskType
    if (context.taskType === 'email_dispatch') {
      violations.push({
        policyId: 'NO_SENDING_DOMAIN_CONFIGURED',
        gate: DeterministicPolicyGate.DOMAIN_VERIFICATION_REPUTATION,
        severity: 'fatal',
        reason: 'No sending domain configured for this workspace.',
        remediationAction: 'Connect and verify a custom domain in Domain Settings.',
      });
    }
    return violations;
  }

  // Check verification status
  const status = (domain.status || '').toLowerCase();
  const isVerified = status === 'active' || status === 'verified';
  const isSuspended = status === 'suspended' || status === 'unhealthy';

  if (isSuspended) {
    violations.push({
      policyId: 'DOMAIN_REPUTATION_SUSPENDED',
      gate: DeterministicPolicyGate.DOMAIN_VERIFICATION_REPUTATION,
      severity: 'fatal',
      reason: `Sending domain (${domain.domain}) is suspended due to high bounce or spam rates.`,
      remediationAction: 'Investigate deliverability alerts and resolve domain health flags.',
    });
    return violations;
  }

  if (!isVerified && context.taskType === 'email_dispatch') {
    violations.push({
      policyId: 'DOMAIN_DNS_UNVERIFIED',
      gate: DeterministicPolicyGate.DOMAIN_VERIFICATION_REPUTATION,
      severity: 'fatal',
      reason: `Sending domain (${domain.domain}) DNS records are pending verification (SPF, DKIM, DMARC).`,
      remediationAction: 'Verify DNS records with domain registrar before dispatching.',
    });
  }

  return violations;
}

/**
 * Gate 4: Workspace & Campaign Send Quotas
 */
export async function evaluateSendQuotaGate(
  context: PolicyExecutionContext,
  plan: ExecutionPlan
): Promise<PolicyViolation[]> {
  const violations: PolicyViolation[] = [];

  // 1. Workspace / UserPreference quota
  const pref = await db.userPreference.findFirst({
    where: { activeOrgId: context.organizationId },
  });

  const dailyLimit = pref?.dailySendLimit ?? 50;

  // Count sent emails today for this workspace
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const sentTodayCount = await db.outreachEmail.count({
    where: {
      organizationId: context.organizationId,
      status: { in: ['sent', 'delivered', 'opened', 'clicked', 'replied'] },
      sentAt: { gte: startOfDay },
    },
  }).catch(() => 0);

  if (sentTodayCount >= dailyLimit) {
    violations.push({
      policyId: 'WORKSPACE_DAILY_QUOTA_EXCEEDED',
      gate: DeterministicPolicyGate.WORKSPACE_CAMPAIGN_QUOTA,
      severity: 'fatal',
      reason: `Workspace daily send limit reached (${sentTodayCount}/${dailyLimit} sent today).`,
      remediationAction: 'Outreach paused until 9:00 AM tomorrow to protect domain reputation, or increase daily quota in Settings.',
      details: { sentToday: sentTodayCount, dailyLimit },
    });
  }

  return violations;
}

/**
 * Gate 5: Send Window & Timezone Compliance
 */
export async function evaluateSendWindowGate(
  context: PolicyExecutionContext,
  plan: ExecutionPlan
): Promise<PolicyViolation[]> {
  const violations: PolicyViolation[] = [];

  // In test environments or draft phase, skip window enforcement
  if (context.taskType !== 'email_dispatch' || process.env.NODE_ENV === 'test') {
    return violations;
  }

  const inWindow = isInSendWindow();
  if (!inWindow) {
    violations.push({
      policyId: 'OUTSIDE_SEND_WINDOW',
      gate: DeterministicPolicyGate.SEND_WINDOW_TIMEZONE,
      severity: 'fatal',
      reason: 'Current time is outside the allowed business outreach window. Allowed: 8:00 AM – 6:00 PM local time on business days.',
      remediationAction: 'Queue email for dispatch at the start of the next business send window.',
      details: { inWindow: false },
    });
  }

  return violations;
}

/**
 * Gate 6: Content & Spam Keyword Safety Gate
 */
export async function evaluateSpamSafetyGate(
  context: PolicyExecutionContext,
  plan: ExecutionPlan
): Promise<PolicyViolation[]> {
  const violations: PolicyViolation[] = [];
  const subject = plan.proposedSubject || '';
  const body = plan.proposedBody || '';
  const textToScan = `${subject} ${body}`.toLowerCase();

  const matchedKeywords = SPAM_KEYWORDS.filter(kw => textToScan.includes(kw));

  if (matchedKeywords.length > 0) {
    const spamRisk = Math.min(1.0, matchedKeywords.length * 0.20);
    violations.push({
      policyId: 'SPAM_KEYWORDS_DETECTED',
      gate: DeterministicPolicyGate.CONTENT_SPAM_SAFETY,
      severity: 'fatal',
      reason: `Email content contains high-risk spam keywords: [${matchedKeywords.join(', ')}]. Computed spam risk: ${(spamRisk * 100).toFixed(0)}%.`,
      remediationAction: 'Remove promotional trigger phrases from subject and body before sending.',
      details: { matchedKeywords, spamRisk },
    });
  }

  return violations;
}

/**
 * Gate 7: Lead Eligibility & Min Score Gate
 */
export async function evaluateLeadEligibilityGate(
  context: PolicyExecutionContext,
  plan: ExecutionPlan
): Promise<PolicyViolation[]> {
  const violations: PolicyViolation[] = [];
  const email = plan.recipientEmail || (context.input as any)?.email;

  // 1. Email syntax and disposable domain check
  if (email) {
    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) {
      violations.push({
        policyId: 'INVALID_OR_DISPOSABLE_EMAIL',
        gate: DeterministicPolicyGate.LEAD_ELIGIBILITY_MIN_SCORE,
        severity: 'fatal',
        reason: `Recipient email (${email}) failed validation: ${emailCheck.reason}`,
        remediationAction: 'Enrich lead with a verified B2B work email.',
      });
      return violations;
    }
  }

  // 2. Minimum lead score check
  const leadScore = (context.input as any)?.leadScore ?? (plan as any).leadScore;
  const pref = await db.userPreference.findFirst({
    where: { activeOrgId: context.organizationId },
  });
  const minLeadScore = pref?.minLeadScore ?? 60.0;

  if (typeof leadScore === 'number' && leadScore < minLeadScore) {
    violations.push({
      policyId: 'LEAD_SCORE_BELOW_MINIMUM',
      gate: DeterministicPolicyGate.LEAD_ELIGIBILITY_MIN_SCORE,
      severity: 'fatal',
      reason: `Lead score (${leadScore}) is below minimum threshold (${minLeadScore}).`,
      remediationAction: 'Enrich lead data with stronger intent signals or adjust minimum lead score threshold.',
      details: { leadScore, minLeadScore },
    });
  }

  return violations;
}

/**
 * Gate 8: Recipient Dedup & Frequency Capping
 */
export async function evaluateRecipientDedupGate(
  context: PolicyExecutionContext,
  plan: ExecutionPlan
): Promise<PolicyViolation[]> {
  const violations: PolicyViolation[] = [];
  const email = plan.recipientEmail || (context.input as any)?.email;

  if (!email || context.taskType !== 'email_dispatch') {
    return violations;
  }

  // Check if this recipient was emailed recently (within last 3 days)
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const recentSend = await db.outreachEmail.findFirst({
    where: {
      organizationId: context.organizationId,
      recipientEmail: email,
      status: { in: ['sent', 'delivered', 'sending', 'QUEUED'] },
      createdAt: { gte: threeDaysAgo },
    },
  });

  if (recentSend) {
    violations.push({
      policyId: 'RECIPIENT_FREQUENCY_CAPPED',
      gate: DeterministicPolicyGate.RECIPIENT_DEDUP_FREQUENCY_CAPPING,
      severity: 'fatal',
      reason: `Recipient (${email}) received an outreach message within the last 3 days (Message ID: ${recentSend.id}).`,
      remediationAction: 'Throttle dispatch to respect recipient communication cadence.',
      details: { recentMessageId: recentSend.id, recentSentAt: recentSend.createdAt },
    });
  }

  return violations;
}

/**
 * Evaluate all 8 deterministic policy gates sequentially with ZERO LLM veto
 */
export async function evaluateAllDeterministicGates(
  context: PolicyExecutionContext,
  plan: ExecutionPlan
): Promise<PolicyValidationResult> {
  const allViolations: PolicyViolation[] = [];
  const passedGates: DeterministicPolicyGate[] = [];

  const gateEvaluators: Array<{
    gate: DeterministicPolicyGate;
    evaluator: (ctx: PolicyExecutionContext, p: ExecutionPlan) => Promise<PolicyViolation[]>;
  }> = [
    { gate: DeterministicPolicyGate.AUTONOMY_LEVEL_PERMISSION, evaluator: evaluateAutonomyGate },
    { gate: DeterministicPolicyGate.SUPPRESSION_DNC_COMPLIANCE, evaluator: evaluateSuppressionDncGate },
    { gate: DeterministicPolicyGate.DOMAIN_VERIFICATION_REPUTATION, evaluator: evaluateDomainVerificationGate },
    { gate: DeterministicPolicyGate.WORKSPACE_CAMPAIGN_QUOTA, evaluator: evaluateSendQuotaGate },
    { gate: DeterministicPolicyGate.SEND_WINDOW_TIMEZONE, evaluator: evaluateSendWindowGate },
    { gate: DeterministicPolicyGate.CONTENT_SPAM_SAFETY, evaluator: evaluateSpamSafetyGate },
    { gate: DeterministicPolicyGate.LEAD_ELIGIBILITY_MIN_SCORE, evaluator: evaluateLeadEligibilityGate },
    { gate: DeterministicPolicyGate.RECIPIENT_DEDUP_FREQUENCY_CAPPING, evaluator: evaluateRecipientDedupGate },
  ];

  for (const { gate, evaluator } of gateEvaluators) {
    try {
      const violations = await evaluator(context, plan);
      if (violations.length > 0) {
        allViolations.push(...violations);
      } else {
        passedGates.push(gate);
      }
    } catch (err: any) {
      allViolations.push({
        policyId: 'GATE_EVALUATION_ERROR',
        gate,
        severity: 'fatal',
        reason: `Failed to evaluate policy gate ${gate}: ${err.message || String(err)}`,
      });
    }
  }

  const hasFatal = allViolations.some(v => v.severity === 'fatal');
  const blockedPolicy = allViolations.find(v => v.severity === 'fatal')?.gate;

  return {
    allowed: !hasFatal,
    blockedPolicy,
    violations: allViolations,
    passedGates,
  };
}
