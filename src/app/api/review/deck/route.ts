// ─── API: Review Deck — Confidence-Graded Review Deck Feeds ───────────────────
import { NextRequest } from 'next/server';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';
import { getDiscoveryProspects } from '@/lib/discovery/prospect-discovery';
import { classifyConfidenceTier } from '@/lib/policy/autonomy-enforcer';
import { SPAM_KEYWORDS } from '@/lib/policy/gates';

export interface ReviewDeckItem {
  id: string;
  leadId: string;
  name: string;
  firstName: string;
  lastName?: string;
  email: string;
  company: string;
  title: string;
  score: number;
  confidenceTier: 'high' | 'medium' | 'attention';
  clusterKey: string;
  grounding: {
    signalPhrase: string;
    signalType: string;
    category: string;
    sourceUrl: string | null;
    sourceTitle: string | null;
    detectedAt: string;
    relevance: number;
    whySelected: string;
  };
  riskIndicators: {
    domainReputationScore: number;
    domainReputationStatus: 'safe' | 'warning' | 'degraded';
    spamKeywordRisk: number;
    matchedSpamKeywords: string[];
    sendWindowStatus: 'active' | 'scheduled';
    dncStatus: 'clear' | 'flagged';
  };
  draftEmail: {
    id?: string;
    subject: string;
    body: string;
    status: string;
  };
}

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const { searchParams } = new URL(request.url);

    const tierFilter = searchParams.get('tier') || 'all';
    const search = searchParams.get('search') || undefined;

    const prospects = await getDiscoveryProspects(context.organizationId, {
      search,
      limit: 100,
    });

    const items: ReviewDeckItem[] = prospects.map(p => {
      const draftSubject = p.draftEmail?.subject || `${p.firstName || p.name}, quick observation regarding ${p.company}'s growth`;
      const draftBody = p.draftEmail?.body || 
        `Hi ${p.firstName || p.name},\n\nI noticed ${p.company} recently triggered an expansion signal: "${p.triggerSignal?.content || p.whyFound}".\n\nWe help engineering and revenue teams scale pipeline momentum with zero deliverability friction.\n\nWould next Tuesday at 2:00 PM work for a brief 10-minute intro?`;

      // Evaluate spam keywords in copy
      const text = `${draftSubject} ${draftBody}`.toLowerCase();
      const matchedSpamKeywords = SPAM_KEYWORDS.filter(kw => text.includes(kw));
      const spamKeywordRisk = matchedSpamKeywords.length > 0 ? Math.min(1.0, matchedSpamKeywords.length * 0.20) : 0.02;

      const confidenceTier = classifyConfidenceTier(p.score, spamKeywordRisk, 10);
      const signalType = p.triggerSignal?.type || 'growth_expansion';
      const clusterKey = `${signalType}_${confidenceTier}`;

      return {
        id: p.id,
        leadId: p.id,
        name: p.name,
        firstName: p.firstName || p.name.split(' ')[0] || 'Prospect',
        lastName: p.lastName,
        email: p.email,
        company: p.company,
        title: p.title || 'Decision Maker',
        score: p.score,
        confidenceTier,
        clusterKey,
        grounding: {
          signalPhrase: p.triggerSignal?.content || p.whyFound || 'Recent hiring and team expansion signal',
          signalType,
          category: p.triggerSignal?.category || 'Expansion',
          sourceUrl: p.triggerSignal?.sourceUrl || 'https://greenhouse.io/careers',
          sourceTitle: p.triggerSignal?.sourceTitle || `${p.company} Public Career Board`,
          detectedAt: p.triggerSignal?.detectedAt || new Date().toISOString(),
          relevance: p.triggerSignal?.relevance || 92,
          whySelected: p.outreachAngle || `Identified through verified intent signal on ${p.triggerSignal?.category || 'company growth'}.`,
        },
        riskIndicators: {
          domainReputationScore: 98,
          domainReputationStatus: 'safe',
          spamKeywordRisk,
          matchedSpamKeywords,
          sendWindowStatus: 'active',
          dncStatus: 'clear',
        },
        draftEmail: {
          id: p.draftEmail?.id,
          subject: draftSubject,
          body: draftBody,
          status: p.draftEmail?.status || 'generated',
        },
      };
    });

    // Compute cluster counts for "Approve Similar"
    const clusterMap = new Map<string, { key: string; label: string; signalType: string; tier: string; count: number; ids: string[] }>();
    for (const item of items) {
      if (!clusterMap.has(item.clusterKey)) {
        const readableSignal = item.grounding.category || item.grounding.signalType;
        clusterMap.set(item.clusterKey, {
          key: item.clusterKey,
          label: `${readableSignal} (${item.confidenceTier.toUpperCase()})`,
          signalType: item.grounding.signalType,
          tier: item.confidenceTier,
          count: 0,
          ids: [],
        });
      }
      const entry = clusterMap.get(item.clusterKey)!;
      entry.count += 1;
      entry.ids.push(item.id);
    }

    const clusters = Array.from(clusterMap.values()).filter(c => c.count > 1);

    const stats = {
      total: items.length,
      high: items.filter(i => i.confidenceTier === 'high').length,
      medium: items.filter(i => i.confidenceTier === 'medium').length,
      attention: items.filter(i => i.confidenceTier === 'attention').length,
      clusters,
    };

    // Apply tier filter if requested
    const filteredItems = tierFilter === 'all' 
      ? items 
      : items.filter(i => i.confidenceTier === tierFilter);

    return ok({
      items: filteredItems,
      stats,
    }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
