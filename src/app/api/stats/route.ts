// ─── API: Stats ───────────────────────────────────────
// Production dashboard statistics with scoring, signal intelligence, memory, and queue stats

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { JobQueue } from '@/lib/agents/infrastructure/job-queue';
import { getPipelineMetrics } from '@/lib/agents/infrastructure/observability';

export async function GET() {
  try {
    const [
      totalLeads, newLeads, enrichedLeads, scoredLeads, generatedLeads, approvedLeads, sentLeads,
      interestedLeads, negativeLeads, unsubscribedLeads,
      hotLeads, warmLeads, coldLeads,
      totalMessages, draftMessages, generatedMessages, approvedMessages, sentMessages, repliedMessages,
      totalSignals, totalFollowUps, scheduledFollowUps, totalDnc,
      recentActivities, recentPipelineRuns,
    ] = await Promise.all([
      db.lead.count({ where: { isBlacklisted: false } }),
      db.lead.count({ where: { status: 'new', isBlacklisted: false } }),
      db.lead.count({ where: { status: 'enriched' } }),
      db.lead.count({ where: { status: 'scored' } }),
      db.lead.count({ where: { status: 'generated' } }),
      db.lead.count({ where: { status: 'approved' } }),
      db.lead.count({ where: { status: 'sent' } }),
      db.lead.count({ where: { status: 'interested' } }),
      db.lead.count({ where: { status: 'negative' } }),
      db.lead.count({ where: { status: 'unsubscribed' } }),
      db.lead.count({ where: { priorityTier: 'hot', isBlacklisted: false } }),
      db.lead.count({ where: { priorityTier: 'warm', isBlacklisted: false } }),
      db.lead.count({ where: { priorityTier: 'cold', isBlacklisted: false } }),
      db.outreachMessage.count(),
      db.outreachMessage.count({ where: { status: 'draft' } }),
      db.outreachMessage.count({ where: { status: 'generated' } }),
      db.outreachMessage.count({ where: { status: 'approved' } }),
      db.outreachMessage.count({ where: { status: 'sent' } }),
      db.outreachMessage.count({ where: { status: 'replied' } }),
      db.signal.count(),
      db.followUp.count(),
      db.followUp.count({ where: { status: 'scheduled' } }),
      db.doNotContact.count(),
      db.activity.findMany({ orderBy: { createdAt: 'desc' }, take: 30, include: { lead: { select: { name: true, company: true } } } }),
      db.pipelineRun.findMany({ orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, phase: true, status: true, agentName: true, durationMs: true, createdAt: true, leadId: true, error: true, traceId: true } }),
    ]);

    const responseRate = sentMessages > 0 ? ((repliedMessages / sentMessages) * 100).toFixed(1) : '0';
    const interestRate = totalLeads > 0 ? ((interestedLeads / totalLeads) * 100).toFixed(1) : '0';

    // Signal breakdown by type
    const signalBreakdown = await db.signal.groupBy({ by: ['type'], _count: { type: true }, orderBy: { _count: { type: 'desc' } } });

    // Signal urgency distribution
    const highUrgencySignals = await db.signal.count({ where: { urgency: { gte: 0.7 } } });
    const medUrgencySignals = await db.signal.count({ where: { urgency: { gte: 0.4, lt: 0.7 } } });
    const lowUrgencySignals = await db.signal.count({ where: { urgency: { lt: 0.4 } } });

    // Top signals by urgency
    const topSignals = await db.signal.findMany({
      where: { urgency: { gt: 0 } },
      orderBy: { urgency: 'desc' },
      take: 10,
      include: { lead: { select: { name: true, company: true, priorityTier: true } } },
    });

    // Channel distribution
    const channelBreakdown = await db.outreachMessage.groupBy({ by: ['channel'], _count: { channel: true } });

    // Memory stats
    const memoryStats = await db.agentMemory.groupBy({
      by: ['category'],
      _count: { category: true },
      _avg: { score: true },
    });

    // Average scores
    const scoreStats = await db.lead.aggregate({
      _avg: { leadScore: true, signalScore: true, replyProb: true, conversionProb: true, spamRisk: true },
      _max: { leadScore: true },
      where: { isBlacklisted: false },
    });

    // Queue stats
    let queueStats;
    try { queueStats = await JobQueue.getStats(); } catch { queueStats = { pending: 0, running: 0, completed: 0, failed: 0, dead: 0, byType: {} }; }

    // Pipeline metrics (last 24h)
    let pipelineMetrics;
    try { pipelineMetrics = await getPipelineMetrics(24); } catch { pipelineMetrics = []; }

    const campaigns = await db.campaign.findMany({
      include: { _count: { select: { messages: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: {
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
            recommendedPitchAngle: s.recommendedPitchAngle,
            lead: s.lead?.name, company: s.lead?.company, priorityTier: s.lead?.priorityTier,
          })),
        },
        followUps: { total: totalFollowUps, scheduled: scheduledFollowUps },
        dnc: { total: totalDnc },
        campaigns,
        recentActivities,
        recentPipelineRuns,
        // New data
        memory: {
          categories: memoryStats.map(m => ({ category: m.category, count: m._count.category, avgScore: m._avg.score?.toFixed(2) || '0' })),
          totalEntries: memoryStats.reduce((sum, m) => sum + m._count.category, 0),
        },
        queue: queueStats,
        pipelineMetrics,

        // ─── Deliverability & Results Metrics ───
        deliverability: await getDeliverabilityStats(),
        results: await getResultsMetrics(),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Server error' }, { status: 500 });
  }
}

async function getDeliverabilityStats() {
  try {
    const domains = await db.sendingDomain.findMany({ orderBy: { reputationScore: 'desc' } });

    const [
      eventsSent, eventsDelivered, eventsBounced, eventsOpened, eventsClicked, eventsComplained,
    ] = await Promise.all([
      db.emailEvent.count({ where: { eventType: 'sent' } }),
      db.emailEvent.count({ where: { eventType: 'delivered' } }),
      db.emailEvent.count({ where: { eventType: 'bounced' } }),
      db.emailEvent.count({ where: { eventType: 'opened' } }),
      db.emailEvent.count({ where: { eventType: 'clicked' } }),
      db.emailEvent.count({ where: { eventType: 'complained' } }),
    ]);

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
      })),
      metrics: {
        totalSent: eventsSent,
        totalDelivered: eventsDelivered,
        totalBounced: eventsBounced,
        totalOpened: eventsOpened,
        totalClicked: eventsClicked,
        totalComplained: eventsComplained,
        deliveryRate: (deliveryRate * 100).toFixed(1),
        bounceRate: (bounceRate * 100).toFixed(1),
        openRate: (openRate * 100).toFixed(1),
        clickRate: (clickRate * 100).toFixed(1),
        complaintRate: (complaintRate * 100).toFixed(2),
      },
    };
  } catch {
    return { domains: [], metrics: { totalSent: 0, totalDelivered: 0, totalBounced: 0, totalOpened: 0, totalClicked: 0, totalComplained: 0, deliveryRate: '0', bounceRate: '0', openRate: '0', clickRate: '0', complaintRate: '0' } };
  }
}

async function getResultsMetrics() {
  try {
    // The RESULTS LOOP: signals found → emails generated → emails sent → replies → meetings → revenue
    const [
      signalsFound,
      emailsGenerated,
      emailsSent,
      emailsDelivered,
      repliesReceived,
      interestedLeads,
      meetingsBooked,
    ] = await Promise.all([
      db.signal.count(),
      db.outreachMessage.count({ where: { status: { in: ['generated', 'approved', 'sent', 'delivered', 'replied'] } } }),
      db.emailEvent.count({ where: { eventType: 'sent' } }),
      db.emailEvent.count({ where: { eventType: 'delivered' } }),
      db.outreachMessage.count({ where: { status: 'replied' } }),
      db.lead.count({ where: { status: 'interested' } }),
      db.replyClassification.count({ where: { nextAction: 'escalate' } }),
    ]);

    const replyRate = emailsDelivered > 0 ? (repliesReceived / emailsDelivered) : 0;
    const positiveReplyRate = repliesReceived > 0 ? (interestedLeads / repliesReceived) : 0;
    const conversionRate = emailsSent > 0 ? (interestedLeads / emailsSent) : 0;

    return {
      signalsFound,
      emailsGenerated,
      emailsSent,
      emailsDelivered,
      repliesReceived,
      interestedLeads,
      meetingsBooked,
      replyRate: (replyRate * 100).toFixed(1),
      positiveReplyRate: (positiveReplyRate * 100).toFixed(1),
      conversionRate: (conversionRate * 100).toFixed(2),
    };
  } catch {
    return { signalsFound: 0, emailsGenerated: 0, emailsSent: 0, emailsDelivered: 0, repliesReceived: 0, interestedLeads: 0, meetingsBooked: 0, replyRate: '0', positiveReplyRate: '0', conversionRate: '0' };
  }
}
