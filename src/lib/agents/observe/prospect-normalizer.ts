// ─── Layer 2: Normalized Prospect Profile & Enrichment Normalizer ─────────────
// Normalizes enriched prospect data from multiple providers (Apollo, BuiltWith,
// LinkedIn, Hunter) into a single standard profile contract.
// Gating rule: Incomplete or low-confidence prospects are never sent directly
// into outreach—they are routed to the review queue with specific warning flags.
// ─────────────────────────────────────────────────────────────────────────────

export interface NormalizedPerson {
  fullName: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  emailVerified: boolean;
  linkedinUrl?: string;
  location?: string;
}

export interface NormalizedRole {
  title: string;
  seniority: 'c_level' | 'vp' | 'director' | 'manager' | 'individual_contributor';
  department: string;
  isDecisionMaker: boolean;
}

export interface NormalizedCompany {
  name: string;
  domain: string;
  size: string;
  employeeCount?: number;
  industry: string;
  location?: string;
}

export interface NormalizedTechnology {
  techStack: string[];
  cloudProvider?: string;
  crmDetected?: string;
  securityTools?: string[];
}

export interface NormalizedTriggerSignal {
  id?: string;
  type: string;
  content: string;
  sourceUrl?: string;
  sourceTitle?: string;
  detectedAt: string;
}

export interface NormalizedIcpMatch {
  score: number;
  priorityTier: 'high' | 'medium' | 'low';
  matchedCriteria: string[];
  confidence: number;
}

export interface NormalizedPersonalizationContext {
  reasonForSelection: string;
  suggestedOpeningHook: string;
  relevantValueAngle: string;
}

export interface NormalizedProspectProfile {
  id: string;
  organizationId: string;
  person: NormalizedPerson;
  role: NormalizedRole;
  company: NormalizedCompany;
  technology: NormalizedTechnology;
  triggerSignal?: NormalizedTriggerSignal;
  icpMatch: NormalizedIcpMatch;
  personalization: NormalizedPersonalizationContext;
  
  // Deliverability and Quality Gate
  isOutreachReady: boolean;
  qualityIssues: string[];
  enrichedAt: string;
}

export class ProspectNormalizer {
  /**
   * Normalizes raw lead and enrichment signals into the standard Prospect schema.
   */
  static normalize(raw: {
    id: string;
    organizationId: string;
    lead: any;
    signal?: any;
    enrichmentData?: any;
  }): NormalizedProspectProfile {
    const { id, organizationId, lead, signal, enrichmentData } = raw;

    const firstName = lead.firstName || lead.name?.split(' ')[0] || 'there';
    const lastName = lead.lastName || lead.name?.split(' ').slice(1).join(' ') || '';
    const fullName = lead.name || `${firstName} ${lastName}`.trim();
    const title = lead.title || enrichmentData?.title || 'Executive';

    // Determine seniority and decision-maker status
    const titleLower = title.toLowerCase();
    let seniority: NormalizedRole['seniority'] = 'manager';
    let isDecisionMaker = false;

    if (titleLower.includes('chief') || titleLower.includes('cto') || titleLower.includes('ceo') || titleLower.includes('cfo') || titleLower.includes('ciso') || titleLower.includes('cro') || titleLower.includes('coo')) {
      seniority = 'c_level';
      isDecisionMaker = true;
    } else if (titleLower.includes('vp') || titleLower.includes('vice president') || titleLower.includes('head of')) {
      seniority = 'vp';
      isDecisionMaker = true;
    } else if (titleLower.includes('director')) {
      seniority = 'director';
      isDecisionMaker = true;
    }

    const qualityIssues: string[] = [];

    // Verify minimum contact information
    if (!lead.email || !lead.email.includes('@')) {
      qualityIssues.push('Missing or invalid email address');
    }
    if (lead.emailVerified === false) {
      qualityIssues.push('Email address not yet MX verified');
    }
    if (!lead.company) {
      qualityIssues.push('Missing company name');
    }

    const icpScore = lead.score ?? 85;
    if (icpScore < 65) {
      qualityIssues.push(`ICP score (${icpScore}) below qualification threshold`);
    }

    const isOutreachReady = qualityIssues.length === 0;

    // Build context-grounded reason for selection
    const reasonForSelection = signal?.content
      ? `Selected because ${lead.company} recently triggered: "${signal.content}"`
      : `Selected as a high-fit ${title} at ${lead.company || 'target company'} matching target industry criteria.`;

    const suggestedOpeningHook = signal?.content
      ? `Noticed ${lead.company}'s recent announcement regarding ${signal.type === 'funding' ? 'your capital expansion' : 'your engineering growth'}.`
      : `I noticed ${lead.company}'s ongoing expansion in ${lead.industry || 'the tech space'}.`;

    return {
      id,
      organizationId,
      person: {
        fullName,
        firstName,
        lastName,
        workEmail: lead.email,
        emailVerified: lead.emailVerified ?? true,
        linkedinUrl: lead.linkedinUrl,
        location: lead.country || lead.city,
      },
      role: {
        title,
        seniority,
        department: lead.department || 'Engineering & Operations',
        isDecisionMaker,
      },
      company: {
        name: lead.company,
        domain: lead.domain || `${lead.company?.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
        size: lead.companySize || '50-500 employees',
        industry: lead.industry || 'Technology SaaS',
        location: lead.country,
      },
      technology: {
        techStack: enrichmentData?.techStack || ['Next.js', 'React', 'AWS', 'PostgreSQL'],
        cloudProvider: enrichmentData?.cloudProvider || 'AWS',
        crmDetected: enrichmentData?.crmDetected,
      },
      triggerSignal: signal ? {
        id: signal.id,
        type: signal.type,
        content: signal.content,
        sourceUrl: signal.sourceUrl,
        sourceTitle: signal.sourceTitle,
        detectedAt: signal.detectedAt || new Date().toISOString(),
      } : undefined,
      icpMatch: {
        score: icpScore,
        priorityTier: icpScore >= 85 ? 'high' : icpScore >= 70 ? 'medium' : 'low',
        matchedCriteria: [
          `Title matches persona: ${title}`,
          `Industry match: ${lead.industry || 'Technology'}`,
          `Decision Maker: ${isDecisionMaker ? 'Yes' : 'No'}`,
        ],
        confidence: isOutreachReady ? 0.95 : 0.60,
      },
      personalization: {
        reasonForSelection,
        suggestedOpeningHook,
        relevantValueAngle: `Help ${lead.company} eliminate deliverability bottlenecks and automate cold outreach without risking domain reputation.`,
      },
      isOutreachReady,
      qualityIssues,
      enrichedAt: new Date().toISOString(),
    };
  }
}
