import { Campaign, Lead, OutreachMessage, SenderAccount, SendingDomain } from '@prisma/client';
import { db } from '@/lib/db';
import { isOnDncList, validateEmail } from '@/lib/safety';
import { canSendMore } from '@/lib/deliverability/warmup-manager';
import { shouldPauseSending } from '@/lib/deliverability/reputation-tracker';
import { getJobHealth, type JobHealth } from '@/lib/queue/health';

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
    });
    addQueueChecks(addCheck, queueSummary);
    return finalize(params.traceId, checks, { queue: queueSummary });
  }

  addCheck({
    id: 'message_approved',
    label: 'Message approved',
    status: message.status === 'approved' ? 'pass' : 'block',
    reason: message.status === 'approved'
      ? 'Message has been approved by a human.'
      : `Message must be approved before sending; current status is ${message.status}.`,
    remediationTarget: message.status === 'approved' ? undefined : 'approval_queue',
  });

  const lead = message.lead;
  if (!lead) {
    addCheck({ id: 'lead_exists', label: 'Lead exists', status: 'block', reason: 'Lead was not found for this message.' });
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
    const emailCheck = validateEmail(lead.email);
    addCheck({
      id: 'valid_email',
      label: 'Email address is valid',
      status: emailCheck.valid ? 'pass' : 'block',
      reason: emailCheck.valid ? 'Email address passes format validation.' : `Invalid email: ${emailCheck.reason}`,
      remediationTarget: emailCheck.valid ? undefined : 'lead_record',
    });
  }

  const campaign = message.campaign;
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
    const today = new Date().toISOString().split('T')[0];
    const campaignSentToday = campaign.dailySendsDate === today ? campaign.dailySendsCount : 0;
    addCheck({
      id: 'campaign_daily_limit',
      label: 'Campaign daily limit available',
      status: campaignSentToday >= campaign.maxDailySends ? 'block' : 'pass',
      reason: campaignSentToday >= campaign.maxDailySends
        ? `Campaign daily limit reached (${campaignSentToday}/${campaign.maxDailySends}).`
        : `Campaign has ${campaign.maxDailySends - campaignSentToday} sends remaining today.`,
      remediationTarget: campaignSentToday >= campaign.maxDailySends ? 'campaign_settings' : undefined,
    });
  } else {
    addCheck({
      id: 'campaign_optional',
      label: 'Campaign context',
      status: 'pass',
      reason: 'No campaign is attached; campaign limits do not apply.',
    });
  }

  const sender = await resolveSender(params.organizationId, message);
  const domain = sender?.domain || null;

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
    const sentToday = sender.sentTodayDate === today ? sender.sentToday : 0;
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
    addCheck({
      id: 'domain_verified',
      label: 'Domain verified',
      status: domain.status === 'verified' ? 'pass' : 'block',
      reason: domain.status === 'verified' ? 'Domain is verified.' : `Sending domain is not verified: ${domain.status}.`,
      remediationTarget: domain.status === 'verified' ? undefined : 'deliverability',
    });

    addReputationCheck(addCheck, 'domain_reputation', 'Domain reputation healthy', domain.reputationScore, 'domain');

    const today = new Date().toISOString().split('T')[0];
    const domainSentToday = domain.dailySendsDate === today ? domain.dailySendsCount : 0;
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
    maxDailySends: campaign.maxDailySends,
    dailySendsCount: campaign.dailySendsCount,
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
    dailySendsCount: domain.dailySendsCount,
    reputationScore: domain.reputationScore,
    spfVerified: domain.spfVerified,
    dkimVerified: domain.dkimVerified,
    dmarcVerified: domain.dmarcVerified,
  };
}
