// ─── Layer 1: Signal Ingestion & ICP Pre-Filter Gate ─────────────────────────
// Continuously evaluates raw buying signals against the client's ICP criteria.
// Discards non-matching signals immediately before consuming enrichment APIs
// or LLM tokens, saving client credits and compute resources.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from '@/lib/db';
import { logger } from '@/lib/agents/infrastructure/observability';

export interface RawSignalInput {
  id?: string;
  type: 'funding' | 'hiring' | 'hiring_spike' | 'tech_stack' | 'job_change' | 'news' | 'webhook';
  companyName: string;
  companyDomain?: string;
  industry?: string;
  companySize?: string;
  location?: string;
  content: string;
  sourceUrl?: string;
  sourceTitle?: string;
  metadata?: Record<string, any>;
}

export interface ValidatedSignalPayload {
  signalId: string;
  organizationId: string;
  companyName: string;
  companyDomain?: string;
  industry: string;
  signalType: string;
  headline: string;
  content: string;
  sourceUrl?: string;
  sourceTitle?: string;
  icpMatchScore: number;
  matchedCriteria: string[];
  suggestedAngle: string;
  qualifiedAt: string;
}

export interface IcpFilterCriteria {
  targetIndustries: string[];
  minEmployees?: number;
  maxEmployees?: number;
  targetLocations?: string[];
  requiredKeywords?: string[];
  excludedKeywords?: string[];
}

export class SignalIngestionGate {
  /**
   * Evaluates a raw signal against the client's ICP criteria.
   * If non-matching, discards early with 0 enrichment or LLM consumption.
   */
  static evaluateSignal(
    signal: RawSignalInput,
    icp: IcpFilterCriteria
  ): { qualified: boolean; score: number; reasons: string[]; matchedCriteria: string[] } {
    let score = 50; // Baseline score
    const matchedCriteria: string[] = [];
    const reasons: string[] = [];

    // 1. Check Industry Match
    if (signal.industry && icp.targetIndustries.length > 0) {
      const industryLower = signal.industry.toLowerCase();
      const matchedInd = icp.targetIndustries.some(ind => 
        industryLower.includes(ind.toLowerCase()) || ind.toLowerCase().includes(industryLower)
      );
      if (matchedInd) {
        score += 25;
        matchedCriteria.push(`Industry match: ${signal.industry}`);
      } else {
        reasons.push(`Industry "${signal.industry}" is outside target ICP industries`);
      }
    } else if (icp.targetIndustries.length > 0) {
      // Industry not specified in signal, check keywords in content
      const contentLower = signal.content.toLowerCase();
      const matchedInd = icp.targetIndustries.some(ind => contentLower.includes(ind.toLowerCase()));
      if (matchedInd) {
        score += 20;
        matchedCriteria.push('Industry keyword detected in signal content');
      }
    }

    // 2. Check Excluded Keywords
    if (icp.excludedKeywords && icp.excludedKeywords.length > 0) {
      const contentLower = (signal.content + ' ' + signal.companyName).toLowerCase();
      const hasExcluded = icp.excludedKeywords.find(kw => contentLower.includes(kw.toLowerCase()));
      if (hasExcluded) {
        return {
          qualified: false,
          score: 0,
          reasons: [`Contains excluded keyword: "${hasExcluded}". Discarded to save tokens.`],
          matchedCriteria: [],
        };
      }
    }

    // 3. High-Intent Signal Type Weighting
    if (signal.type === 'funding') {
      score += 20;
      matchedCriteria.push('High-intent capital deployment (Funding Event)');
    } else if (signal.type === 'hiring_spike' || signal.type === 'hiring') {
      score += 15;
      matchedCriteria.push('Active team expansion (Hiring Surge)');
    } else if (signal.type === 'tech_stack') {
      score += 15;
      matchedCriteria.push('Infrastructure upgrade / tech migration');
    } else if (signal.type === 'job_change') {
      score += 15;
      matchedCriteria.push('New executive decision-maker appointment');
    }

    // 4. Threshold Qualification Gate
    const isQualified = score >= 65;
    if (!isQualified) {
      reasons.push(`Signal match score (${score}/100) below qualification threshold (65)`);
    }

    return {
      qualified: isQualified,
      score: Math.min(score, 100),
      reasons,
      matchedCriteria,
    };
  }

  /**
   * Ingests a raw signal, executes the ICP gate, and either discards or records the validated payload.
   */
  static async ingestSignal(
    signal: RawSignalInput,
    organizationId: string,
    icp?: IcpFilterCriteria
  ): Promise<{
    status: 'qualified' | 'discarded';
    payload?: ValidatedSignalPayload;
    discardReason?: string;
  }> {
    const activeIcp: IcpFilterCriteria = icp || {
      targetIndustries: ['Fintech', 'SaaS', 'Security', 'Cloud', 'DevOps'],
      excludedKeywords: ['crypto scam', 'gambling', 'adult'],
    };

    const evaluation = this.evaluateSignal(signal, activeIcp);

    if (!evaluation.qualified) {
      logger.info(`[SignalIngestionGate] Signal discarded for ${signal.companyName}: ${evaluation.reasons.join(', ')}`, {
        agent: 'SignalIngestionGate',
        metadata: { company: signal.companyName, score: evaluation.score },
      });

      return {
        status: 'discarded',
        discardReason: evaluation.reasons.join(', '),
      };
    }

    // Generate suggested outreach angle from signal context
    let suggestedAngle = `Reference ${signal.companyName}'s recent milestone in opening hook.`;
    if (signal.type === 'funding') {
      suggestedAngle = `Congratulate on recent capital round and offer scalability/compliance infrastructure.`;
    } else if (signal.type === 'hiring' || signal.type === 'hiring_spike') {
      suggestedAngle = `Acknowledge team expansion and pitch developer productivity / automated deliverability.`;
    } else if (signal.type === 'tech_stack') {
      suggestedAngle = `Highlight seamless compatibility with their newly adopted infrastructure stack.`;
    }

    const payload: ValidatedSignalPayload = {
      signalId: signal.id || `sig_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      organizationId,
      companyName: signal.companyName,
      companyDomain: signal.companyDomain,
      industry: signal.industry || 'Technology SaaS',
      signalType: signal.type,
      headline: `${signal.companyName}: ${signal.type.replace('_', ' ').toUpperCase()}`,
      content: signal.content,
      sourceUrl: signal.sourceUrl,
      sourceTitle: signal.sourceTitle,
      icpMatchScore: evaluation.score,
      matchedCriteria: evaluation.matchedCriteria,
      suggestedAngle,
      qualifiedAt: new Date().toISOString(),
    };

    // Store validated signal event in audit log
    await (db as any).auditLog.create({
      data: {
        organization: { connect: { id: organizationId } },
        action: 'signal_ingested',
        entityType: 'signal',
        entityId: payload.signalId,
        metadata: {
          signalId: payload.signalId,
          type: signal.type,
          companyName: signal.companyName,
          score: evaluation.score,
          sourceUrl: signal.sourceUrl,
          suggestedAngle,
        },
      },
    }).catch(() => {});

    logger.info(`[SignalIngestionGate] Signal QUALIFIED for ${signal.companyName} (Score: ${evaluation.score}/100)`, {
      agent: 'SignalIngestionGate',
      metadata: { payload },
    });

    return {
      status: 'qualified',
      payload,
    };
  }
}
