// ─── API: Messages ────────────────────────────────────
// Messages with approval queue, editing, and status filtering

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const leadId = searchParams.get('leadId');
    const campaignId = searchParams.get('campaignId');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (leadId) where.leadId = leadId;
    if (campaignId) where.campaignId = campaignId;

    const messages = await db.outreachMessage.findMany({
      where,
      include: {
        lead: { select: { id: true, name: true, email: true, company: true, status: true } },
        followUps: { orderBy: { scheduledAt: 'asc' } },
        replies: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ success: true, data: messages });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, subject, body: msgBody } = body;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const msg = await db.outreachMessage.findUnique({ where: { id } });
    if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    if (msg.status !== 'generated' && msg.status !== 'draft') return NextResponse.json({ error: `Cannot edit message in "${msg.status}" status` }, { status: 400 });

    const updated = await db.outreachMessage.update({
      where: { id },
      data: { ...(subject !== undefined && { subject }), ...(msgBody !== undefined && { body: msgBody }) },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Server error' }, { status: 500 });
  }
}
