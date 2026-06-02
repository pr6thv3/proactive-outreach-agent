// ─── API: Email Events — Delivery Analytics ────────────
// Filter, aggregate, and trend email delivery events

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace();
    const { searchParams } = new URL(request.url);
    const eventType = searchParams.get('type');
    const domainId = searchParams.get('domainId');
    const campaignId = searchParams.get('campaignId');
    const leadId = searchParams.get('leadId');
    const days = parseInt(searchParams.get('days') || '30');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);

    const since = new Date(Date.now() - days * 86400000);

    // Build where clause
    const where: Record<string, unknown> = {
      organizationId: context.organizationId,
      createdAt: { gte: since },
    };
    if (eventType) where.eventType = eventType;
    if (domainId) where.domainId = domainId;
    if (campaignId) where.campaignId = campaignId;
    if (leadId) where.leadId = leadId;

    // Get events
    const events = await db.emailEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Aggregate counts by event type
    const allEvents = await db.emailEvent.findMany({
      where: { organizationId: context.organizationId, createdAt: { gte: since } },
      select: { eventType: true, createdAt: true },
    });

    const counts: Record<string, number> = {};
    for (const e of allEvents) {
      counts[e.eventType] = (counts[e.eventType] || 0) + 1;
    }

    const totalSent = counts['sent'] || 0;
    const totalDelivered = counts['delivered'] || 0;
    const totalBounced = counts['bounced'] || 0;
    const totalOpened = counts['opened'] || 0;
    const totalClicked = counts['clicked'] || 0;
    const totalComplained = counts['complained'] || 0;

    const deliveryRate = totalSent > 0 ? totalDelivered / totalSent : 0;
    const bounceRate = totalSent > 0 ? totalBounced / totalSent : 0;
    const openRate = totalDelivered > 0 ? totalOpened / totalDelivered : 0;
    const clickRate = totalDelivered > 0 ? totalClicked / totalDelivered : 0;
    const complaintRate = totalSent > 0 ? totalComplained / totalSent : 0;

    // Daily trend for charting
    const dailyTrend: Record<string, Record<string, number>> = {};
    for (const e of allEvents) {
      const day = e.createdAt.toISOString().split('T')[0];
      if (!dailyTrend[day]) dailyTrend[day] = {};
      dailyTrend[day][e.eventType] = (dailyTrend[day][e.eventType] || 0) + 1;
    }

    const trend = Object.entries(dailyTrend)
      .map(([date, typeCounts]) => ({ date, ...typeCounts }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return ok({
        events,
        aggregation: {
          counts,
          rates: {
            deliveryRate: (deliveryRate * 100).toFixed(1) + '%',
            bounceRate: (bounceRate * 100).toFixed(1) + '%',
            openRate: (openRate * 100).toFixed(1) + '%',
            clickRate: (clickRate * 100).toFixed(1) + '%',
            complaintRate: (complaintRate * 100).toFixed(2) + '%',
          },
          deliveryRate,
          bounceRate,
          openRate,
          clickRate,
          complaintRate,
        },
        dailyTrend: trend,
      }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
