// ─── Dynamic A/B Testing & Subject Line Optimizer ─────────────────────────────
// Generates multi-variant email hooks, tracks variant conversions, and dynamically
// promotes the winning subject line and value proposition angle.
// ─────────────────────────────────────────────────────────────────────────────

export interface AbVariant {
  id: 'variant_a' | 'variant_b';
  name: string;
  subject: string;
  bodyHook: string;
  focus: string;
  sendsCount: number;
  opensCount: number;
  repliesCount: number;
  meetingsCount: number;
}

export interface AbTestConfig {
  campaignId: string;
  variants: AbVariant[];
  winningVariantId?: 'variant_a' | 'variant_b';
  confidenceScore?: number;
}

export class AbTestingOptimizer {
  /**
   * Generate A/B test variants from campaign parameters
   */
  static generateVariants(params: {
    companyName: string;
    industry: string;
    signalContext?: string;
    valueProp?: string;
  }): { variantA: AbVariant; variantB: AbVariant } {
    const { companyName, industry, signalContext, valueProp } = params;

    const variantA: AbVariant = {
      id: 'variant_a',
      name: 'Direct Pain-Point & Signal Reference',
      subject: `Quick question regarding ${companyName}'s growth`,
      bodyHook: `Hi {{firstName}},\n\nNoticed ${companyName} is actively scaling following your recent milestones${signalContext ? ` (${signalContext})` : ''}.\n\nUsually when expanding ${industry} teams, the primary bottleneck is pipeline velocity and deliverability friction.`,
      focus: 'Pain-point resolution with immediate relevance',
      sendsCount: 0,
      opensCount: 0,
      repliesCount: 0,
      meetingsCount: 0,
    };

    const variantB: AbVariant = {
      id: 'variant_b',
      name: 'Social Proof & Quantifiable ROI Metric',
      subject: `How peer ${industry} leaders increased qualified meetings by 3.4x`,
      bodyHook: `Hi {{firstName}},\n\nWanted to share a quick benchmark: high-growth ${industry} teams recently achieved a 3.4x lift in qualified meetings within 30 days${valueProp ? ` by ${valueProp.toLowerCase()}` : ''}.`,
      focus: 'Social proof with quantifiable outcome metrics',
      sendsCount: 0,
      opensCount: 0,
      repliesCount: 0,
      meetingsCount: 0,
    };

    return { variantA, variantB };
  }

  /**
   * Determine the winning variant based on reply and meeting conversion rates
   */
  static evaluateWinner(config: AbTestConfig): {
    winner: 'variant_a' | 'variant_b' | 'inconclusive';
    variantAConversionRate: number;
    variantBConversionRate: number;
    statisticalSignificance: boolean;
  } {
    const varA = config.variants.find(v => v.id === 'variant_a') || config.variants[0];
    const varB = config.variants.find(v => v.id === 'variant_b') || config.variants[1];

    const rateA = varA && varA.sendsCount > 0 ? (varA.repliesCount + varA.meetingsCount * 2) / varA.sendsCount : 0;
    const rateB = varB && varB.sendsCount > 0 ? (varB.repliesCount + varB.meetingsCount * 2) / varB.sendsCount : 0;

    const totalSends = (varA?.sendsCount || 0) + (varB?.sendsCount || 0);
    const statisticalSignificance = totalSends >= 50 && Math.abs(rateA - rateB) > 0.05;

    let winner: 'variant_a' | 'variant_b' | 'inconclusive' = 'inconclusive';
    if (statisticalSignificance) {
      winner = rateA > rateB ? 'variant_a' : 'variant_b';
    }

    return {
      winner,
      variantAConversionRate: Number((rateA * 100).toFixed(1)),
      variantBConversionRate: Number((rateB * 100).toFixed(1)),
      statisticalSignificance,
    };
  }
}
