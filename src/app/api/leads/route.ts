// ─── API: Leads ───────────────────────────────────────
// Production leads API with search, filter, activity, signals

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: Record<string, unknown> = {};
    if (status && status !== 'all') where.status = status;
    if (search) {
      where.OR = [{ name: { contains: search } }, { email: { contains: search } }, { company: { contains: search } }];
    }

    const [leads, total] = await Promise.all([
      db.lead.findMany({
        where,
        include: {
          signals: { orderBy: { relevance: 'desc' }, take: 5 },
          messages: { take: 3, orderBy: { createdAt: 'desc' } },
          activities: { take: 5, orderBy: { createdAt: 'desc' } },
          _count: { select: { signals: true, messages: true, activities: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.lead.count({ where }),
    ]);

    return NextResponse.json({ success: true, data: { leads, total, page, limit } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leadId = searchParams.get('id');
    if (!leadId) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await db.lead.delete({ where: { id: leadId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Server error' }, { status: 500 });
  }
}
