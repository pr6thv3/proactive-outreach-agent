import { Campaign, Lead, OutreachEmail as OutreachMessage, SendingDomain } from '@prisma/client';
type SenderAccount = any;
import { db } from '@/lib/db';
import { isOnDncList, validateEmail } from '@/lib/safety';
import { canSendMore } from '@/lib/deliverability/warmup-manager';
import { shouldPauseSending } from '@/lib/deliverability/reputation-tracker';
import { getJobHealth, type JobHealth } from '@/lib/queue/health';
import { evaluateRisk } from '@/lib/risk';
import { isInSendWindow } from '@/lib/deliverability/send-cadence';

export type ReadinessStatus = 'pass' | 'warn' | 'block';

export interface SendReadinessCheck {
  id: string;
  label: string;
  status: ReadinessStatus;
  statusLabel: 'Ready' | 'Can queue, but review first' | 'Cannot send';
  reason: string;
  remediationTarget?: string;
}

export interface SendReadinessResult {
  ready: boolean;
  traceId: string;
  checks: SendReadinessCheck[];
  resolved: {
    lead?: LeadSummary;
    campaign?: CampaignSummary;
    message?: MessageSummary;
    sender?: SenderSummary;
    domain?: DomainSummary;
    queue?: QueueReadinessSummary;
  };
}

export interface LeadSummary {
  id: string;
  name: string;
  email: string;
  status: string;
  isBlacklisted: boolean;
  doNotContact: boolean;
}

export interface CampaignSummary {
  id: string;
  name: string;
  status: string;
  maxDailySends: number;
  dailySendsCount: number;
}

export interface MessageSummary {
  id: string;
  status: string;
  subject: string;
}

export interface SenderSummary {
  id: string;
  email: string;
  name: string;
  status: string;
  dailyLimit: number;
  sentToday: number;
  reputationScore: number;
}

export interface DomainSummary {
  id: string;
  domain: string;
  status: string;
  dailyLimit: number;
  dailySendsCount: number;
  reputationScore: number;
  spfVerified: boolean;
  dkimVerified: boolean;
  dmarcVerified: boolean;
}

export interface QueueReadinessSummary {
  redisConfigured: boolean;
  redisConnected: boolean;
  redisError?: string;
  sendEmailPending: number;
  sendEmailRunning: number;
  sendEmailFailed: number;
  sendEmailDead: number;
  staleRunning: number;
  oldestPendingJobAgeMs?: number;
}

type SenderWithDomain = SenderAccount & { domain: SendingDomain | null };
type MessageWithRelations = OutreachMessage & {
  lead: Lead;
  campaign: Campaign | null;
  sender: SenderWithDomain | null;
};

export async function evaluateSendReadiness(params: {
  organizationId: string;
  messageId: string;
  traceId: string;
  enforceSendWindow?: boolean;
  minLeadScore?: number;
}): Promise<SendReadinessResult> {
  const checks: SendReadinessCheck[] = [];
  const addCheck = (check: Omit<SendReadinessCheck, 'statusLabel'>) => {
    checks.push({ ...check, statusLabel: statusLabel(check.status) });
  };

  const message = await db.outreachMessage.findFirst({
    where: { id: params.messageId, organizationId: params.organizationId },
    include: {
      lead: true,
      campaign: true,
      sender: { include: { domain: true } },
    },
  });

  const queueHealth: JobHealth = await getJobHealth(params.organizationId).catch((error): JobHealth => ({
    redis: { configured: Boolean(process.env.REDIS_URL), connected: false, error: error instanceof Error ? error.message : String(error) },
    queues: {},
    totals: { pending: 0, running: 0, failed: 0, dead: 0, staleRunning: 0 },
    oldestPendingJobAgeMs: undefined,
    recentJobs: [],
  }));

  const sendEmailQueue = queueHealth.queues.sendEmail;
  const queueSummary: QueueReadinessSummary = {
    redisConfigured: queueHealth.redis.configured,
    redisConnected: queueHealth.redis.connected,
    redisError: queueHealth.redis.error,
    sendEmailPending: sendEmailQueue?.pending ?? 0,
    sendEmailRunning: sendEmailQueue?.running ?? 0,
    sendEmailFailed: sendEmailQueue?.failed ?? 0,
    sendEmailDead: sendEmailQueue?.dead ?? 0,
    staleRunning: sendEmailQueue?.staleRunning ?? queueHealth.totals.staleRunning,
    oldestPendingJobAgeMs: sendEmailQueue?.oldestPendingJobAgeMs ?? queueHealth.oldestPendingJobAgeMs,
  };

  if (!message) {
    addCheck({
      id: 'message_exists',
      label: 'Message exists',
      status: 'block',
      reason: 'Message was not found in this workspace.',
      remediationTarget: 'approval_queue',
    });
    addQueueChecks(addCheck, queueSummary);
    return finalize(params.traceId, checks, { queue: queueSummary });
  }

  const sender = await resolveSender(params.organizationId, message);
  const domain = sender?.domain || null;
  const lead = message.lead;
  const campaign = message.campaign;

  // ═══════════════════════════════════════════════════════════
  // PRE-SEND GUARDS 6-GATE SEQUENCE (STRICT ORDER)
  // 1. autonomy_paused
  // 2. daily_limit_reached
  // 3. email_not_verified
  // 4. lead_opted_out
  // 5. outside_send_window
  // 6. score_below_threshold
  // ═══════════════════════════════════════════════════════════

  // Gate 1: autonomy_paused
  const userPref = await db.userPreference.findFirst({
    where: {
      OR: [
        { activeOrgId: params.organizationId, autonomyPaused: true },
        { organization: { id: params.organizationId }, autonomyPaused: true },
      ],
    },
  });
  const isAutonomyPaused = Boolean(userPref?.autonomyPaused);
  addCheck({
    id: 'autonomy_paused',
    label: 'Autonomy status active',
    status: isAutonomyPaused ? 'block' : 'pass',
    reason: isAutonomyPaused
      ? 'Outreach paused: Autonomy killswitch is active for this workspace.'
      : 'Autonomy is active.',
    remediationTarget: isAutonomyPaused ? 'autonomy_panel' : undefined,
  });

  // Gate 2: daily_limit_reached
  const today = new Date().toISOString().split('T')[0];
  const isDateToday = (d: any) => d instanceof Date ? d.toISOString().split('T')[0] === today : String(d || '').startsWith(today);

  const campaignSentToday = (campaign && isDateToday(campaign.dailySendsDate)) ? (campaign.dailySendsCount ?? 0) : 0;
  const campaignLimitReached = campaign ? campaignSentToday >= (campaign.maxDailySends ?? 50) : false;

  const senderSentToday = (sender && isDateToday(sender.sentTodayDate || sender.dailySendsDate)) ? (sender.sentToday || sender.dailySendsCount || 0) : 0;
  const senderLimitReached = sender ? senderSentToday >= (sender.dailyLimit ?? 50) : false;

  const domainSentToday = (domain && isDateToday(domain.dailySendsDate)) ? (domain.dailySendsCount ?? 0) : 0;
  const domainLimitReached = domain ? domainSentToday >= (domain.dailyLimit ?? 50) : false;

  const dailySendLimit = userPref?.dailySendLimit ?? 50;
  let workspaceSendsToday = 0;
  try {
    const { getDailySendCount } = await import('@/lib/redis');
    workspaceSendsToday = await getDailySendCount(params.organizationId);
  } catch {
    workspaceSendsToday = 0;
  }
  const workspaceLimitReached = workspaceSendsToday >= dailySendLimit;

  const isDailyLimitReached = campaignLimitReached || senderLimitReached || domainLimitReached || workspaceLimitReached;
  addCheck({
    id: 'daily_limit_reached',
    label: 'Daily sending limit available',
    status: isDailyLimitReached ? 'block' : 'pass',
    reason: isDailyLimitReached
      ? `Daily sending limit reached (${
          campaignLimitReached ? `Campaign: ${campaignSentToday}/${campaign?.maxDailySends}` :
          domainLimitReached ? `Domain: ${domainSentToday}/${domain?.dailyLimit}` :
          senderLimitReached ? `Sender: ${senderSentToday}/${sender?.dailyLimit}` :
          `Workspace: ${workspaceSendsToday}/${dailySendLimit}`
        }).`
      : 'Daily sending limits available.',
    remediationTarget: isDailyLimitReached ? 'deliverability' : undefined,
  });

  // Gate 3: email_not_verified
  const emailCheck = lead ? validateEmail(lead.email) : { valid: false, reason: 'No lead or email provided' };
  let isEmailVerified = false;
  if (lead && emailCheck.valid) {
    if (lead.emailVerified === true || lead.status === 'enriched' || lead.status === 'approved') {
      isEmailVerified = true;
    } else {
      const verifiedQueueItem = await db.enrichmentQueue.findFirst({
        where: {
          leadId: lead.id,
          status: { in: ['MX_VERIFIED', 'ENRICHED', 'SKIPPED'] },
        },
      });
      if (verifiedQueueItem) isEmailVerified = true;
    }
  }

  addCheck({
    id: 'email_not_verified',
    label: 'Email address verified',
    status: isEmailVerified ? 'pass' : 'block',
    reason: isEmailVerified
      ? 'Lead email address passed MX/enrichment verification.'
      : lead
        ? (!emailCheck.valid ? `Invalid email address: ${emailCheck.reason}` : 'Lead email address has not passed MX/enrichment verification.')
        : 'Lead was not found for this message.',
    remediationTarget: isEmailVerified ? undefined : 'lead_record',
  });

  // Gate 4: lead_opted_out
  let isLeadOptedOut = false;
  if (!lead) {
    isLeadOptedOut = true;
  } else {
    const onDnc = await isOnDncList(lead.email, params.organizationId);
    isLeadOptedOut = Boolean(lead.isBlacklisted || lead.doNotContact || lead.status === 'unsubscribed' || onDnc);
  }

  addCheck({
    id: 'lead_opted_out',
    label: 'Lead opted out / DNC suppression',
    status: isLeadOptedOut ? 'block' : 'pass',
    reason: isLeadOptedOut
      ? 'Lead is suppressed: recipient has opted out, is blacklisted, or is on workspace DNC list.'
      : 'Lead has not opted out.',
    remediationTarget: isLeadOptedOut ? 'dnc_list' : undefined,
  });

  // Gate 5: outside_send_window
  const inSendWindow = isInSendWindow((lead as any)?.timezone || undefined);
  const isApprovedMsg = message.status === 'approved';
  // Strictly block outside send window for QUEUED emails or when enforceSendWindow is explicitly requested
  const isBlockedByWindow = !inSendWindow && (!isApprovedMsg || (params as any).enforceSendWindow === true);

  addCheck({
    id: 'outside_send_window',
    label: 'Sending window active',
    status: isBlockedByWindow ? 'block' : 'pass',
    reason: isBlockedByWindow
      ? 'Current time is outside the optimal sending window (business hours).'
      : inSendWindow
        ? 'Current time is within the active sending window.'
        : 'Message has human approval; send window restriction waived.',
    remediationTarget: isBlockedByWindow ? 'campaign_settings' : undefined,
  });

  // Gate 6: score_below_threshold
  const leadScore = lead?.score ?? (lead as any)?.leadScore ?? 0;
  const minThreshold = (params as any).minLeadScore ?? campaign?.autonomyMinScore ?? userPref?.minLeadScore ?? (isApprovedMsg ? 0 : 50.0);
  const isBelowScoreThreshold = !isApprovedMsg && (leadScore < minThreshold);

  addCheck({
    id: 'score_below_threshold',
    label: 'Lead score qualification threshold',
    status: isBelowScoreThreshold ? 'block' : 'pass',
    reason: isBelowScoreThreshold
      ? `Lead score (${leadScore}) is below qualification threshold (${minThreshold}).`
      : `Lead score (${leadScore}) meets minimum threshold (${minThreshold}).`,
    remediationTarget: isBelowScoreThreshold ? 'lead_record' : undefined,
  });

  // ═══════════════════════════════════════════════════════════
  // DISPATCH STATUS HARMONIZATION & DELIVERABILITY DEFENSE
  // ═══════════════════════════════════════════════════════════

  const isSendableStatus = ['approved', 'QUEUED', 'queued', 'sending'].includes(message.status);
  addCheck({
    id: 'message_approved',
    label: 'Message approved / queued',
    status: isSendableStatus ? 'pass' : 'block',
    reason: isSendableStatus
      ? `Message is in sendable status: ${message.status}.`
      : `Message must be approved or queued before sending; current status is ${message.status}.`,
    remediationTarget: isSendableStatus ? undefined : 'approval_queue',
  });

  if (!lead) {
    addCheck({ id: 'lead_exists', label: 'Lead exists', status: 'block', reason: 'Lead was not found for this message.', remediationTarget: 'lead_record' });
  } else {
    addCheck({
      id: 'lead_not_blacklisted',
      label: 'Lead is not blacklisted',
      status: lead.isBlacklisted ? 'block' : 'pass',
      reason: lead.isBlacklisted ? 'Lead is blacklisted.' : 'Lead is not blacklisted.',
      remediationTarget: lead.isBlacklisted ? 'lead_record' : undefined,
    });
    addCheck({
      id: 'lead_not_dnc',
      label: 'Lead is not DNC',
      status: lead.doNotContact ? 'block' : 'pass',
      reason: lead.doNotContact ? 'Lead is marked do-not-contact.' : 'Lead is not marked do-not-contact.',
      remediationTarget: lead.doNotContact ? 'lead_record' : undefined,
    });
    const onDnc = await isOnDncList(lead.email, params.organizationId);
    addCheck({
      id: 'email_not_dnc',
      label: 'Email is not on DNC list',
      status: onDnc ? 'block' : 'pass',
      reason: onDnc ? 'Email is on the workspace do-not-contact list.' : 'Email is not on the workspace do-not-contact list.',
      remediationTarget: onDnc ? 'dnc_list' : undefined,
    });
    addCheck({
      id: 'lead_not_unsubscribed',
      label: 'Lead has not unsubscribed',
      status: lead.status === 'unsubscribed' ? 'block' : 'pass',
      reason: lead.status === 'unsubscribed' ? 'Lead has unsubscribed.' : 'Lead has not unsubscribed.',
      remediationTarget: lead.status === 'unsubscribed' ? 'lead_record' : undefined,
    });
    addCheck({
      id: 'valid_email',
      label: 'Email address is valid',
      status: emailCheck.valid ? 'pass' : 'block',
      reason: emailCheck.valid ? 'Email address passes format validation.' : `Invalid email: ${emailCheck.reason}`,
      remediationTarget: emailCheck.valid ? undefined : 'lead_record',
    });
  }

  if (campaign) {
    const inactive = ['paused', 'archived', 'completed'].includes(campaign.status);
    addCheck({
      id: 'campaign_active',
      label: 'Campaign is active',
      status: inactive ? 'block' : 'pass',
      reason: inactive
        ? `Campaign is not sendable: ${campaign.status}${campaign.pausedReason ? ` (${campaign.pausedReason})` : ''}.`
        : `Campaign status is ${campaign.status}.`,
      remediationTarget: inactive ? 'campaign_settings' : undefined,
    });
    addCheck({
      id: 'campaign_daily_limit',
      label: 'Campaign daily limit available',
      status: campaignSentToday >= (campaign.maxDailySends ?? 50) ? 'block' : 'pass',
      reason: campaignSentToday >= (campaign.maxDailySends ?? 50)
        ? `Campaign daily limit reached (${campaignSentToday}/${campaign.maxDailySends}).`
        : `Campaign has ${(campaign.maxDailySends ?? 50) - campaignSentToday} sends remaining today.`,
      remediationTarget: campaignSentToday >= (campaign.maxDailySends ?? 50) ? 'campaign_settings' : undefined,
    });
  } else {
    addCheck({
      id: 'campaign_optional',
      label: 'Campaign context',
      status: 'pass',
      reason: 'No campaign is attached; campaign limits do not apply.',
    });
  }

  addCheck({
    id: 'sender_exists',
    label: 'Sender exists',
    status: sender ? 'pass' : 'block',
    reason: sender ? `Sender resolved: ${sender.email}.` : 'No sender is available for this workspace/campaign.',
    remediationTarget: sender ? undefined : 'deliverability',
  });

  if (sender) {
    addCheck({
      id: 'sender_active',
      label: 'Sender is active',
      status: sender.status === 'active' ? 'pass' : 'block',
      reason: sender.status === 'active' ? 'Sender is active.' : `Sender is not active: ${sender.status}.`,
      remediationTarget: sender.status === 'active' ? undefined : 'deliverability',
    });

    const today = new Date().toISOString().split('T')[0];
    const isDateToday = (d: any) => d instanceof Date ? d.toISOString().split('T')[0] === today : String(d || '').startsWith(today);
    const sentToday = isDateToday(sender.sentTodayDate) ? sender.sentToday : 0;
    addCheck({
      id: 'sender_daily_limit',
      label: 'Sender daily limit available',
      status: sentToday >= sender.dailyLimit ? 'block' : 'pass',
      reason: sentToday >= sender.dailyLimit
        ? `Sender daily limit reached (${sentToday}/${sender.dailyLimit}).`
        : `Sender has ${sender.dailyLimit - sentToday} sends remaining today.`,
      remediationTarget: sentToday >= sender.dailyLimit ? 'deliverability' : undefined,
    });

    addReputationCheck(addCheck, 'sender_reputation', 'Sender reputation healthy', sender.reputationScore, 'sender');
  }

  addCheck({
    id: 'domain_exists',
    label: 'Sending domain exists',
    status: domain ? 'pass' : 'block',
    reason: domain ? `Domain resolved: ${domain.domain}.` : 'No sending domain is attached to the selected sender.',
    remediationTarget: domain ? undefined : 'deliverability',
  });

  if (domain) {
    const isDomainVerified = domain.status === 'verified' || domain.status === 'active';
    addCheck({
      id: 'domain_verified',
      label: 'Domain verified',
      status: isDomainVerified ? 'pass' : 'block',
      reason: isDomainVerified ? 'Domain is verified.' : `Sending domain is not verified: ${domain.status}.`,
      remediationTarget: isDomainVerified ? undefined : 'deliverability',
    });

    addReputationCheck(addCheck, 'domain_reputation', 'Domain reputation healthy', domain.reputationScore, 'domain');

    const today = new Date().toISOString().split('T')[0];
    const isDateToday = (d: any) => d instanceof Date ? d.toISOString().split('T')[0] === today : String(d || '').startsWith(today);
    const domainSentToday = isDateToday(domain.dailySendsDate) ? (domain.dailySendsCount ?? 0) : 0;
    addCheck({
      id: 'domain_daily_limit',
      label: 'Domain daily limit available',
      status: domainSentToday >= domain.dailyLimit ? 'block' : 'pass',
      reason: domainSentToday >= domain.dailyLimit
        ? `Domain daily limit reached (${domainSentToday}/${domain.dailyLimit}).`
        : `Domain has ${domain.dailyLimit - domainSentToday} sends remaining today.`,
      remediationTarget: domainSentToday >= domain.dailyLimit ? 'deliverability' : undefined,
    });

    const warmup = await canSendMore(domain.id, params.organizationId).catch(error => ({ allowed: false, reason: error instanceof Error ? error.message : String(error) }));
    addCheck({
      id: 'domain_warmup_limit',
      label: 'Warmup limit available',
      status: warmup.allowed ? 'pass' : 'block',
      reason: warmup.allowed ? 'Domain warmup allows another send.' : warmup.reason || 'Domain warmup limit reached.',
      remediationTarget: warmup.allowed ? undefined : 'deliverability',
    });

    const pause = await shouldPauseSending(domain.id, params.organizationId).catch(error => ({ pause: true, reason: error instanceof Error ? error.message : String(error) }));
    addCheck({
      id: 'domain_not_paused',
      label: 'Domain is not paused',
      status: pause.pause ? 'block' : 'pass',
      reason: pause.pause ? `Sending paused: ${pause.reason}` : 'Domain reputation thresholds allow sending.',
      remediationTarget: pause.pause ? 'deliverability' : undefined,
    });

    // Execute the risk evaluation pipeline
    const riskAssessment = await evaluateRisk({
      organizationId: params.organizationId,
      domainId: domain.id,
      campaignId: campaign?.id,
      leadId: lead?.id,
      messageId: message.id,
      senderId: sender?.id,
      strategyName: message.strategy || undefined,
    });

    addCheck({
      id: 'risk_evaluation_circuit_breaker',
      label: 'Risk: Deliverability Circuit Breaker',
      status: riskAssessment.checks.circuitBreaker.status,
      reason: riskAssessment.checks.circuitBreaker.reason || 'Circuit breaker metrics are healthy.',
      remediationTarget: riskAssessment.checks.circuitBreaker.status !== 'pass' ? 'deliverability' : undefined,
    });

    addCheck({
      id: 'risk_evaluation_strategy',
      label: 'Risk: Strategy and Spam Evaluation',
      status: riskAssessment.checks.strategyRisk.status,
      reason: riskAssessment.checks.strategyRisk.reason || 'Strategy and spam risks are low.',
      remediationTarget: riskAssessment.checks.strategyRisk.status !== 'pass' ? 'lead_record' : undefined,
    });

    addCheck({
      id: 'risk_evaluation_pacing',
      label: 'Risk: Budget and Pacing',
      status: riskAssessment.checks.pacingAndBudget.status,
      reason: riskAssessment.checks.pacingAndBudget.reason || 'Campaign limits and pacing are compliant.',
      remediationTarget: riskAssessment.checks.pacingAndBudget.status !== 'pass' ? 'campaign_settings' : undefined,
    });

    addCheck({
      id: 'risk_evaluation_sender_pool',
      label: 'Risk: Sender Pool Health',
      status: riskAssessment.checks.senderPoolHealth.status,
      reason: riskAssessment.checks.senderPoolHealth.reason || 'Sender pool health is high.',
      remediationTarget: riskAssessment.checks.senderPoolHealth.status !== 'pass' ? 'deliverability' : undefined,
    });
  }

  addQueueChecks(addCheck, queueSummary);

  return finalize(params.traceId, checks, {
    message: toMessageSummary(message),
    lead: lead ? toLeadSummary(lead) : undefined,
    campaign: campaign ? toCampaignSummary(campaign) : undefined,
    sender: sender ? toSenderSummary(sender) : undefined,
    domain: domain ? toDomainSummary(domain) : undefined,
    queue: queueSummary,
  });
}

export async function assertReadyToSend(params: {
  organizationId: string;
  messageId: string;
  traceId: string;
  enforceSendWindow?: boolean;
  minLeadScore?: number;
  claim?: boolean;
}): Promise<{
  readiness: SendReadinessResult;
  lead: Lead;
  campaign?: Campaign;
  message: OutreachMessage;
  sender: SenderAccount;
  domain: SendingDomain;
}> {
  const readiness = await evaluateSendReadiness(params);
  if (!readiness.ready) {
    const blocked = readiness.checks.filter(check => check.status === 'block').map(check => check.reason).join('; ');
    throw new Error(blocked || 'Send readiness failed');
  }

  // Atomic Compare-And-Swap (CAS) claim if requested
  if (params.claim) {
    const claimRes = await db.outreachMessage.updateMany({
      where: {
        id: params.messageId,
        organizationId: params.organizationId,
        status: { in: ['approved', 'QUEUED', 'queued'] },
      },
      data: { status: 'sending' },
    });
    if (claimRes.count === 0) {
      const current = await db.outreachMessage.findFirst({
        where: { id: params.messageId, organizationId: params.organizationId },
      });
      if (current?.status !== 'sending') {
        throw new Error(`Message ${params.messageId} already claimed or not in sendable state (status: ${current?.status})`);
      }
    }
  }

  const message = await db.outreachMessage.findFirst({
    where: { id: params.messageId, organizationId: params.organizationId },
    include: { lead: true, campaign: true },
  });
  if (!message) throw new Error('Message not found');

  const sender = readiness.resolved.sender?.id
    ? await db.senderAccount.findFirst({ where: { id: readiness.resolved.sender.id, organizationId: params.organizationId } })
    : null;
  if (!sender) throw new Error('Sender not found');

  const domain = readiness.resolved.domain?.id
    ? await db.sendingDomain.findFirst({ where: { id: readiness.resolved.domain.id, organizationId: params.organizationId } })
    : null;
  if (!domain) throw new Error('Domain not found');

  return {
    readiness,
    lead: message.lead,
    campaign: message.campaign || undefined,
    message,
    sender,
    domain,
  };
}

/**
 * Helper to check the 6 pre-send guards in strict sequence:
 * (1) autonomy_paused, (2) daily_limit_reached, (3) email_not_verified,
 * (4) lead_opted_out, (5) outside_send_window, (6) score_below_threshold
 */
export async function checkPreSendGuards(params: {
  organizationId: string;
  messageId: string;
  traceId?: string;
  enforceSendWindow?: boolean;
  minLeadScore?: number;
}): Promise<{
  passed: boolean;
  blockedGate?: string;
  reason?: string;
  checks: SendReadinessCheck[];
}> {
  const readiness = await evaluateSendReadiness({
    organizationId: params.organizationId,
    messageId: params.messageId,
    traceId: params.traceId || `guard_${Date.now()}`,
    enforceSendWindow: params.enforceSendWindow,
    minLeadScore: params.minLeadScore,
  });

  const coreGateIds = [
    'autonomy_paused',
    'daily_limit_reached',
    'email_not_verified',
    'lead_opted_out',
    'outside_send_window',
    'score_below_threshold',
  ];

  const coreChecks = readiness.checks.filter(c => coreGateIds.includes(c.id));
  const blockedCheck = coreChecks.find(c => c.status === 'block');

  return {
    passed: !blockedCheck,
    blockedGate: blockedCheck?.id,
    reason: blockedCheck?.reason,
    checks: coreChecks,
  };
}

async function resolveSender(organizationId: string, message: MessageWithRelations): Promise<SenderWithDomain | null> {
  if (message.senderId) {
    return db.senderAccount.findFirst({
      where: { id: message.senderId, organizationId },
      include: { domain: true },
    });
  }

  let pooledSenderIds: string[] | undefined;
  if (message.campaignId) {
    const pool = await db.campaignSenderPool.findMany({
      where: { organizationId, campaignId: message.campaignId, enabled: true, senderId: { not: null } },
      select: { senderId: true },
    });
    pooledSenderIds = pool.map(row => row.senderId).filter((id): id is string => Boolean(id));
  }

  const candidates = await db.senderAccount.findMany({
    where: {
      organizationId,
      ...(pooledSenderIds && pooledSenderIds.length > 0 ? { id: { in: pooledSenderIds } } : {}),
    },
    include: { domain: true },
    orderBy: [{ lastSentAt: 'asc' }, { reputationScore: 'desc' }],
  });

  return candidates.sort(senderSort)[0] || null;
}

function senderSort(a: SenderWithDomain, b: SenderWithDomain): number {
  const score = (sender: SenderWithDomain) => {
    let value = 0;
    if (sender.status === 'active') value += 100;
    if (sender.domain?.status === 'verified') value += 100;
    value += sender.reputationScore;
    value += sender.domain?.reputationScore || 0;
    return value;
  };
  return score(b) - score(a);
}

function addReputationCheck(
  addCheck: (check: Omit<SendReadinessCheck, 'statusLabel'>) => void,
  id: string,
  label: string,
  score: number,
  target: string,
) {
  const status: ReadinessStatus = score < 30 ? 'block' : score < 50 ? 'warn' : 'pass';
  addCheck({
    id,
    label,
    status,
    reason: status === 'pass'
      ? `${label}: ${score.toFixed(0)}/100.`
      : status === 'warn'
        ? `${label} is marginal: ${score.toFixed(0)}/100.`
        : `${label} is too low: ${score.toFixed(0)}/100.`,
    remediationTarget: status === 'pass' ? undefined : target,
  });
}

function addQueueChecks(
  addCheck: (check: Omit<SendReadinessCheck, 'statusLabel'>) => void,
  queue: QueueReadinessSummary,
) {
  addCheck({
    id: 'redis_configured',
    label: 'Redis configured',
    status: queue.redisConfigured ? 'pass' : 'warn',
    reason: queue.redisConfigured
      ? 'REDIS_URL is configured.'
      : 'REDIS_URL is not configured; send jobs will be recorded but not processed by BullMQ.',
    remediationTarget: queue.redisConfigured ? undefined : 'worker',
  });

  addCheck({
    id: 'redis_connected',
    label: 'Redis connected',
    status: queue.redisConfigured && !queue.redisConnected ? 'warn' : 'pass',
    reason: queue.redisConfigured
      ? queue.redisConnected
        ? 'Redis is reachable.'
        : `Redis is not reachable${queue.redisError ? `: ${queue.redisError}` : '.'}`
      : 'Redis connection skipped because REDIS_URL is not configured.',
    remediationTarget: queue.redisConfigured && !queue.redisConnected ? 'worker' : undefined,
  });

  addCheck({
    id: 'worker_queue_health',
    label: 'Worker queue health',
    status: queue.staleRunning > 0 || queue.sendEmailDead > 0 ? 'warn' : 'pass',
    reason: queue.staleRunning > 0
      ? `${queue.staleRunning} send-email job(s) look stale.`
      : queue.sendEmailDead > 0
        ? `${queue.sendEmailDead} dead send-email job(s) need review.`
        : 'No stale or dead send-email jobs detected.',
    remediationTarget: queue.staleRunning > 0 || queue.sendEmailDead > 0 ? 'job_health' : undefined,
  });
}

function finalize(traceId: string, checks: SendReadinessCheck[], resolved: SendReadinessResult['resolved']): SendReadinessResult {
  return {
    ready: !checks.some(check => check.status === 'block'),
    traceId,
    checks,
    resolved,
  };
}

function statusLabel(status: ReadinessStatus): SendReadinessCheck['statusLabel'] {
  if (status === 'pass') return 'Ready';
  if (status === 'warn') return 'Can queue, but review first';
  return 'Cannot send';
}

function toLeadSummary(lead: Lead): LeadSummary {
  return {
    id: lead.id,
    name: lead.name,
    email: lead.email,
    status: lead.status,
    isBlacklisted: lead.isBlacklisted,
    doNotContact: lead.doNotContact,
  };
}

function toCampaignSummary(campaign: Campaign): CampaignSummary {
  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    maxDailySends: campaign.maxDailySends ?? 50,
    dailySendsCount: campaign.dailySendsCount ?? 0,
  };
}

function toMessageSummary(message: OutreachMessage): MessageSummary {
  return {
    id: message.id,
    status: message.status,
    subject: message.subject,
  };
}

function toSenderSummary(sender: SenderAccount): SenderSummary {
  return {
    id: sender.id,
    email: sender.email,
    name: sender.name,
    status: sender.status,
    dailyLimit: sender.dailyLimit,
    sentToday: sender.sentToday,
    reputationScore: sender.reputationScore,
  };
}

function toDomainSummary(domain: SendingDomain): DomainSummary {
  return {
    id: domain.id,
    domain: domain.domain,
    status: domain.status,
    dailyLimit: domain.dailyLimit,
    dailySendsCount: domain.dailySendsCount ?? 0,
    reputationScore: domain.reputationScore ?? 90,
    spfVerified: domain.spfVerified,
    dkimVerified: domain.dkimVerified,
    dmarcVerified: domain.dmarcVerified,
  };
}
