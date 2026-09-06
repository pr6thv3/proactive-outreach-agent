import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getPipelineMetrics } from '@/lib/agents/infrastructure/observability';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';
import { getCitationQuality } from '@/lib/agents/think/evidence';

export async function GET(request?: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const organizationId = context.organizationId;

    const totalLeads = await db.lead.count({ where: { organizationId, isBlacklisted: false } });
    const newLeads = await db.lead.count({ where: { organizationId, status: 'new', isBlacklisted: false } });
    const enrichedLeads = await db.lead.count({ where: { organizationId, status: 'enriched' } });
    const scoredLeads = await db.lead.count({ where: { organizationId, status: 'scored' } });
    const generatedLeads = await db.lead.count({ where: { organizationId, status: 'generated' } });
    const approvedLeads = await db.lead.count({ where: { organizationId, status: 'approved' } });
    const sentLeads = await db.lead.count({ where: { organizationId, status: 'sent' } });
    const interestedLeads = await db.lead.count({ where: { organizationId, status: 'interested' } });
    const negativeLeads = await db.lead.count({ where: { organizationId, status: 'negative' } });
    const unsubscribedLeads = await db.lead.count({ where: { organizationId, status: 'unsubscribed' } });
    const hotLeads = await db.lead.count({ where: { organizationId, priorityTier: 'hot', isBlacklisted: false } });
    const warmLeads = await db.lead.count({ where: { organizationId, priorityTier: 'warm', isBlacklisted: false } });
    const coldLeads = await db.lead.count({ where: { organizationId, priorityTier: 'cold', isBlacklisted: false } });
    const totalMessages = await db.outreachMessage.count({ where: { organizationId } });
    const draftMessages = await db.outreachMessage.count({ where: { organizationId, status: 'draft' } });
    const generatedMessages = await db.outreachMessage.count({ where: { organizationId, status: 'generated' } });
    const approvedMessages = await db.outreachMessage.count({ where: { organizationId, status: 'approved' } });
    const sentMessages = await db.outreachMessage.count({ where: { organizationId, status: 'sent' } });
    const repliedMessages = await db.outreachMessage.count({ where: { organizationId, status: 'replied' } });
    const totalSignals = await db.signal.count({ where: { organizationId } });
    const totalFollowUps = await db.followUp.count({ where: { organizationId } });
    const scheduledFollowUps = await db.followUp.count({ where: { organizationId, status: 'scheduled' } });
    const totalDnc = await db.doNotContact.count({ where: { organizationId } });
    const recentActivities = await db.activity.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 30, include: { lead: { select: { name: true, company: true } } } });
    const recentPipelineRuns = await db.pipelineRun.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, phase: true, status: true, agentName: true, durationMs: true, createdAt: true, leadId: true, error: true, traceId: true } });

    const responseRate = sentMessages > 0 ? ((repliedMessages / sentMessages) * 100).toFixed(1) : '0';
    const interestRate = totalLeads > 0 ? ((interestedLeads / totalLeads) * 100).toFixed(1) : '0';

    // Signal breakdown by type
    const signalBreakdown = await db.signal.groupBy({ by: ['type'], where: { organizationId }, _count: { type: true }, orderBy: { _count: { type: 'desc' } } });

    // Signal urgency distribution
    const highUrgencySignals = await db.signal.count({ where: { organizationId, urgency: { gte: 0.7 } } });
    const medUrgencySignals = await db.signal.count({ where: { organizationId, urgency: { gte: 0.4, lt: 0.7 } } });
    const lowUrgencySignals = await db.signal.count({ where: { organizationId, urgency: { lt: 0.4 } } });

    // Top signals by urgency
    const topSignals = await db.signal.findMany({
      where: { organizationId, urgency: { gt: 0 } },
      orderBy: { urgency: 'desc' },
      take: 10,
      include: { lead: { select: { name: true, company: true, priorityTier: true } } },
    });

    // Channel distribution
    const channelBreakdown = await db.outreachMessage.groupBy({ by: ['channel'], where: { organizationId }, _count: { channel: true } });

    // Memory stats
    const memoryStats = await db.agentMemory.groupBy({
      by: ['category'],
      where: { organizationId },
      _count: { category: true },
      _avg: { score: true },
    });

    // Average scores
    const scoreStats = await db.lead.aggregate({
      _avg: { leadScore: true, signalScore: true, replyProb: true, conversionProb: true, spamRisk: true },
      _max: { leadScore: true },
      where: { organizationId, isBlacklisted: false },
    });

    // Queue stats
    let queueStats;
    try {
      const pending = await db.jobQueue.count({ where: { organizationId, status: 'pending' } });
      const running = await db.jobQueue.count({ where: { organizationId, status: 'running' } });
      const completed = await db.jobQueue.count({ where: { organizationId, status: 'completed' } });
      const failed = await db.jobQueue.count({ where: { organizationId, status: 'failed' } });
      const dead = await db.jobQueue.count({ where: { organizationId, status: 'dead' } });
      const byType = await db.jobQueue.groupBy({ by: ['type'], _count: { type: true }, where: { organizationId, status: { in: ['pending', 'running'] } } });
      queueStats = { pending, running, completed, failed, dead, byType: Object.fromEntries(byType.map(b => [b.type, b._count.type])) };
    } catch { queueStats = { pending: 0, running: 0, completed: 0, failed: 0, dead: 0, byType: {} }; }

    // Pipeline metrics (last 24h)
    let pipelineMetrics;
    try { pipelineMetrics = await getPipelineMetrics(24); } catch { pipelineMetrics = []; }

    const campaigns = await db.campaign.findMany({
      where: { organizationId },
      include: { _count: { select: { outreachEmails: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const deliverability = await getDeliverabilityStats(organizationId);
    const resultsLoop = await getResultsMetrics(organizationId, deliverability, {
      totalLeads,
      enrichedLeads,
      scoredLeads,
      generatedLeads,
      approvedLeads,
      sentLeads,
      interestedLeads,
      sentMessages,
      repliedMessages,
      totalSignals,
    });

    const pipelineFunnel = {
      discovered: resultsLoop.discovered,
      qualified: resultsLoop.qualified,
      contacted: resultsLoop.contacted,
      replied: resultsLoop.replies,
      interested: resultsLoop.interested,
      meetingsBooked: resultsLoop.meetings,
      positiveReplyRate: resultsLoop.positiveReplyRate,
      replyRate: resultsLoop.replyRate,
      conversionRate: resultsLoop.conversionRate,
      deliveryRate: resultsLoop.deliveryRate,
      bounceRate: resultsLoop.bounceRate,
      stages: resultsLoop.stages,
    };

    return ok({
        leads: {
          total: totalLeads, new: newLeads, enriched: enrichedLeads, scored: scoredLeads,
          generated: generatedLeads, approved: approvedLeads, sent: sentLeads,
          interested: interestedLeads, negative: negativeLeads, unsubscribed: unsubscribedLeads,
          interestRate,
          hot: hotLeads, warm: warmLeads, cold: coldLeads,
          avgLeadScore: scoreStats._avg.leadScore?.toFixed(1) || '0',
          avgSignalScore: scoreStats._avg.signalScore?.toFixed(1) || '0',
          avgReplyProb: scoreStats._avg.replyProb?.toFixed(2) || '0',
          avgConversionProb: scoreStats._avg.conversionProb?.toFixed(2) || '0',
          maxLeadScore: scoreStats._max.leadScore?.toFixed(0) || '0',
        },
        messages: {
          total: totalMessages, draft: draftMessages, generated: generatedMessages,
          approved: approvedMessages, sent: sentMessages, replied: repliedMessages,
          responseRate, channelBreakdown: channelBreakdown.map(c => ({ channel: c.channel, count: c._count.channel })),
        },
        signals: {
          total: totalSignals,
          breakdown: signalBreakdown.map(s => ({ type: s.type, count: s._count.type })),
          urgency: { high: highUrgencySignals, medium: medUrgencySignals, low: lowUrgencySignals },
          topSignals: topSignals.map(s => ({
            type: s.type, urgency: s.urgency, content: s.content.slice(0, 80),
            confidence: s.confidence,
            sourceUrl: s.sourceUrl,
            sourceTitle: s.sourceTitle,
            citationQuality: getCitationQuality({
              source: s.source,
              confidence: s.confidence,
              sourceUrl: s.sourceUrl || undefined,
              sourceTitle: s.sourceTitle || undefined,
            }),
            recommendedPitchAngle: s.recommendedPitchAngle,
            lead: s.lead?.name, company: s.lead?.company, priorityTier: s.lead?.priorityTier,
          })),
        },
        followUps: { total: totalFollowUps, scheduled: scheduledFollowUps },
        dnc: { total: totalDnc },
        campaigns,
        recentActivities,
        recentPipelineRuns,
        // Memory & queue stats
        memory: {
          categories: memoryStats.map(m => ({ category: m.category, count: m._count.category, avgScore: m._avg.score?.toFixed(2) || '0' })),
          totalEntries: memoryStats.reduce((sum, m) => sum + m._count.category, 0),
        },
        queue: queueStats,
        pipelineMetrics,

        // ─── Deliverability & Outcome-Driven Sales Pipeline Metrics ───
        deliverability,
        resultsLoop,
        results: resultsLoop,
        pipelineFunnel,
        environment: {
          resendConfigured: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim().length > 0),
          isSandboxMode: !process.env.RESEND_API_KEY || (process.env.DEFAULT_SENDER_EMAIL || '').includes('resend.dev') || !deliverability.domains.some(d => d.status === 'verified' && !d.domain.includes('resend.dev')),
          isLocalOnly: !process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.trim().length === 0,
          verifiedDomainsCount: deliverability.domains.filter(d => d.status === 'verified').length,
          defaultSender: process.env.DEFAULT_SENDER_EMAIL || 'onboarding@resend.dev',
        },
      },
    traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}

async function getDeliverabilityStats(organizationId: string) {
  try {
    const domains = await db.sendingDomain.findMany({ where: { organizationId }, orderBy: { reputationScore: 'desc' } });

    const eventsSent = await db.emailEvent.count({ where: { organizationId, eventType: 'sent' } });
    const eventsDelivered = await db.emailEvent.count({ where: { organizationId, eventType: 'delivered' } });
    const eventsBounced = await db.emailEvent.count({ where: { organizationId, eventType: 'bounced' } });
    const eventsOpened = await db.emailEvent.count({ where: { organizationId, eventType: 'opened' } });
    const eventsClicked = await db.emailEvent.count({ where: { organizationId, eventType: 'clicked' } });
    const eventsComplained = await db.emailEvent.count({ where: { organizationId, eventType: 'complained' } });

    const deliveryRate = eventsSent > 0 ? eventsDelivered / eventsSent : 0;
    const bounceRate = eventsSent > 0 ? eventsBounced / eventsSent : 0;
    const openRate = eventsDelivered > 0 ? eventsOpened / eventsDelivered : 0;
    const clickRate = eventsDelivered > 0 ? eventsClicked / eventsDelivered : 0;
    const complaintRate = eventsSent > 0 ? eventsComplained / eventsSent : 0;

    return {
      domains: domains.map(d => ({
        id: d.id,
        domain: d.domain,
        status: d.status,
        spfVerified: d.spfVerified,
        dkimVerified: d.dkimVerified,
        dmarcVerified: d.dmarcVerified,
        warmupDay: d.warmupDay,
        warmupDailyLimit: d.warmupDailyLimit,
        dailySendsCount: d.dailySendsCount,
        reputationScore: d.reputationScore,
        bounceRate: d.bounceRate,
        complaintRate: d.complaintRate,
        openRate: d.openRate,
        fromEmail: d.fromEmail,
        fromName: d.fromName,
      })),
      totalSent: eventsSent,
      totalDelivered: eventsDelivered,
      totalBounced: eventsBounced,
      totalOpened: eventsOpened,
      totalClicked: eventsClicked,
      totalComplained: eventsComplained,
      deliveryRate: deliveryRate * 100,
      bounceRate: bounceRate * 100,
      openRate: openRate * 100,
      clickRate: clickRate * 100,
      complaintRate: complaintRate * 100,
    };
  } catch {
    return { domains: [], totalSent: 0, totalDelivered: 0, totalBounced: 0, totalOpened: 0, totalClicked: 0, totalComplained: 0, deliveryRate: 0, bounceRate: 0, openRate: 0, clickRate: 0, complaintRate: 0 };
  }
}

interface OutcomeCounts {
  totalLeads: number;
  enrichedLeads: number;
  scoredLeads: number;
  generatedLeads: number;
  approvedLeads: number;
  sentLeads: number;
  interestedLeads: number;
  sentMessages: number;
  repliedMessages: number;
  totalSignals: number;
}

async function getResultsMetrics(
  organizationId: string,
  deliverability: Awaited<ReturnType<typeof getDeliverabilityStats>>,
  counts?: OutcomeCounts,
) {
  try {
    // The OUTCOME-DRIVEN SALES PIPELINE:
    // Discovered -> Qualified -> Emails Sent -> Replies -> Positive Replies (North Star) -> Meetings Booked
    const signalsFound = counts?.totalSignals ?? (await db.signal.count({ where: { organizationId } }));
    const emailsGenerated = await db.outreachMessage.count({ where: { organizationId, status: { in: ['generated', 'approved', 'sent', 'delivered', 'replied'] } } });
    const emailsSentEvent = await db.emailEvent.count({ where: { organizationId, eventType: 'sent' } });
    const emailsDelivered = await db.emailEvent.count({ where: { organizationId, eventType: 'delivered' } });
    const repliesEvent = await db.outreachMessage.count({ where: { organizationId, status: 'replied' } });
    const interestedLeads = counts?.interestedLeads ?? (await db.lead.count({ where: { organizationId, status: 'interested' } }));
    const meetingsBooked = await db.replyClassification.count({ where: { organizationId, nextAction: 'escalate' } });

    // Realign counts to respect real database state
    const discovered = counts?.totalLeads ?? (await db.lead.count({ where: { organizationId, isBlacklisted: false } }));
    const qualified = counts ? (counts.enrichedLeads + counts.scoredLeads + counts.generatedLeads + counts.approvedLeads + counts.sentLeads + counts.interestedLeads) : await db.lead.count({ where: { organizationId, status: { notIn: ['new', 'blacklisted'] } } });
    const contacted = Math.max(counts?.sentMessages ?? 0, emailsSentEvent);
    const repliesReceived = Math.max(counts?.repliedMessages ?? 0, repliesEvent);
    const positiveReplies = interestedLeads;

    // Rates
    const deliveryRate = deliverability.deliveryRate;
    const replyRate = (contacted > 0 ? (repliesReceived / contacted) : (emailsDelivered > 0 ? repliesReceived / emailsDelivered : 0)) * 100;
    const positiveReplyRate = (repliesReceived > 0 ? (positiveReplies / repliesReceived) : (contacted > 0 ? (positiveReplies / contacted) : 0)) * 100;
    const meetingConversionRate = (positiveReplies > 0 ? (meetingsBooked / positiveReplies) : (repliesReceived > 0 ? (meetingsBooked / repliesReceived) : 0)) * 100;
    const overallConversionRate = discovered > 0 ? (meetingsBooked / discovered) * 100 : 0;
    const qualificationRate = discovered > 0 ? (qualified / discovered) * 100 : 0;

    const stages = [
      {
        id: 'discovered',
        label: 'Prospects Discovered',
        stageNumber: 1,
        count: discovered,
        description: 'Autonomous multi-channel intent signals identified and ingested',
        conversionRate: 100,
        stepConversionRate: qualificationRate,
        dropOffCount: Math.max(0, discovered - qualified),
        benchmarkRate: 100,
        color: 'blue',
      },
      {
        id: 'qualified',
        label: 'Qualified',
        stageNumber: 2,
        count: qualified,
        description: 'AI-validated ICP match score, technographic fit, and verified MX mailboxes',
        conversionRate: qualificationRate,
        stepConversionRate: qualified > 0 ? Math.min(100, (contacted / qualified) * 100) : 0,
        dropOffCount: Math.max(0, qualified - contacted),
        benchmarkRate: 75.0,
        color: 'indigo',
      },
      {
        id: 'contacted',
        label: 'Emails Sent',
        stageNumber: 3,
        count: contacted,
        description: 'Dispatched through 7-gate deliverability circuit breaker with jitter pacing',
        conversionRate: discovered > 0 ? (contacted / discovered) * 100 : 0,
        stepConversionRate: replyRate,
        dropOffCount: Math.max(0, contacted - repliesReceived),
        benchmarkRate: 50.0,
        color: 'purple',
      },
      {
        id: 'replied',
        label: 'Inbound Replies',
        stageNumber: 4,
        count: repliesReceived,
        description: 'Inbound prospect responses classified by AI Smart Inbox',
        conversionRate: discovered > 0 ? (repliesReceived / discovered) * 100 : 0,
        stepConversionRate: repliesReceived > 0 ? (positiveReplies / repliesReceived) * 100 : 0,
        dropOffCount: Math.max(0, repliesReceived - positiveReplies),
        benchmarkRate: 15.0,
        color: 'teal',
      },
      {
        id: 'interested',
        label: 'Positive Replies',
        stageNumber: 5,
        isNorthStar: true,
        count: positiveReplies,
        description: '⭐ North Star Metric: High-intent prospects, demo inquiries, and pricing questions',
        conversionRate: discovered > 0 ? (positiveReplies / discovered) * 100 : 0,
        stepConversionRate: meetingConversionRate,
        dropOffCount: Math.max(0, positiveReplies - meetingsBooked),
        benchmarkRate: 25.0,
        color: 'amber',
      },
      {
        id: 'meetings_booked',
        label: 'Meetings Booked',
        stageNumber: 6,
        count: meetingsBooked,
        description: 'Qualified sales calls routed to Cal.com / calendar booking links',
        conversionRate: overallConversionRate,
        stepConversionRate: 100,
        dropOffCount: 0,
        benchmarkRate: 15.0,
        color: 'emerald',
      },
    ];

    return {
      // Legacy backward-compatible keys
      signalsFound,
      generatedEmails: emailsGenerated,
      sentEmails: contacted,
      replies: repliesReceived,
      meetings: meetingsBooked,
      deliveryRate,
      replyRate,
      positiveReplyRate,
      bounceRate: deliverability.bounceRate,
      conversionRate: overallConversionRate,

      // Elevated Outcome-Driven Pipeline fields
      discovered,
      qualified,
      contacted,
      interested: positiveReplies,
      positiveReplies,
      meetingsBooked,
      qualificationRate,
      meetingConversionRate,
      stages,
      funnelStages: stages,
    };
  } catch {
    return {
      signalsFound: 0,
      generatedEmails: 0,
      sentEmails: 0,
      replies: 0,
      meetings: 0,
      deliveryRate: 0,
      replyRate: 0,
      positiveReplyRate: 0,
      bounceRate: 0,
      conversionRate: 0,
      discovered: 0,
      qualified: 0,
      contacted: 0,
      interested: 0,
      positiveReplies: 0,
      meetingsBooked: 0,
      qualificationRate: 0,
      meetingConversionRate: 0,
      stages: [],
      funnelStages: [],
    };
  }
}
