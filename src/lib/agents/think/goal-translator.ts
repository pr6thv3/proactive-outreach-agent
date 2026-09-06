// ─── Conversational Campaign Goal Translator ──────────────────────────────────
// Translates natural language campaign goals (e.g. "Find US fintechs with 50-500 employees
// hiring cybersecurity leaders and reach out to CTOs") into structured ICP criteria,
// target persona definitions, and tailored 4-step sequence parameters.
// ─────────────────────────────────────────────────────────────────────────────

export interface IcpCriteriaData {
  industries: string[];
  companySizeMin: number;
  companySizeMax: number;
  revenueMin?: number | null;
  revenueMax?: number | null;
  techStack: string[];
  excludeTechStack: string[];
  requiredSignals: string[];
  minSignalScore: number;
  valueProp: string;
  painPoints: string[];
  geography?: string[];
}

export interface PersonaData {
  title: string;
  seniority: string;
  department: string;
  decisionMaker: boolean;
  painAngle: string;
}

export interface SequenceStepData {
  step: number;
  delayDays: number;
  type: string;
  channel?: 'email' | 'linkedin_visit' | 'linkedin_connect' | 'linkedin_message';
  template: string;
  subject: string;
  bodyHook: string;
  callToAction: string;
  focus: string;
  linkedinNote?: string;
}

export interface GoalTranslationInput {
  goalPrompt: string;
  valueProposition?: string;
  productDescription?: string;
  organizationId?: string;
}

export interface GoalTranslationResult {
  icpCriteria: IcpCriteriaData;
  personas: PersonaData[];
  sequenceSteps: SequenceStepData[];
  confidence: number;
  summary: string;
  parsedGoal: {
    targetRole: string;
    targetIndustry: string;
    targetSize: string;
    keySignal: string;
    geography: string;
  };
}

// ─── DICTIONARIES & PATTERNS ──────────────────────────────────────────────────

interface IndustryPattern {
  name: string;
  keywords: string[];
  defaultPainPoints: string[];
}

const INDUSTRY_PATTERNS: IndustryPattern[] = [
  {
    name: 'Fintech',
    keywords: ['fintech', 'fintechs', 'financial technology', 'banking', 'payments', 'crypto', 'defi', 'wealthtech', 'insurtech', 'lending', 'neobank', 'neobanks'],
    defaultPainPoints: [
      'Strict regulatory compliance and AML/KYC audit overhead',
      'High transaction fraud and risk management bottlenecks',
      'Scaling secure payment infrastructure without latency spikes',
    ],
  },
  {
    name: 'Cybersecurity',
    keywords: ['cybersecurity', 'infosec', 'cloud security', 'soc', 'compliance', 'pen testing', 'zero trust', 'appsec', 'security'],
    defaultPainPoints: [
      'Expanding cloud attack surface across hybrid infrastructure',
      'Alert fatigue and security analyst burnout in the SOC',
      'Maintaining continuous SOC2 / ISO27001 compliance during rapid hiring',
    ],
  },
  {
    name: 'B2B SaaS',
    keywords: ['b2b saas', 'saas', 'software as a service', 'enterprise software', 'cloud platform', 'cloud platforms', 'b2b software', 'b2b'],
    defaultPainPoints: [
      'Low outbound pipeline velocity and low cold email reply rates',
      'Increasing customer acquisition costs and extended sales cycles',
      'Net revenue retention and customer churn reduction',
    ],
  },
  {
    name: 'Healthcare & HealthTech',
    keywords: ['healthtech', 'healthcare', 'medical', 'biotech', 'pharma', 'telehealth', 'clinical', 'digital health', 'medtech'],
    defaultPainPoints: [
      'HIPAA compliance and patient data security silos',
      'Complex EHR/EMR integration and interoperability friction',
      'Clinical workflow efficiency and provider burnout',
    ],
  },
  {
    name: 'E-commerce & Retail',
    keywords: ['ecommerce', 'e-commerce', 'd2c', 'direct to consumer', 'retail', 'online store', 'online stores', 'shopify brand', 'shopify brands', 'marketplace', 'marketplaces'],
    defaultPainPoints: [
      'High cart abandonment and customer acquisition volatility',
      'Supply chain inventory visibility and omni-channel fulfillment',
      'Personalization at scale to drive repeat lifetime value (LTV)',
    ],
  },
  {
    name: 'AI & Machine Learning',
    keywords: ['ai', 'artificial intelligence', 'machine learning', 'ml', 'genai', 'generative ai', 'llm', 'deep learning'],
    defaultPainPoints: [
      'High GPU compute and inference infrastructure costs',
      'Data pipeline hallucinations and retrieval latency',
      'Model evaluation and continuous deployment guardrails',
    ],
  },
  {
    name: 'Cloud & DevOps',
    keywords: ['devops', 'sre', 'kubernetes', 'cloud engineering', 'platform engineering', 'infrastructure', 'ci/cd'],
    defaultPainPoints: [
      'Developer velocity slowed down by brittle deployment pipelines',
      'Unpredictable cloud infrastructure and egress costs',
      'Microservice observability and distributed tracing gaps',
    ],
  },
  {
    name: 'HRTech & Talent',
    keywords: ['hrtech', 'recruiting', 'talent acquisition', 'people ops', 'human resources', 'staffing'],
    defaultPainPoints: [
      'Long time-to-hire for specialized engineering roles',
      'Candidate screening fatigue and low interview-to-offer rates',
      'Employee onboarding friction in distributed/remote teams',
    ],
  },
  {
    name: 'EdTech',
    keywords: ['edtech', 'education technology', 'e-learning', 'higher education', 'k-12', 'lms'],
    defaultPainPoints: [
      'Student engagement and course completion drop-offs',
      'Institutional procurement cycles and accessibility compliance',
    ],
  },
  {
    name: 'PropTech & Real Estate',
    keywords: ['proptech', 'real estate', 'property management', 'commercial real estate'],
    defaultPainPoints: [
      'Manual lease management and tenant communication overhead',
      'Fragmented portfolio data and slow valuation reporting',
    ],
  },
  {
    name: 'LegalTech & Compliance',
    keywords: ['legaltech', 'legal tech', 'law firm', 'law firms', 'legal compliance', 'contract lifecycle', 'contract management'],
    defaultPainPoints: [
      'Manual contract review bottlenecks and compliance risk',
      'Tedious discovery and document search overhead',
      'Billing efficiency and client data confidentiality silos',
    ],
  },
  {
    name: 'Logistics & Supply Chain',
    keywords: ['logistics', 'supply chain', 'freight', 'fleet', 'warehousing', '3pl', 'shipping', 'transportation'],
    defaultPainPoints: [
      'End-to-end freight visibility and real-time tracking friction',
      'Warehouse inventory discrepancies and fulfillment latency',
      'Fuel cost optimization and driver retention challenges',
    ],
  },
  {
    name: 'Manufacturing & Industrial',
    keywords: ['manufacturing', 'industrial', 'automotive', 'oem', 'factory automation', 'hardware manufacturing'],
    defaultPainPoints: [
      'Unplanned equipment downtime and predictive maintenance gaps',
      'Supply chain vendor quality assurance and delivery delays',
      'Legacy ERP data integration across plant operations',
    ],
  },
  {
    name: 'CleanTech & Energy',
    keywords: ['cleantech', 'clean tech', 'energy', 'solar', 'climate tech', 'sustainability', 'utilities', 'renewables', 'renewable energy'],
    defaultPainPoints: [
      'Grid interconnection delays and regulatory permitting overhead',
      'Asset performance monitoring across distributed renewable sites',
      'Carbon accounting compliance and ESG reporting friction',
    ],
  },
  {
    name: 'BioTech & Life Sciences',
    keywords: ['biotech', 'life sciences', 'pharmaceuticals', 'genomics', 'drug discovery', 'clinical trials'],
    defaultPainPoints: [
      'Lengthy clinical trial participant recruitment and retention',
      'FDA / EMA regulatory filing complexity and audit trails',
      'High lab compute and bioinformatics pipeline bottlenecks',
    ],
  },
];

interface PersonaPattern {
  canonicalTitle: string;
  seniority: string;
  department: string;
  keywords: string[];
  painAngleTemplate: string;
}

const PERSONA_PATTERNS: PersonaPattern[] = [
  {
    canonicalTitle: 'Chief Technology Officer (CTO)',
    seniority: 'C-Level',
    department: 'Engineering',
    keywords: ['cto', 'ctos', 'chief technology officer', 'chief technology officers', 'head of technology', 'technical leader', 'technical leaders'],
    painAngleTemplate: 'Accelerating technical roadmaps and developer velocity while eliminating tech debt and architectural bottlenecks',
  },
  {
    canonicalTitle: 'VP of Engineering',
    seniority: 'VP',
    department: 'Engineering',
    keywords: ['vp of engineering', 'vp engineering', 'head of engineering', 'director of engineering', 'engineering director', 'vpe', 'vpes'],
    painAngleTemplate: 'Scaling engineering team productivity, code quality, and delivery predictability during high growth',
  },
  {
    canonicalTitle: 'Chief Information Security Officer (CISO)',
    seniority: 'C-Level',
    department: 'Security',
    keywords: ['ciso', 'cisos', 'chief information security officer', 'chief information security officers', 'head of security', 'director of security', 'security leader', 'security leaders', 'infosec lead', 'infosec leads', 'vp of security'],
    painAngleTemplate: 'Hardening security posture and maintaining continuous compliance without creating developer friction',
  },
  {
    canonicalTitle: 'Chief AI Officer / Head of AI',
    seniority: 'C-Level',
    department: 'AI & Data',
    keywords: ['caio', 'chief ai officer', 'head of ai', 'vp of ai', 'vp ai', 'head of machine learning', 'vp of data', 'chief data officer', 'cdo'],
    painAngleTemplate: 'Deploying reliable generative AI pipelines, cutting GPU compute overhead, and enforcing strict data privacy guardrails',
  },
  {
    canonicalTitle: 'VP of Sales / CRO',
    seniority: 'VP',
    department: 'Sales',
    keywords: ['vp of sales', 'vp sales', 'vps of sales', 'head of sales', 'cro', 'cros', 'chief revenue officer', 'chief revenue officers', 'sales director', 'director of sales'],
    painAngleTemplate: 'Generating qualified outbound sales pipeline, boosting SDR quota attainment, and shortening deal cycles',
  },
  {
    canonicalTitle: 'Head of Growth / VP Marketing',
    seniority: 'VP',
    department: 'Marketing',
    keywords: ['head of growth', 'growth lead', 'growth leads', 'vp marketing', 'vp of marketing', 'vps of marketing', 'cmo', 'cmos', 'chief marketing officer', 'marketing director'],
    painAngleTemplate: 'Lowering customer acquisition costs and establishing reliable high-intent inbound/outbound acquisition loops',
  },
  {
    canonicalTitle: 'Chief Executive Officer / Founder',
    seniority: 'Founder',
    department: 'Executive',
    keywords: ['ceo', 'ceos', 'founder', 'founders', 'co-founder', 'co-founders', 'cofounder', 'cofounders', 'chief executive officer', 'chief executive officers', 'president', 'managing director'],
    painAngleTemplate: 'Driving scalable revenue growth, expanding market share, and increasing operational margins',
  },
  {
    canonicalTitle: 'Chief Financial Officer (CFO)',
    seniority: 'C-Level',
    department: 'Finance',
    keywords: ['cfo', 'cfos', 'chief financial officer', 'chief financial officers', 'vp finance', 'vp of finance', 'head of finance', 'finance director'],
    painAngleTemplate: 'Optimizing software spend, improving EBITDA margins, and streamlining multi-entity financial reporting',
  },
  {
    canonicalTitle: 'Chief Operating Officer (COO)',
    seniority: 'C-Level',
    department: 'Operations',
    keywords: ['coo', 'coos', 'chief operating officer', 'chief operating officers', 'vp ops', 'vp operations', 'vp of operations', 'head of operations'],
    painAngleTemplate: 'Automating cross-functional workflows and reducing operational bottlenecks during rapid headcount scaling',
  },
  {
    canonicalTitle: 'VP of Product / CPO',
    seniority: 'VP',
    department: 'Product',
    keywords: ['cpo', 'cpos', 'chief product officer', 'chief product officers', 'vp of product', 'vp product', 'vps of product', 'head of product', 'product director'],
    painAngleTemplate: 'Shortening product discovery cycles, improving feature adoption, and driving product-led growth',
  },
  {
    canonicalTitle: 'Director of IT / CIO',
    seniority: 'Director',
    department: 'IT',
    keywords: ['cio', 'cios', 'chief information officer', 'chief information officers', 'director of it', 'head of it', 'it director'],
    painAngleTemplate: 'Modernizing internal IT workflows, managing SaaS sprawl, and ensuring enterprise-grade data security',
  },
  {
    canonicalTitle: 'Head of People / VP HR',
    seniority: 'VP',
    department: 'People & Talent',
    keywords: ['head of people', 'vp of people', 'vp hr', 'vp human resources', 'chief people officer', 'cpo talent', 'talent acquisition director', 'head of talent'],
    painAngleTemplate: 'Shortening time-to-hire for high-impact roles and scaling employee retention across distributed teams',
  },
  {
    canonicalTitle: 'VP of Customer Success',
    seniority: 'VP',
    department: 'Customer Success',
    keywords: ['vp of customer success', 'head of customer success', 'head of support', 'director of customer success', 'customer success lead'],
    painAngleTemplate: 'Preventing customer churn, accelerating time-to-value during onboarding, and uncovering expansion opportunities',
  },
];

const KNOWN_TECH_STACKS: string[] = [
  'AWS', 'Google Cloud', 'GCP', 'Azure', 'Snowflake', 'Databricks', 'Kubernetes', 'Docker',
  'Salesforce', 'HubSpot', 'PostgreSQL', 'MongoDB', 'Redis', 'React', 'Next.js',
  'TypeScript', 'Python', 'Node.js', 'Stripe', 'Segment', 'Datadog', 'CrowdStrike',
  'Okta', 'Wiz', 'Snyk', 'OpenAI', 'Anthropic', 'LangChain', 'LlamaIndex', 'Pinecone',
  'Supabase', 'Vercel', 'Kafka', 'Elasticsearch', 'Terraform', 'GraphQL', 'Shopify',
  'Marketo', 'Klaviyo',
];

const GEOGRAPHY_PATTERNS: Array<{ name: string; aliases: string[]; expanded: string[] }> = [
  { name: 'United States', aliases: ['us', 'usa', 'united states', 'u.s.', 'u.s.a.', 'american'], expanded: ['United States'] },
  { name: 'North America', aliases: ['north america', 'na', 'noram'], expanded: ['United States', 'Canada'] },
  { name: 'Europe', aliases: ['europe', 'eu', 'uk', 'united kingdom', 'emea', 'germany', 'france', 'nordics'], expanded: ['United Kingdom', 'Germany', 'France', 'Netherlands', 'Nordics'] },
  { name: 'United Kingdom', aliases: ['uk', 'united kingdom', 'britain', 'british', 'london'], expanded: ['United Kingdom'] },
  { name: 'Asia-Pacific', aliases: ['apac', 'asia', 'asia pacific', 'australia', 'singapore', 'japan'], expanded: ['Australia', 'Singapore', 'Japan', 'India'] },
  { name: 'Latin America', aliases: ['latam', 'latin america', 'brazil', 'mexico'], expanded: ['Brazil', 'Mexico', 'Colombia'] },
  { name: 'Middle East', aliases: ['middle east', 'mena', 'uae', 'dubai', 'saudi'], expanded: ['UAE', 'Saudi Arabia', 'Israel'] },
  { name: 'Global', aliases: ['global', 'worldwide', 'anywhere', 'international'], expanded: ['Global'] },
];

function parseHumanNumber(str: string): number | null {
  if (!str) return null;
  const clean = str.trim().toLowerCase().replace(/,/g, '');
  if (clean.endsWith('k')) {
    const val = parseFloat(clean.slice(0, -1));
    return isNaN(val) ? null : Math.round(val * 1000);
  }
  if (clean.endsWith('m') || clean.endsWith('mil') || clean.endsWith('million')) {
    const val = parseFloat(clean.replace(/(mil|million|m)$/, ''));
    return isNaN(val) ? null : Math.round(val * 1000000);
  }
  if (clean.endsWith('b') || clean.endsWith('billion')) {
    const val = parseFloat(clean.replace(/(billion|b)$/, ''));
    return isNaN(val) ? null : Math.round(val * 1000000000);
  }
  const val = parseFloat(clean);
  return isNaN(val) ? null : val;
}

// ─── TRANSLATOR ENGINE ────────────────────────────────────────────────────────

/**
 * Translates a plain-English campaign goal prompt into structured ICP, Personas, and 4-Step Sequence.
 */
export function translateGoalToStrategy(input: GoalTranslationInput): GoalTranslationResult {
  const rawPrompt = (input.goalPrompt || '').trim();
  const lowerPrompt = rawPrompt.toLowerCase();
  const valueProp = (input.valueProposition || '').trim();
  const productDesc = (input.productDescription || '').trim();

  // 1. Detect Industries
  const detectedIndustries: string[] = [];
  const matchedIndustryObjects: IndustryPattern[] = [];

  for (const ind of INDUSTRY_PATTERNS) {
    const isMatch = ind.keywords.some((kw) => {
      const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i');
      return regex.test(lowerPrompt);
    });
    if (isMatch) {
      detectedIndustries.push(ind.name);
      matchedIndustryObjects.push(ind);
    }
  }

  if (detectedIndustries.length === 0) {
    detectedIndustries.push('B2B SaaS');
    matchedIndustryObjects.push(INDUSTRY_PATTERNS[2]);
  }

  // 2. Detect Company Size Range
  let companySizeMin = 10;
  let companySizeMax = 500;

  const rangeMatch = lowerPrompt.match(/(\d+(?:\.\d+)?\s*[kmb]?)\s*(?:-|to|\.\.)\s*(\d+(?:\.\d+)?\s*[kmb]?)\s*(?:employees?|people|staff|headcount|emp)?/i);
  if (rangeMatch) {
    const minVal = parseHumanNumber(rangeMatch[1]);
    const maxVal = parseHumanNumber(rangeMatch[2]);
    if (minVal !== null && maxVal !== null && minVal > 0 && maxVal >= minVal) {
      companySizeMin = minVal;
      companySizeMax = maxVal;
    }
  } else {
    const plusMatch = lowerPrompt.match(/(?:>|over|at least|more than|\+)\s*(\d+(?:\.\d+)?\s*[kmb]?)\s*(?:employees?|people|staff|headcount|emp)?/i) ||
      lowerPrompt.match(/(\d+(?:\.\d+)?\s*[kmb]?)\s*(?:\+|plus)\s*(?:employees?|people|staff|headcount|emp)?/i);
    if (plusMatch) {
      const val = parseHumanNumber(plusMatch[1]);
      if (val !== null && val > 0) {
        companySizeMin = val;
        companySizeMax = Math.max(val * 10, 5000);
      }
    } else {
      const underMatch = lowerPrompt.match(/(?:<|under|less than|up to)\s*(\d+(?:\.\d+)?\s*[kmb]?)\s*(?:employees?|people|staff|headcount|emp)?/i);
      if (underMatch) {
        const val = parseHumanNumber(underMatch[1]);
        if (val !== null && val > 0) {
          companySizeMin = Math.max(1, Math.floor(val / 5));
          companySizeMax = val;
        }
      } else if (lowerPrompt.includes('startup') || lowerPrompt.includes('early stage') || lowerPrompt.includes('seed')) {
        companySizeMin = 5;
        companySizeMax = 50;
      } else if (lowerPrompt.includes('enterprise') || lowerPrompt.includes('fortune 500') || lowerPrompt.includes('large org')) {
        companySizeMin = 500;
        companySizeMax = 10000;
      } else if (lowerPrompt.includes('mid-market') || lowerPrompt.includes('scaleup') || lowerPrompt.includes('scale up')) {
        companySizeMin = 100;
        companySizeMax = 1000;
      }
    }
  }

  // Detect Revenue Range (e.g. $1M-$10M ARR, $5M+ revenue, >$2M ARR)
  let revenueMin: number | null = null;
  let revenueMax: number | null = null;

  const revRangeMatch = lowerPrompt.match(/\$(\d+(?:\.\d+)?\s*[kmb]?)\s*(?:-|to|\.\.)\s*\$?(\d+(?:\.\d+)?\s*[kmb]?)\s*(?:arr|revenue|rev)?/i);
  if (revRangeMatch) {
    const minR = parseHumanNumber(revRangeMatch[1]);
    const maxR = parseHumanNumber(revRangeMatch[2]);
    if (minR !== null && maxR !== null && minR >= 0 && maxR >= minR) {
      revenueMin = minR;
      revenueMax = maxR;
    }
  } else {
    const revPlusMatch = lowerPrompt.match(/(?:>|over|at least|more than|\+)\s*\$?(\d+(?:\.\d+)?\s*[kmb]?)\s*(?:arr|revenue|rev)/i) ||
      lowerPrompt.match(/\$(\d+(?:\.\d+)?\s*[kmb]?)\s*(?:\+|plus)\s*(?:arr|revenue|rev)?/i);
    if (revPlusMatch) {
      const minR = parseHumanNumber(revPlusMatch[1]);
      if (minR !== null && minR > 0) {
        revenueMin = minR;
        revenueMax = minR * 5;
      }
    }
  }

  // 3. Detect Tech Stack Mentions
  const detectedTechStack: string[] = [];
  const detectedExcludeTech: string[] = [];

  for (const tech of KNOWN_TECH_STACKS) {
    const techRegex = new RegExp(`\\b${tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (techRegex.test(rawPrompt)) {
      const excludeRegex = new RegExp(`(?:not using|without|excluding|except)\\s+[^.]*?\\b${tech}\\b`, 'i');
      if (excludeRegex.test(rawPrompt)) {
        detectedExcludeTech.push(tech);
      } else {
        detectedTechStack.push(tech);
      }
    }
  }

  // 4. Detect Buying Intent Signals
  const detectedSignals: string[] = [];

  if (lowerPrompt.includes('hiring') || lowerPrompt.includes('recruiting') || lowerPrompt.includes('headcount') || lowerPrompt.includes('open roles')) {
    if (
      /hiring\s+.*(?:leader|executive|vp|cto|ciso|head|director)/i.test(lowerPrompt) ||
      lowerPrompt.includes('hiring leader') ||
      lowerPrompt.includes('hiring leaders') ||
      lowerPrompt.includes('leadership')
    ) {
      detectedSignals.push('executive_hire');
    }
    detectedSignals.push('hiring_spike');
  }

  if (lowerPrompt.includes('funding') || lowerPrompt.includes('series a') || lowerPrompt.includes('series b') || lowerPrompt.includes('seed') || lowerPrompt.includes('raised') || lowerPrompt.includes('venture')) {
    detectedSignals.push('funding_round');
  }

  if (lowerPrompt.includes('migrating') || lowerPrompt.includes('switching') || lowerPrompt.includes('modernizing') || lowerPrompt.includes('adopting') || lowerPrompt.includes('cloud migration')) {
    detectedSignals.push('tech_migration');
  }

  if (lowerPrompt.includes('launch') || lowerPrompt.includes('product release') || lowerPrompt.includes('new product') || lowerPrompt.includes('announc')) {
    detectedSignals.push('product_launch');
  }

  if (detectedSignals.length === 0) {
    detectedSignals.push('hiring_spike', 'funding_round');
  }

  // 5. Detect Geography
  const detectedGeography: string[] = [];
  for (const geo of GEOGRAPHY_PATTERNS) {
    const isMatch = geo.aliases.some((alias) => {
      const regex = new RegExp(`\\b${alias}\\b`, 'i');
      return regex.test(lowerPrompt);
    });
    if (isMatch) {
      detectedGeography.push(...geo.expanded);
      break;
    }
  }
  if (detectedGeography.length === 0) {
    detectedGeography.push('United States', 'North America');
  }

  // 6. Detect Target Personas
  const detectedPersonas: PersonaData[] = [];
  for (const p of PERSONA_PATTERNS) {
    const isMatch = p.keywords.some((kw) => {
      const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i');
      return regex.test(lowerPrompt);
    });

    if (isMatch) {
      detectedPersonas.push({
        title: p.canonicalTitle,
        seniority: p.seniority,
        department: p.department,
        decisionMaker: true,
        painAngle: p.painAngleTemplate,
      });
    }
  }

  if (detectedPersonas.length === 0) {
    if (detectedIndustries.includes('Cybersecurity')) {
      detectedPersonas.push({
        title: 'Chief Information Security Officer (CISO)',
        seniority: 'C-Level',
        department: 'Security',
        decisionMaker: true,
        painAngle: 'Hardening security posture and maintaining continuous compliance without creating developer friction',
      });
      detectedPersonas.push({
        title: 'VP of Engineering',
        seniority: 'VP',
        department: 'Engineering',
        decisionMaker: true,
        painAngle: 'Scaling engineering security without slowing developer delivery velocity',
      });
    } else {
      detectedPersonas.push({
        title: 'Chief Technology Officer (CTO)',
        seniority: 'C-Level',
        department: 'Engineering',
        decisionMaker: true,
        painAngle: 'Accelerating technical roadmaps while eliminating engineering bottlenecks and infrastructure costs',
      });
      detectedPersonas.push({
        title: 'VP of Sales / CRO',
        seniority: 'VP',
        department: 'Sales',
        decisionMaker: true,
        painAngle: 'Generating qualified pipeline and shortening sales cycles through automated outbound workflows',
      });
    }
  }

  // 7. Compile Pain Points
  const compiledPainPoints: string[] = [];
  for (const matchedInd of matchedIndustryObjects) {
    for (const pp of matchedInd.defaultPainPoints) {
      if (!compiledPainPoints.includes(pp)) {
        compiledPainPoints.push(pp);
      }
    }
  }
  if (compiledPainPoints.length === 0) {
    compiledPainPoints.push(
      'Manual prospecting inefficiencies and low cold outreach conversion rates',
      'Scaling core operational workflows during team growth',
      'Predictable outbound pipeline generation',
    );
  }

  // Synthesize Core Value Prop
  const primaryIndustry = detectedIndustries[0] || 'B2B SaaS';
  const primaryPersona = detectedPersonas[0]?.title || 'Key Decision Makers';
  const effectiveValueProp = valueProp || productDesc ||
    `Empowering ${primaryIndustry} companies to automate outbound pipeline growth and connect with ${primaryPersona} using high-conviction buying signal intelligence.`;

  // 8. Generate Tailored 4-Step Sequence
  const primarySignal = detectedSignals[0] || 'hiring_spike';
  const signalLabel = primarySignal === 'hiring_spike' ? 'team expansion' :
    primarySignal === 'funding_round' ? 'recent funding milestone' :
    primarySignal === 'executive_hire' ? 'recent leadership expansion' :
    primarySignal === 'tech_migration' ? 'infrastructure modernization' : 'company growth';

  const sequenceSteps: SequenceStepData[] = [
    {
      step: 1,
      delayDays: 0,
      type: 'initial',
      template: 'Pain-Point Introduction & Signal Reference',
      subject: `Quick question regarding {{company}}'s ${signalLabel}`,
      bodyHook: `Hi {{firstName}},\n\nNoticed {{company}}'s recent ${signalLabel} in {{industry}}. Usually when scaling ${primaryPersona.split('(')[0].trim()} teams, the main bottleneck is ${compiledPainPoints[0]?.toLowerCase() || 'pipeline efficiency'}.\n\nWe built a signal-grounded outreach platform that helps ${primaryIndustry} leaders solve this.`,
      callToAction: `Would you be open to a brief 10-minute chat next Tuesday to see how peer teams are handling this?`,
      focus: 'Initial Pain-Point Introduction referencing verified intent signal',
    },
    {
      step: 2,
      delayDays: 3,
      type: 'followup_1',
      template: 'Quick Bump Note & Value Proof',
      subject: `Re: Quick question regarding {{company}}'s ${signalLabel}`,
      bodyHook: `Hi {{firstName}},\n\nFollowing up on my note earlier this week. Wanted to share a quick benchmark: similar ${primaryIndustry} organizations saw a 3.4x lift in qualified meetings within 30 days while eliminating manual prospecting friction.`,
      callToAction: `Would Thursday at 2pm or Friday morning work better for a quick 10-minute walkthrough?`,
      focus: 'Low-friction check-in with quantifiable social proof',
    },
    {
      step: 3,
      delayDays: 7,
      type: 'followup_2',
      template: 'Value Case Study & ROI Demonstration',
      subject: `Case study: How ${primaryIndustry} leaders tackled ${compiledPainPoints[0]?.split(' ')[0] || 'efficiency'}`,
      bodyHook: `Hi {{firstName}},\n\nThought you might find this relevant given your current growth. We recently published a breakdown of how high-growth ${primaryIndustry} teams tackled ${compiledPainPoints[1]?.toLowerCase() || 'operational scaling'}.\n\nHappy to share the full 2-page brief if you find it helpful.`,
      callToAction: `Let me know if you would like me to send over the PDF.`,
      focus: 'Deep value case study and actionable industry insights',
    },
    {
      step: 4,
      delayDays: 12,
      type: 'breakup',
      template: 'Break-up & Permission to Close File',
      subject: `Permission to close file for {{company}}?`,
      bodyHook: `Hi {{firstName}},\n\nI haven't heard back, so I assume addressing ${compiledPainPoints[0]?.toLowerCase() || 'outreach automation'} isn't a current priority for {{company}} right now — totally understand.\n\nI won't clutter your inbox further.`,
      callToAction: `If timing changes down the road, feel free to reach back out anytime. Wishing you and the {{company}} team continued success!`,
      focus: 'Polite break-up with zero-pressure asynchronous closing',
    },
  ];

  // Calculate Confidence Score
  let confidence = 0.75;
  if (rawPrompt.length > 30) confidence += 0.1;
  if (detectedIndustries.length > 0 && detectedIndustries[0] !== 'B2B SaaS') confidence += 0.05;
  if (rangeMatch) confidence += 0.05;
  if (detectedTechStack.length > 0) confidence += 0.05;
  confidence = Math.min(confidence, 0.98);

  const icpCriteria: IcpCriteriaData = {
    industries: detectedIndustries,
    companySizeMin,
    companySizeMax,
    revenueMin,
    revenueMax,
    techStack: detectedTechStack,
    excludeTechStack: detectedExcludeTech,
    requiredSignals: detectedSignals,
    minSignalScore: 60.0,
    valueProp: effectiveValueProp,
    painPoints: compiledPainPoints,
    geography: detectedGeography,
  };

  const summary = `Targeting ${detectedIndustries.join(', ')} companies (${companySizeMin}-${companySizeMax} employees) in ${detectedGeography.slice(0, 2).join(', ')} showing ${detectedSignals.map(s => s.replace('_', ' ')).join(' & ')} intent signals, pitching to ${detectedPersonas.map(p => p.title).join(' and ')}.`;

  return {
    icpCriteria,
    personas: detectedPersonas,
    sequenceSteps,
    confidence,
    summary,
    parsedGoal: {
      targetRole: detectedPersonas.map(p => p.title).join(', '),
      targetIndustry: detectedIndustries.join(', '),
      targetSize: `${companySizeMin} - ${companySizeMax} employees`,
      keySignal: detectedSignals.join(', '),
      geography: detectedGeography.join(', '),
    },
  };
}
