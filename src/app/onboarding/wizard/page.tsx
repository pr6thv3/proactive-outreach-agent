'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import {
  Sparkles,
  Bot,
  Target,
  Globe,
  Sliders,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Layers,
  Users,
  ShieldCheck,
  Zap,
  Clock,
  Mail,
  Plus,
  Trash2,
  HelpCircle,
} from 'lucide-react';
import type { IcpCriteriaData, PersonaData, SequenceStepData, GoalTranslationResult } from '@/lib/agents/think/goal-translator';

const EXAMPLE_GOALS = [
  'Find US fintechs with 50-500 employees hiring cybersecurity leaders and reach out to CTOs',
  'Target Series A B2B SaaS companies in Europe using AWS seeking to reduce customer churn, reaching out to VPs of Sales',
  'Target Healthcare enterprises with 500+ employees dealing with HIPAA compliance and pitch CISOs',
  'Find high-growth E-commerce brands (20-200 people) hiring SDRs and reach out to Founders',
];

export default function OnboardingWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);

  // Step 1: Product & Conversational Strategy
  const [productDesc, setProductDesc] = useState(
    'ProactiveReach is an Autonomous AI SDR platform that automates personalized B2B outreach grounded in verified buying signals.'
  );
  const [valueProp, setValueProp] = useState(
    'Increase reply rates from 2% to 12% by engaging high-conviction decision-makers with evidence-backed signal citations.'
  );
  const [goalPrompt, setGoalPrompt] = useState(
    'Find US fintechs with 50-500 employees hiring cybersecurity leaders and reach out to CTOs'
  );

  // Translation State
  const [translationResult, setTranslationResult] = useState<GoalTranslationResult | null>(null);

  // Step 2: ICP & Personas Refinement
  const [targetIndustries, setTargetIndustries] = useState<string[]>(['Fintech', 'Cybersecurity']);
  const [industryInput, setIndustryInput] = useState('');
  const [companySizeMin, setCompanySizeMin] = useState(50);
  const [companySizeMax, setCompanySizeMax] = useState(500);
  const [techStack, setTechStack] = useState<string[]>(['AWS', 'Kubernetes', 'Snowflake']);
  const [techInput, setTechInput] = useState('');
  const [painPoints, setPainPoints] = useState<string[]>([
    'Strict regulatory compliance and AML/KYC audit overhead',
    'Scaling secure payment infrastructure without latency spikes',
  ]);
  const [painPointInput, setPainPointInput] = useState('');
  const [requiredSignals, setRequiredSignals] = useState<string[]>(['hiring_spike', 'executive_hire']);
  const [minSignalScore, setMinSignalScore] = useState(60);
  const [personas, setPersonas] = useState<PersonaData[]>([
    {
      title: 'Chief Technology Officer (CTO)',
      seniority: 'C-Level',
      department: 'Engineering',
      decisionMaker: true,
      painAngle: 'Accelerating technical roadmaps while eliminating engineering bottlenecks and infrastructure costs',
    },
  ]);
  const [sequenceSteps, setSequenceSteps] = useState<SequenceStepData[]>([
    {
      step: 1,
      delayDays: 0,
      type: 'initial',
      template: 'Pain-Point Introduction & Signal Reference',
      subject: "Quick question regarding {{company}}'s team expansion",
      bodyHook: 'Hi {{firstName}},\n\nNoticed {{company}} is expanding its engineering team following your recent milestones. We help Fintech leaders address compliance overhead...',
      callToAction: 'Would you be open to a brief 10-minute chat next Tuesday?',
      focus: 'Initial Hook referencing verified intent signal',
    },
    {
      step: 2,
      delayDays: 3,
      type: 'followup_1',
      template: 'Quick Bump Note & Value Proof',
      subject: "Re: Quick question regarding {{company}}'s team expansion",
      bodyHook: 'Hi {{firstName}},\n\nFollowing up on my note earlier this week. Wanted to share a quick benchmark: peer Fintechs saw a 3.4x lift in qualified meetings...',
      callToAction: 'Would Thursday at 2pm work for a quick review?',
      focus: 'Low-friction check-in with quantifiable social proof',
    },
    {
      step: 3,
      delayDays: 7,
      type: 'followup_2',
      template: 'Value Case Study & ROI Demonstration',
      subject: 'Case study: How Fintech leaders solved compliance scaling',
      bodyHook: 'Hi {{firstName}},\n\nThought you might find this relevant given your current growth. We recently published a breakdown of how high-growth teams tackled compliance...',
      callToAction: 'Let me know if you would like me to send over the PDF.',
      focus: 'Deep value case study and actionable industry insights',
    },
    {
      step: 4,
      delayDays: 12,
      type: 'breakup',
      template: 'Break-up & Permission to Close File',
      subject: 'Permission to close file for {{company}}?',
      bodyHook: "Hi {{firstName}},\n\nI haven't heard back, so I assume this isn't a current priority for {{company}} right now — totally understand.",
      callToAction: 'If timing changes down the road, feel free to reach back out anytime.',
      focus: 'Polite break-up with zero-pressure asynchronous closing',
    },
  ]);

  // Step 3: Sending Domain Setup
  const [domain, setDomain] = useState('outreach.acmesaas.com');
  const [senderName, setSenderName] = useState('Alex Vance');
  const [senderEmail, setSenderEmail] = useState('alex@outreach.acmesaas.com');

  // Step 4: Autonomy Controls & Launch
  const [dailySendLimit, setDailySendLimit] = useState(50);
  const [minLeadScore, setMinLeadScore] = useState(60);
  const [autonomyEnabled, setAutonomyEnabled] = useState(true);
  const [campaignName, setCampaignName] = useState('Q1 Growth Outreach Campaign');

  // Load existing state on mount
  useEffect(() => {
    async function loadState() {
      try {
        const res = await fetch('/api/onboarding/state');
        if (res.ok) {
          const json = await res.json();
          const data = json.data;
          if (data) {
            if (data.step && data.step >= 1 && data.step <= 4) {
              setStep(data.step);
            }
            if (data.preference) {
              if (data.preference.dailySendLimit) setDailySendLimit(data.preference.dailySendLimit);
              if (data.preference.minLeadScore) setMinLeadScore(data.preference.minLeadScore);
              if (typeof data.preference.autonomyEnabled === 'boolean') {
                setAutonomyEnabled(data.preference.autonomyEnabled);
              }
            }
            if (data.icp) {
              if (data.icp.industries?.length) setTargetIndustries(data.icp.industries);
              if (data.icp.companySizeMin) setCompanySizeMin(data.icp.companySizeMin);
              if (data.icp.companySizeMax) setCompanySizeMax(data.icp.companySizeMax);
              if (data.icp.techStack?.length) setTechStack(data.icp.techStack);
              if (data.icp.painPoints?.length) setPainPoints(data.icp.painPoints);
              if (data.icp.valueProp) setValueProp(data.icp.valueProp);
              if (data.icp.requiredSignals?.length) setRequiredSignals(data.icp.requiredSignals);
              if (data.icp.minSignalScore) setMinSignalScore(data.icp.minSignalScore);
            }
            if (data.domains?.length) {
              setDomain(data.domains[0].domain);
              if (data.domains[0].fromName) setSenderName(data.domains[0].fromName);
              if (data.domains[0].fromEmail) setSenderEmail(data.domains[0].fromEmail);
            }
          }
        }
      } catch {
        // Fallback to local defaults
      } finally {
        setInitialLoaded(true);
      }
    }
    loadState();
  }, []);

  // Handle Goal Translation
  const handleTranslateGoal = async (customPrompt?: string) => {
    const promptToUse = customPrompt || goalPrompt;
    if (!promptToUse.trim()) {
      toast.error('Please enter a campaign goal prompt');
      return;
    }

    setTranslating(true);
    try {
      const res = await fetch('/api/icp/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalPrompt: promptToUse,
          valueProposition: valueProp,
          productDescription: productDesc,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const result: GoalTranslationResult = json.data;
        setTranslationResult(result);

        // Apply translated fields to form state
        if (result.icpCriteria) {
          if (result.icpCriteria.industries?.length) setTargetIndustries(result.icpCriteria.industries);
          if (result.icpCriteria.companySizeMin) setCompanySizeMin(result.icpCriteria.companySizeMin);
          if (result.icpCriteria.companySizeMax) setCompanySizeMax(result.icpCriteria.companySizeMax);
          if (result.icpCriteria.techStack?.length) setTechStack(result.icpCriteria.techStack);
          if (result.icpCriteria.painPoints?.length) setPainPoints(result.icpCriteria.painPoints);
          if (result.icpCriteria.requiredSignals?.length) setRequiredSignals(result.icpCriteria.requiredSignals);
          if (result.icpCriteria.minSignalScore) setMinSignalScore(result.icpCriteria.minSignalScore);
        }
        if (result.personas?.length) setPersonas(result.personas);
        if (result.sequenceSteps?.length) setSequenceSteps(result.sequenceSteps);

        toast.success('Strategy translated successfully!');
      } else {
        toast.error('Failed to translate campaign strategy');
      }
    } catch {
      toast.error('Error contacting strategy translation engine');
    } finally {
      setTranslating(false);
    }
  };

  const handleAddIndustry = () => {
    if (industryInput.trim() && !targetIndustries.includes(industryInput.trim())) {
      setTargetIndustries([...targetIndustries, industryInput.trim()]);
      setIndustryInput('');
    }
  };

  const handleRemoveIndustry = (ind: string) => {
    setTargetIndustries(targetIndustries.filter((i) => i !== ind));
  };

  const handleAddTech = () => {
    if (techInput.trim() && !techStack.includes(techInput.trim())) {
      setTechStack([...techStack, techInput.trim()]);
      setTechInput('');
    }
  };

  const handleRemoveTech = (tech: string) => {
    setTechStack(techStack.filter((t) => t !== tech));
  };

  const handleAddPainPoint = () => {
    if (painPointInput.trim() && !painPoints.includes(painPointInput.trim())) {
      setPainPoints([...painPoints, painPointInput.trim()]);
      setPainPointInput('');
    }
  };

  const handleRemovePainPoint = (pp: string) => {
    setPainPoints(painPoints.filter((p) => p !== pp));
  };

  const toggleSignal = (sig: string) => {
    if (requiredSignals.includes(sig)) {
      setRequiredSignals(requiredSignals.filter((s) => s !== sig));
    } else {
      setRequiredSignals([...requiredSignals, sig]);
    }
  };

  const handleNextStep = async () => {
    setLoading(true);

    try {
      // Step 1 -> Step 2: Auto-translate if not yet done
      if (step === 1) {
        if (!translationResult) {
          await handleTranslateGoal();
        }
      }

      // Step 2: Save ICP Criteria
      if (step === 2) {
        await fetch('/api/icp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            industries: targetIndustries,
            companySizeMin,
            companySizeMax,
            techStack,
            painPoints,
            requiredSignals,
            minSignalScore,
            valueProp,
          }),
        }).catch(() => {});
      }

      // Step 3: Register Domain Setup
      if (step === 3 && domain) {
        await fetch('/api/domains', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain,
            fromEmail: senderEmail,
            fromName: senderName,
            replyTo: senderEmail,
          }),
        }).catch(() => {});
      }

      // Step 4: Complete Onboarding & Launch Initial Campaign
      if (step === 4) {
        await fetch('/api/onboarding/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dailySendLimit: Number(dailySendLimit),
            minLeadScore: Number(minLeadScore),
            autonomyEnabled,
            campaignName: campaignName || 'Autonomous Launch Campaign',
            goal: goalPrompt,
            targetAudience: `${targetIndustries.join(', ')} (${companySizeMin}-${companySizeMax} emp)`,
            offer: valueProp,
            senderName,
            senderEmail,
            productDescription: productDesc,
            sequenceSteps,
          }),
        }).catch(() => {});

        toast.success('Onboarding complete! Campaign initialized.');
        router.push('/dashboard');
        return;
      }

      // Persist next step
      const nextStep = step + 1;
      await fetch('/api/onboarding/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: nextStep }),
      }).catch(() => {});

      setStep(nextStep);
    } catch {
      toast.error('An error occurred during step transition');
    } finally {
      setLoading(false);
    }
  };

  const handlePrevStep = async () => {
    if (step > 1) {
      const prevStep = step - 1;
      setStep(prevStep);
      await fetch('/api/onboarding/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: prevStep }),
      }).catch(() => {});
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-8 text-slate-100 selection:bg-blue-600 selection:text-white">
      {/* Top Header */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-950/40 px-3 py-1 text-xs font-semibold text-blue-400 mb-3 backdrop-blur">
          <Sparkles className="h-3.5 w-3.5" /> Autonomous AI SDR Onboarding
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Conversational Campaign Setup
        </h1>
        <p className="mt-2 text-sm text-slate-400 max-w-lg mx-auto">
          Define your product, target ICP, and natural goals. Our agent automatically builds high-conviction outreach sequences.
        </p>
      </div>

      {/* 4-Step Progress Indicator */}
      <div className="mb-8 w-full max-w-3xl">
        <div className="grid grid-cols-4 gap-2 text-xs font-medium text-slate-400 mb-3">
          <div className={`flex items-center gap-1.5 ${step >= 1 ? 'text-blue-400 font-semibold' : ''}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>1</span>
            <span>Product & Goal</span>
          </div>
          <div className={`flex items-center gap-1.5 ${step >= 2 ? 'text-blue-400 font-semibold' : ''}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>2</span>
            <span>ICP & Strategy</span>
          </div>
          <div className={`flex items-center gap-1.5 ${step >= 3 ? 'text-blue-400 font-semibold' : ''}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${step >= 3 ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>3</span>
            <span>Sending Domain</span>
          </div>
          <div className={`flex items-center gap-1.5 ${step >= 4 ? 'text-blue-400 font-semibold' : ''}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${step >= 4 ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>4</span>
            <span>Autonomy & Launch</span>
          </div>
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-800">
          <div
            className="h-1.5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-300"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>
      </div>

      {/* Main Card Container */}
      <Card className="w-full max-w-3xl border-slate-800 bg-slate-900/90 text-slate-100 shadow-2xl backdrop-blur">
        <CardHeader className="border-b border-slate-800/80 pb-5">
          {step === 1 && (
            <div>
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-400" />
                Step 1: Product & Conversational Campaign Goal
              </CardTitle>
              <CardDescription className="text-slate-400 text-sm mt-1">
                Describe your business and input your campaign goal in plain English. The AI will translate it into structured criteria.
              </CardDescription>
            </div>
          )}

          {step === 2 && (
            <div>
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <Target className="h-5 w-5 text-blue-400" />
                Step 2: Review ICP Criteria & 4-Step Sequence
              </CardTitle>
              <CardDescription className="text-slate-400 text-sm mt-1">
                Refine the translated ideal customer profile, target personas, and multi-touch sequence parameters.
              </CardDescription>
            </div>
          )}

          {step === 3 && (
            <div>
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <Globe className="h-5 w-5 text-blue-400" />
                Step 3: Sending Domain & Deliverability Setup
              </CardTitle>
              <CardDescription className="text-slate-400 text-sm mt-1">
                Configure your dedicated outbound subdomain for isolated reputation and DKIM/SPF verification.
              </CardDescription>
            </div>
          )}

          {step === 4 && (
            <div>
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <Sliders className="h-5 w-5 text-blue-400" />
                Step 4: Autonomy Controls & Launch Campaign
              </CardTitle>
              <CardDescription className="text-slate-400 text-sm mt-1">
                Set safety pacing thresholds, activate autonomous discovery & drafting, and launch your campaign.
              </CardDescription>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* STEP 1: PRODUCT & GOAL TRANSLATOR                                  */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="productDesc" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Product / Service Description
                </Label>
                <Textarea
                  id="productDesc"
                  value={productDesc}
                  onChange={(e) => setProductDesc(e.target.value)}
                  rows={2}
                  className="border-slate-800 bg-slate-950 text-slate-100 text-sm placeholder:text-slate-500 focus:border-blue-500"
                  placeholder="e.g. ProactiveReach is an AI B2B outreach platform..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="valueProp" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Core Value Proposition
                </Label>
                <Textarea
                  id="valueProp"
                  value={valueProp}
                  onChange={(e) => setValueProp(e.target.value)}
                  rows={2}
                  className="border-slate-800 bg-slate-950 text-slate-100 text-sm placeholder:text-slate-500 focus:border-blue-500"
                  placeholder="e.g. Increase reply rates with verified buying signal intelligence..."
                />
              </div>

              {/* Conversational Goal Input Box */}
              <div className="rounded-xl border border-blue-900/50 bg-blue-950/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-blue-400" />
                    <Label htmlFor="goalPrompt" className="text-sm font-bold text-blue-200">
                      Conversational Campaign Goal (Plain English)
                    </Label>
                  </div>
                  <Badge variant="outline" className="border-blue-700 bg-blue-950 text-blue-300 text-[10px]">
                    NLP Strategy Engine
                  </Badge>
                </div>

                <Textarea
                  id="goalPrompt"
                  value={goalPrompt}
                  onChange={(e) => setGoalPrompt(e.target.value)}
                  rows={3}
                  className="border-blue-900/60 bg-slate-950 text-slate-100 text-sm focus:border-blue-400 placeholder:text-slate-500"
                  placeholder="e.g. Find US fintechs with 50-500 employees hiring cybersecurity leaders and reach out to CTOs..."
                />

                {/* Example Quick Prompts */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-medium text-slate-400">Quick Prompt Suggestions:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {EXAMPLE_GOALS.map((ex, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setGoalPrompt(ex);
                          handleTranslateGoal(ex);
                        }}
                        className="rounded-md border border-slate-800 bg-slate-950/80 px-2 py-1 text-[11px] text-slate-300 hover:border-blue-500 hover:text-blue-300 transition-colors text-left"
                      >
                        {ex.length > 55 ? `${ex.slice(0, 55)}...` : ex}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button
                    type="button"
                    onClick={() => handleTranslateGoal()}
                    disabled={translating || !goalPrompt.trim()}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md"
                  >
                    {translating ? (
                      <>
                        <div className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Translating Strategy...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Translate Goal with AI
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Translation Live Preview Card */}
              {translationResult && (
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" /> Strategy Generated (Confidence: {Math.round(translationResult.confidence * 100)}%)
                    </span>
                    <span className="text-[11px] text-slate-400">Ready to review in Step 2</span>
                  </div>
                  <p className="text-xs text-slate-300 font-medium leading-relaxed bg-slate-900/70 p-2.5 rounded border border-slate-800/60">
                    {translationResult.summary}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded bg-slate-900 p-2 border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">Target Personas:</span>
                      <span className="text-slate-200 font-semibold">{translationResult.parsedGoal.targetRole}</span>
                    </div>
                    <div className="rounded bg-slate-900 p-2 border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">Buying Intent Signals:</span>
                      <span className="text-slate-200 font-semibold">{translationResult.parsedGoal.keySignal}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* STEP 2: ICP & STRATEGY REFINEMENT                                  */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <div className="space-y-6">
              {/* Target Industries */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Target Industries
                </Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {targetIndustries.map((ind) => (
                    <Badge key={ind} className="bg-blue-950 text-blue-300 border border-blue-800 flex items-center gap-1">
                      {ind}
                      <button
                        type="button"
                        onClick={() => handleRemoveIndustry(ind)}
                        className="hover:text-red-400 ml-1 text-xs"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={industryInput}
                    onChange={(e) => setIndustryInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddIndustry(); } }}
                    placeholder="Add industry (e.g. Fintech, Healthcare)..."
                    className="border-slate-800 bg-slate-950 text-slate-100 text-sm"
                  />
                  <Button type="button" onClick={handleAddIndustry} variant="outline" size="sm" className="border-slate-800">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Company Size Range */}
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <Label className="font-semibold uppercase tracking-wider text-slate-300">
                    Company Employee Count ({companySizeMin} - {companySizeMax} Employees)
                  </Label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[11px] text-slate-400">Min Employees:</span>
                    <Input
                      type="number"
                      value={companySizeMin}
                      onChange={(e) => setCompanySizeMin(Math.max(1, Number(e.target.value)))}
                      className="border-slate-800 bg-slate-950 text-slate-100 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[11px] text-slate-400">Max Employees:</span>
                    <Input
                      type="number"
                      value={companySizeMax}
                      onChange={(e) => setCompanySizeMax(Math.max(companySizeMin, Number(e.target.value)))}
                      className="border-slate-800 bg-slate-950 text-slate-100 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Tech Stack & Required Signals */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Target Tech Stack
                  </Label>
                  <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                    {techStack.map((tech) => (
                      <Badge key={tech} variant="outline" className="border-slate-700 bg-slate-950 text-slate-300 text-xs">
                        {tech}
                        <button type="button" onClick={() => handleRemoveTech(tech)} className="hover:text-red-400 ml-1">
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={techInput}
                      onChange={(e) => setTechInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTech(); } }}
                      placeholder="Add tech (e.g. AWS, Snowflake)..."
                      className="border-slate-800 bg-slate-950 text-slate-100 text-xs"
                    />
                    <Button type="button" onClick={handleAddTech} variant="outline" size="sm" className="border-slate-800">
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Required Intent Signals
                  </Label>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {[
                      { id: 'hiring_spike', label: 'Hiring Spike' },
                      { id: 'executive_hire', label: 'Executive Hire' },
                      { id: 'funding_round', label: 'Funding Round' },
                      { id: 'tech_migration', label: 'Tech Migration' },
                    ].map((sig) => (
                      <button
                        key={sig.id}
                        type="button"
                        onClick={() => toggleSignal(sig.id)}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                          requiredSignals.includes(sig.id)
                            ? 'bg-blue-900/60 border-blue-500 text-blue-200'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        {sig.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Target Personas */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Target Decision Makers & Personas
                </Label>
                <div className="space-y-2">
                  {personas.map((p, idx) => (
                    <div key={idx} className="rounded-lg border border-slate-800 bg-slate-950 p-3 flex items-start gap-3">
                      <Users className="h-4 w-4 text-blue-400 mt-0.5" />
                      <div className="flex-1 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-200">{p.title}</span>
                          <Badge variant="outline" className="text-[10px] border-slate-700">{p.seniority}</Badge>
                          <Badge variant="outline" className="text-[10px] border-slate-700">{p.department}</Badge>
                        </div>
                        <p className="text-slate-400 mt-1">{p.painAngle}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4-Step Sequence Preview */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Tailored 4-Step Sequence Preview
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {sequenceSteps.map((st) => (
                    <div key={st.step} className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-blue-400">Step {st.step} (Day {st.delayDays})</span>
                        <span className="text-[11px] text-slate-400">{st.template}</span>
                      </div>
                      <p className="text-xs font-medium text-slate-200 truncate">{st.subject}</p>
                      <p className="text-[11px] text-slate-400 line-clamp-2">{st.bodyHook}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* STEP 3: SENDING DOMAIN SETUP                                       */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="domain" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Sending Subdomain (e.g. outreach.yourcompany.com)
                  </Label>
                  <Input
                    id="domain"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="outreach.acmesaas.com"
                    className="border-slate-800 bg-slate-950 text-slate-100 text-sm"
                  />
                  <p className="text-xs text-slate-400">
                    We recommend using a dedicated subdomain to protect your primary domain reputation.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="senderName" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Sender Display Name
                    </Label>
                    <Input
                      id="senderName"
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      placeholder="Alex from Acme"
                      className="border-slate-800 bg-slate-950 text-slate-100 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="senderEmail" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Sender Email Address
                    </Label>
                    <Input
                      id="senderEmail"
                      value={senderEmail}
                      onChange={(e) => setSenderEmail(e.target.value)}
                      placeholder="alex@outreach.acmesaas.com"
                      className="border-slate-800 bg-slate-950 text-slate-100 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* DNS Verification Helper Card */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  <span>Deliverability & DNS Protocol Checklist</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="rounded border border-slate-800 bg-slate-900 p-2.5">
                    <span className="font-bold text-blue-300 block mb-1">SPF Record</span>
                    <p className="text-slate-400 text-[11px]">Authorizes outbound IP sending permissions.</p>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-900 p-2.5">
                    <span className="font-bold text-blue-300 block mb-1">DKIM Keys</span>
                    <p className="text-slate-400 text-[11px]">Cryptographically signs messages to guarantee integrity.</p>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-900 p-2.5">
                    <span className="font-bold text-blue-300 block mb-1">DMARC Policy</span>
                    <p className="text-slate-400 text-[11px]">Protects your domain from spoofing and phishing.</p>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">
                  Full DNS CNAME and TXT values can be verified in the domain dashboard with 1-click clipboard helpers.
                </p>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* STEP 4: AUTONOMY CONTROLS & LAUNCH                                 */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="campName" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Campaign Name
                </Label>
                <Input
                  id="campName"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  className="border-slate-800 bg-slate-950 text-slate-100 text-sm font-semibold"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dailyLimit" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Max Daily Sends ({dailySendLimit} emails/day)
                  </Label>
                  <Input
                    id="dailyLimit"
                    type="number"
                    value={dailySendLimit}
                    onChange={(e) => setDailySendLimit(Number(e.target.value))}
                    className="border-slate-800 bg-slate-950 text-slate-100 text-sm"
                  />
                  <p className="text-[11px] text-slate-400">
                    Paced safely within Upstash Redis throttles with dynamic jitter.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="minScore" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Minimum Lead Score Threshold ({minLeadScore} / 100)
                  </Label>
                  <Input
                    id="minScore"
                    type="number"
                    value={minLeadScore}
                    onChange={(e) => setMinLeadScore(Number(e.target.value))}
                    className="border-slate-800 bg-slate-950 text-slate-100 text-sm"
                  />
                  <p className="text-[11px] text-slate-400">
                    Only leads with a multi-factor score above this threshold will be contacted.
                  </p>
                </div>
              </div>

              {/* Autopilot Switch */}
              <div className="rounded-xl border border-blue-900/40 bg-blue-950/20 p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-blue-400" />
                    <span className="font-bold text-sm text-slate-100">Activate Autonomous AI SDR Autopilot</span>
                  </div>
                  <p className="text-xs text-slate-400 max-w-md">
                    Enables the agent to autonomously discover qualified prospects, research signals, generate grounded copy, and prepare outreach.
                  </p>
                </div>
                <Switch
                  checked={autonomyEnabled}
                  onCheckedChange={setAutonomyEnabled}
                  className="data-[state=checked]:bg-blue-600"
                />
              </div>

              {/* Strategy Summary Card */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                  Campaign Configuration Summary
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Industries:</span>
                    <span className="font-semibold text-slate-200 truncate block">{targetIndustries.join(', ')}</span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Company Size:</span>
                    <span className="font-semibold text-slate-200 block">{companySizeMin}-{companySizeMax} emp</span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Sequence Steps:</span>
                    <span className="font-semibold text-slate-200 block">{sequenceSteps.length} touches</span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Sender:</span>
                    <span className="font-semibold text-slate-200 truncate block">{senderEmail}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-between border-t border-slate-800/80 pt-5">
          <Button
            type="button"
            variant="outline"
            disabled={step === 1 || loading}
            onClick={handlePrevStep}
            className="border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-900"
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
          </Button>

          <Button
            type="button"
            onClick={handleNextStep}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-900/30"
          >
            {loading ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Saving...
              </>
            ) : step === 4 ? (
              <>
                <Zap className="mr-1.5 h-4 w-4" /> Launch Campaign & Open Dashboard
              </>
            ) : (
              <>
                Next Step <ArrowRight className="ml-1.5 h-4 w-4" />
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
