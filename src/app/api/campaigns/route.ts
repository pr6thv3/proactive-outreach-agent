// ─── API: Campaigns ───────────────────────────────────
// Campaign CRUD with full configuration

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const campaigns = await db.campaign.findMany({
      include: { _count: { select: { messages: true } }, messages: { take: 3, orderBy: { createdAt: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ success: true, data: campaigns });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, goal, targetAudience, offer, senderName, senderEmail, tone, cta, maxDailySends, followUpSchedule, productDescription } = body;
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

    const campaign = await db.campaign.create({
      data: {
        name, goal, targetAudience, offer, senderName: senderName || 'Alex', senderEmail: senderEmail || 'alex@company.com',
        tone: tone || 'professional', cta, maxDailySends: maxDailySends || 50,
        followUpSchedule: JSON.stringify(followUpSchedule || [3, 7, 14]),
        productDescription, status: 'draft',
        dailySendsCount: 0, dailySendsDate: new Date().toISOString().split('T')[0],
      },
    });
    return NextResponse.json({ success: true, data: campaign });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    if (updates.followUpSchedule) updates.followUpSchedule = JSON.stringify(updates.followUpSchedule);
    const campaign = await db.campaign.update({ where: { id }, data: updates });
    return NextResponse.json({ success: true, data: campaign });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Server error' }, { status: 500 });
  }
}
