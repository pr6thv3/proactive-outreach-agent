import { SignalData, ThinkOutput } from '@/lib/agents/types';

export type CitationQuality = 'strong' | 'medium' | 'weak';

export interface EvidenceSignal {
  signalId: string;
  type: string;
  summary: string;
  sourceUrl?: string;
  sourceTitle?: string;
  citationQuality: CitationQuality;
  confidence: number;
  urgency?: number;
  relevance?: number;
  createdAt?: string;
}

export interface EvidenceSnapshot {
  signals: EvidenceSignal[];
  reasoning: string;
  pitchAngle: string;
  riskNotes: string[];
  generatedAt: string;
}

export function getCitationQuality(signal: Pick<SignalData, 'source' | 'sourceUrl' | 'sourceTitle' | 'confidence'>): CitationQuality {
  const source = signal.source.toLowerCase();
  const url = (signal.sourceUrl || '').toLowerCase();
  const title = (signal.sourceTitle || '').toLowerCase();
  const officialPath = /\/(careers|jobs|about|blog|news|press|company)(\/|$)/i.test(url);

  if (signal.sourceUrl && (source.includes('company') || source.includes('about') || source.includes('careers') || source.includes('blog') || source.includes('news') || officialPath)) {
    return 'strong';
  }
  if (signal.sourceUrl && signal.confidence >= 0.65 && !title.includes('search unavailable')) {
    return 'medium';
  }
  return 'weak';
}

export function buildEvidenceSnapshot(signals: SignalData[], strategy: ThinkOutput): EvidenceSnapshot {
  const cited = signals
    .map(signal => ({
      signal,
      citationQuality: getCitationQuality(signal),
      score: (signal.urgency || signal.relevance || 0) * signal.confidence,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const evidenceSignals: EvidenceSignal[] = cited.map(({ signal, citationQuality }) => ({
    signalId: signal.id,
    type: signal.type,
    summary: signal.content,
    sourceUrl: signal.sourceUrl,
    sourceTitle: signal.sourceTitle,
    citationQuality,
    confidence: signal.confidence,
    urgency: signal.urgency,
    relevance: signal.relevance,
    createdAt: signal.detectedAt ? new Date(signal.detectedAt).toISOString() : undefined,
  }));

  const riskNotes: string[] = [];
  if (!evidenceSignals.some(signal => signal.citationQuality === 'strong')) {
    riskNotes.push('No strong direct-company citation was available; keep factual claims conservative.');
  }
  if (evidenceSignals.some(signal => signal.citationQuality === 'weak')) {
    riskNotes.push('Weak citations can inform prioritization, but should not drive factual claims without human review.');
  }

  return {
    signals: evidenceSignals,
    reasoning: strategy.reasoning,
    pitchAngle: strategy.pitchAngleUsed || strategy.angle,
    riskNotes,
    generatedAt: new Date().toISOString(),
  };
}

export function hasCitedSignalForClaim(signals: SignalData[], claim: string): boolean {
  const terms = claim.toLowerCase().split(/\s+/).filter(Boolean);
  return signals.some(signal => {
    const quality = getCitationQuality(signal);
    if (quality === 'weak') return false;
    const haystack = `${signal.type} ${signal.content}`.toLowerCase();
    return terms.some(term => haystack.includes(term));
  });
}
