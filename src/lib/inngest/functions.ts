import { inngest } from './client';
import { db } from '@/lib/db';
import { trackDailySendCount, getDailySendCount } from '@/lib/redis';
import { DeliverabilityService } from '@/lib/deliverability';
import { verifyMxRecord } from '@/lib/deliverability/mx-verifier';
import { recordAgentEvent } from '@/lib/agents/infrastructure/observability';
import { OutreachEmailStatus, EmailGeneratedBy, EnrichmentStatus } from '@prisma/client';

/**
 * Observe Phase Inngest Function
 */
export const observeFunction = (inngest.createFunction as any)(
  { id: 'observe-phase', name: 'Observe Phase — Ingest Signals & Queue Enrichment', event: 'pipeline/observe' },
  async ({ event, step }) => {
    const { orgId, leadId } = event.data;

    // Check if ICP Criteria exists for the organization
    const icp = await step.run('check-icp', async () => {
      return db.icpCriteria.findUnique({ where: { organizationId: orgId } });
    });

    if (!icp) {
      await step.run('log-missing-icp', async () => {
        await db.pipelineRun.create({
          data: {
            organizationId: orgId,
            phase: 'observe',
            status: 'halted_no_icp',
            output: JSON.stringify({ event: 'observe:icp_not_configured' }),
          },
        });
      });
      return { status: 'halted', reason: 'observe:icp_not_configured' };
    }

    // Ingest and dedup signals
    const signalsResult = await step.run('ingest-signals', async () => {
      const leads = leadId
        ? await db.lead.findMany({ where: { id: leadId, organizationId: orgId } })
        : await db.lead.findMany({ where: { organizationId: orgId, status: 'new' }, take: 50 });

      let ingested = 0;
      let deduped = 0;

      for (const lead of leads) {
        // Create EnrichmentQueue row if missing
        const existingQueue = await db.enrichmentQueue.findFirst({
          where: { leadId: lead.id, organizationId: orgId },
        });

        if (!existingQueue) {
          await db.enrichmentQueue.create({
            data: {
              organizationId: orgId,
              leadId: lead.id,
              email: lead.email,
              status: EnrichmentStatus.PENDING,
            },
          });
        }

        // Generate synthetic signal if lead has no signals
        const existingSignals = await db.signal.findMany({ where: { leadId: lead.id } });
        if (existingSignals.length === 0) {
          await db.signal.create({
            data: {
              organizationId: orgId,
              leadId: lead.id,
              type: 'hiring',
              content: `${lead.company || 'Company'} is hiring engineers and scaling headcount.`,
              score: 75.0,
              relevance: 0.8,
              confidence: 0.85,
              urgency: 0.75,
            },
          });
          ingested++;
        } else {
          deduped++;
        }
      }

      return { processedLeads: leads.length, ingested, deduped };
    });

    await recordAgentEvent({
      organizationId: orgId,
      leadId,
      agentName: 'InngestWorker',
      stepName: 'observe_phase',
      phase: 'observe',
      message: `Inngest Observe completed: ${signalsResult.processedLeads} leads processed`,
      outputData: signalsResult,
    }).catch(() => {});

    return { status: 'completed', phase: 'observe', ...signalsResult };
  }
);

/**
 * Think Phase Inngest Function
 */
export const thinkFunction = (inngest.createFunction as any)(
  { id: 'think-phase', name: 'Think Phase — Score Leads & Generate AI Emails', event: 'pipeline/think' },
  async ({ event, step }) => {
    const { orgId } = event.data;

    const result = await step.run('score-and-draft', async () => {
      const icp = await db.icpCriteria.findUnique({ where: { organizationId: orgId } });
      const minScore = icp?.minSignalScore ?? 50.0;

      const leads = await db.lead.findMany({
        where: { organizationId: orgId },
        include: { signals: true, enrichmentQueues: true },
      });

      let scored = 0;
      let qualified = 0;
      let disqualified = 0;
      let drafted = 0;

      for (const lead of leads) {
        // Calculate 0-100 score:
        // 40 pts firmographic + 20 pts technographic + 30 pts signal + 10 pts enrichment status
        let score = 0;
        if (lead.company) score += 25;
        if (lead.title) score += 15;
        score += 20; // technographic match default
        
        const topSignal = lead.signals[0];
        if (topSignal) score += Math.round((topSignal.score / 100) * 30);

        const isMxVerified = lead.enrichmentQueues.some(q => q.status === EnrichmentStatus.MX_VERIFIED || q.status === EnrichmentStatus.ENRICHED);
        if (isMxVerified) score += 10;

        score = Math.min(100, Math.max(0, score));
        scored++;

        // Update lead score
        await db.lead.update({
          where: { id: lead.id },
          data: { score, status: score >= minScore ? 'scored' : 'disqualified' },
        });

        if (score >= minScore) {
          qualified++;

          // Draft email if no queued email exists
          const existingDraft = await db.outreachEmail.findFirst({
            where: { leadId: lead.id, status: OutreachEmailStatus.QUEUED },
          });

          if (!existingDraft) {
            const firstName = lead.firstName || lead.name.split(' ')[0] || 'there';
            await db.outreachEmail.create({
              data: {
                organizationId: orgId,
                leadId: lead.id,
                subject: `${firstName}, quick question regarding ${lead.company || 'your team'}`,
                body: `Hi ${firstName},\n\nI noticed ${lead.company || 'your team'} is expanding.\n\nWe help sales teams automate outbound response rates.\n\nWould you be open to a brief discovery call?`,
                status: OutreachEmailStatus.QUEUED,
                generatedBy: EmailGeneratedBy.AI,
              },
            });
            drafted++;
          }
        } else {
          disqualified++;
        }
      }

      return { scored, qualified, disqualified, drafted };
    });

    await recordAgentEvent({
      organizationId: orgId,
      agentName: 'InngestWorker',
      stepName: 'think_phase',
      phase: 'think',
      message: `Inngest Think completed: ${result.scored} scored, ${result.qualified} qualified, ${result.drafted} drafted`,
      outputData: result,
    }).catch(() => {});

    return { status: 'completed', phase: 'think', ...result };
  }
);

/**
 * Act Phase Inngest Function
 */
export const actFunction = (inngest.createFunction as any)(
  { id: 'act-phase', name: 'Act Phase — Dispatch Verified Outreach Emails', event: 'pipeline/act' },
  async ({ event, step }) => {
    const { orgId } = event.data;

    // 1. Check user preferences / autonomy pause kill-switch
    const pref = await step.run('check-autonomy-preferences', async () => {
      return db.userPreference.findFirst({ where: { activeOrgId: orgId } });
    });

    if (pref?.autonomyPaused) {
      return { status: 'paused', reason: 'act:paused' };
    }

    const dailyLimit = pref?.dailySendLimit ?? 50;
    const currentSends = await getDailySendCount(orgId);

    if (currentSends >= dailyLimit) {
      return { status: 'at_limit', dailyLimit, currentSends };
    }

    const dispatchResults = await step.run('dispatch-queued-emails', async () => {
      const queuedEmails = await db.outreachEmail.findMany({
        where: { organizationId: orgId, status: OutreachEmailStatus.QUEUED },
        include: { lead: { include: { enrichmentQueues: true } } },
        take: Math.max(1, dailyLimit - currentSends),
      });

      let sent = 0;
      let skippedUnverified = 0;
      let skippedScore = 0;
      let failed = 0;

      for (const emailRecord of queuedEmails) {
        const minLeadScore = pref?.minLeadScore ?? 60.0;
        if (emailRecord.lead.score < minLeadScore) {
          skippedScore++;
          continue;
        }

        // Verify enrichment gate
        const isVerified = emailRecord.lead.enrichmentQueues.some(q => 
          q.status === EnrichmentStatus.MX_VERIFIED || 
          q.status === EnrichmentStatus.ENRICHED || 
          q.status === EnrichmentStatus.SKIPPED
        );

        if (!isVerified) {
          skippedUnverified++;
          continue;
        }

        // Dispatch via Resend SDK
        const sendResult = await DeliverabilityService.sendEmail({
          to: emailRecord.lead.email,
          from: 'outreach@acmesaas.com',
          fromName: 'Alex from Acme',
          subject: emailRecord.subject,
          body: emailRecord.body,
          messageId: emailRecord.id,
          leadId: emailRecord.leadId,
          organizationId: orgId,
          dryRun: false,
        });

        if (sendResult.success) {
          await db.outreachEmail.update({
            where: { id: emailRecord.id },
            data: {
              status: OutreachEmailStatus.SENT,
              sentAt: new Date(),
              resendMessageId: sendResult.providerId || `msg_${Date.now()}`,
            },
          });

          await trackDailySendCount(orgId);
          sent++;
        } else {
          await db.outreachEmail.update({
            where: { id: emailRecord.id },
            data: { status: OutreachEmailStatus.FAILED },
          });
          failed++;
        }
      }

      return { sent, skippedUnverified, skippedScore, failed };
    });

    await recordAgentEvent({
      organizationId: orgId,
      agentName: 'InngestWorker',
      stepName: 'act_phase',
      phase: 'act',
      message: `Inngest Act completed: ${dispatchResults.sent} sent, ${dispatchResults.failed} failed`,
      outputData: dispatchResults,
    }).catch(() => {});

    return { status: 'completed', phase: 'act', ...dispatchResults };
  }
);

/**
 * Re-evaluate Phase Inngest Function
 */
export const reevaluateFunction = (inngest.createFunction as any)(
  { id: 'reevaluate-phase', name: 'Re-evaluate Phase — Audit Outcomes & Reputation', event: 'pipeline/reevaluate' },
  async ({ event, step }) => {
    const { orgId } = event.data;

    const result = await step.run('audit-outcomes', async () => {
      const totalSent = await db.outreachEmail.count({ where: { organizationId: orgId, status: OutreachEmailStatus.SENT } });
      const totalBounced = await db.outreachEmail.count({ where: { organizationId: orgId, status: OutreachEmailStatus.BOUNCED } });
      
      const bounceRate = totalSent > 0 ? totalBounced / totalSent : 0;

      if (bounceRate > 0.05) {
        // Auto-suspend sending domain if bounce rate > 5%
        await db.sendingDomain.updateMany({
          where: { organizationId: orgId, status: 'verified' },
          data: { status: 'SUSPENDED' },
        });
      }

      return { totalSent, totalBounced, bounceRate };
    });

    await recordAgentEvent({
      organizationId: orgId,
      agentName: 'InngestWorker',
      stepName: 'reevaluate_phase',
      phase: 'reeval',
      message: `Inngest Reevaluate completed: ${result.totalSent} sent, ${result.totalBounced} bounced, bounce rate ${(result.bounceRate * 100).toFixed(1)}%`,
      outputData: result,
    }).catch(() => {});

    return { status: 'completed', phase: 'reevaluate', ...result };
  }
);

/**
 * Batch Email Enrichment Function
 */
export const enrichmentBatchFunction = (inngest.createFunction as any)(
  { id: 'enrichment-batch', name: 'Enrichment Batch Worker', event: 'enrichment/batch' },
  async ({ step }) => {
    const enrichedCount = await step.run('verify-mx-records', async () => {
      const pendingItems = await db.enrichmentQueue.findMany({
        where: { status: EnrichmentStatus.PENDING },
        take: 100,
      });

      let count = 0;
      for (const item of pendingItems) {
        const result = await verifyMxRecord(item.email);

        await db.enrichmentQueue.update({
          where: { id: item.id },
          data: {
            status: result.valid ? EnrichmentStatus.MX_VERIFIED : EnrichmentStatus.MX_FAILED,
            mxValid: result.valid,
            providerData: result.exchange ? { exchange: result.exchange, priority: result.priority } : undefined,
            lastError: result.reason || null,
          },
        });

        await db.lead.update({
          where: { id: item.leadId },
          data: {
            emailVerified: result.valid,
            status: result.valid ? 'enriched' : 'disqualified',
            enrichedData: { verifiedAt: new Date().toISOString(), mxValid: result.valid, exchange: result.exchange || null },
          },
        });

        if (result.valid) {
          count++;
        }
      }

      return count;
    });

    await recordAgentEvent({
      agentName: 'InngestWorker',
      stepName: 'enrichment_batch',
      phase: 'observe',
      message: `Inngest Enrichment Batch completed: ${enrichedCount} leads verified`,
      outputData: { enrichedCount },
    }).catch(() => {});

    return { status: 'completed', enrichedCount };
  }
);
