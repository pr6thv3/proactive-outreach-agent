'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Sparkles,
  Plus,
  Trash2,
  ArrowRight,
  Bot,
  Layers,
  Send,
  Sliders,
  CheckCircle2,
  Download,
  Zap,
} from 'lucide-react';
import type { GoalTranslationResult, SequenceStepData } from '@/lib/agents/think/goal-translator';

const PRESET_GOALS = [
  'Find US fintechs with 50-500 employees hiring cybersecurity leaders and reach out to CTOs',
  'Target Series A B2B SaaS companies in Europe using AWS seeking to reduce customer churn, reaching out to VPs of Sales',
  'Target Healthcare enterprises with 500+ employees dealing with HIPAA compliance and pitch CISOs',
  'Find high-growth E-commerce brands (20-200 people) hiring SDRs and reach out to Founders',
];

export function CampaignBuilder() {
  const router = useRouter();

  // Campaign Form State
  const [name, setName] = useState('Q3 Engineering SaaS Outreach');
  const [goal, setGoal] = useState('Find technical decision-makers and book architecture discovery calls');
  const [targetAudience, setTargetAudience] = useState('B2B SaaS & Fintech CTOs (50-500 emp)');
  const [offer, setOffer] = useState('Free 15-minute infrastructure ROI and benchmark review');
  const [fromEmail, setFromEmail] = useState('alex@outreach.acmesaas.com');
  const [fromName, setFromName] = useState('Alex from Acme');
  const [dailyLimit, setDailyLimit] = useState(50);
  const [tone, setTone] = useState('professional');
  const [cta, setCta] = useState('Would you be open to a 10-minute chat next Tuesday?');

  // Conversational Strategy Generator State
  const [goalInput, setGoalInput] = useState('');
  const [generatingStrategy, setGeneratingStrategy] = useState(false);
  const [strategyGenerated, setStrategyGenerated] = useState<GoalTranslationResult | null>(null);

  // Sequence Steps State (4-step default)
  const [steps, setSteps] = useState<Array<{
    step: number;
    delayDays: number;
    type: string;
    template: string;
    subject?: string;
    bodyHook?: string;
  }>>([
    {
      step: 1,
      delayDays: 0,
      type: 'initial',
      template: 'Pain-Point Introduction',
      subject: 'Quick question regarding {{company}}\'s team expansion',
      bodyHook: 'Noticed {{company}} is scaling engineering following your recent milestones...',
    },
    {
      step: 2,
      delayDays: 3,
      type: 'followup_1',
      template: 'Quick Bump Note & Social Proof',
      subject: 'Re: Quick question regarding {{company}}\'s team expansion',
      bodyHook: 'Following up on my previous note. Similar teams saw a 3x lift in qualified meetings...',
    },
    {
      step: 3,
      delayDays: 7,
      type: 'followup_2',
      template: 'Value Case Study & ROI Brief',
      subject: 'Case study: How peer tech leaders tackled pipeline velocity',
      bodyHook: 'Sharing a brief 2-page benchmark breakdown of how high-growth teams solve this...',
    },
    {
      step: 4,
      delayDays: 12,
      type: 'breakup',
      template: 'Break-up & Permission to Close File',
      subject: 'Permission to close file for {{company}}?',
      bodyHook: 'I haven\'t heard back so I assume this isn\'t a top priority right now. Wishing you the best!',
    },
  ]);

  const [loading, setLoading] = useState(false);

  // Generate strategy from plain English prompt
  const handleGenerateStrategy = async (overridePrompt?: string) => {
    const prompt = overridePrompt || goalInput;
    if (!prompt.trim()) {
      toast.error('Please enter a campaign goal prompt');
      return;
    }

    setGeneratingStrategy(true);
    try {
      const res = await fetch('/api/icp/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalPrompt: prompt,
          valueProposition: offer,
          productDescription: goal,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const result: GoalTranslationResult = json.data;
        setStrategyGenerated(result);

        // 1-Click Apply into Campaign Form
        if (result.parsedGoal) {
          setName(`${result.parsedGoal.targetIndustry} - ${result.parsedGoal.targetRole.split(',')[0]} Outreach`);
          setGoal(`Reach out to ${result.parsedGoal.targetRole} at ${result.parsedGoal.targetIndustry} companies with ${result.parsedGoal.targetSize}`);
          setTargetAudience(`${result.parsedGoal.targetIndustry} (${result.parsedGoal.targetSize})`);
        }

        if (result.icpCriteria?.valueProp) {
          setOffer(result.icpCriteria.valueProp);
        }

        if (result.sequenceSteps?.length) {
          setSteps(result.sequenceSteps.map((st) => ({
            step: st.step,
            delayDays: st.delayDays,
            type: st.type,
            template: st.template,
            subject: st.subject,
            bodyHook: st.bodyHook,
          })));
        }

        toast.success('Strategy generated and applied to campaign builder!');
      } else {
        toast.error('Failed to generate strategy');
      }
    } catch {
      toast.error('Error contacting strategy translation service');
    } finally {
      setGeneratingStrategy(false);
    }
  };

  // Import existing saved ICP from /api/icp
  const handleImportIcp = async () => {
    try {
      const res = await fetch('/api/icp');
      if (res.ok) {
        const json = await res.json();
        const icp = json.data;
        if (icp) {
          const inds = Array.isArray(icp.industries) ? icp.industries.join(', ') : 'B2B Tech';
          const size = `${icp.companySizeMin || 10}-${icp.companySizeMax || 500} emp`;
          setTargetAudience(`${inds} (${size})`);
          if (icp.valueProp) setOffer(icp.valueProp);
          setName(`${inds} Outbound Campaign`);
          toast.success('Imported ICP criteria from onboarding!');
        }
      }
    } catch {
      toast.error('Failed to import ICP criteria');
    }
  };

  const addStep = () => {
    const nextStepNum = steps.length + 1;
    const defaultDelay = nextStepNum === 2 ? 3 : nextStepNum === 3 ? 7 : (steps[steps.length - 1]?.delayDays || 0) + 4;
    setSteps([
      ...steps,
      {
        step: nextStepNum,
        delayDays: defaultDelay,
        type: `followup_${nextStepNum - 1}`,
        template: 'Custom Follow-up Note',
        subject: `Follow-up #${nextStepNum - 1} for {{company}}`,
        bodyHook: 'Following up on our earlier note with additional insights...',
      },
    ]);
  };

  const removeStep = (index: number) => {
    const filtered = steps.filter((_, i) => i !== index).map((s, idx) => ({ ...s, step: idx + 1 }));
    setSteps(filtered);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          goal,
          targetAudience,
          offer,
          fromEmail,
          fromName,
          senderEmail: fromEmail,
          senderName: fromName,
          dailyLimit: Number(dailyLimit),
          maxDailySends: Number(dailyLimit),
          tone,
          cta,
          sequenceSteps: steps,
          followUpSchedule: steps.slice(1).map(s => s.delayDays),
        }),
      });

      if (res.ok) {
        toast.success('Campaign created successfully!');
        router.push('/dashboard/campaigns');
      } else {
        toast.error('Failed to create campaign');
      }
    } catch {
      toast.error('Error saving campaign');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Conversational Strategy Generator Panel */}
      <Card className="border-blue-900/50 bg-gradient-to-br from-slate-900 via-blue-950/20 to-slate-900 text-slate-100 shadow-xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-400" />
              <CardTitle className="text-lg font-bold">Conversational Campaign Strategy Generator</CardTitle>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleImportIcp}
              className="border-slate-700 bg-slate-950 text-slate-300 text-xs hover:border-blue-500"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> Import Onboarding ICP
            </Button>
          </div>
          <CardDescription className="text-slate-400 text-xs">
            Input a plain-English campaign goal. Our AI agent will auto-populate target parameters, personas, and a 4-step sequence.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              placeholder="e.g. Find US fintechs with 50-500 employees hiring cybersecurity leaders and reach out to CTOs..."
              className="border-slate-800 bg-slate-950 text-slate-100 text-sm focus:border-blue-500"
            />
            <Button
              type="button"
              onClick={() => handleGenerateStrategy()}
              disabled={generatingStrategy || !goalInput.trim()}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shrink-0"
            >
              {generatingStrategy ? (
                <>
                  <div className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Generating...
                </>
              ) : (
                <>
                  <Bot className="mr-1.5 h-3.5 w-3.5" /> 1-Click Apply Strategy
                </>
              )}
            </Button>
          </div>

          {/* Quick Presets */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] text-slate-400">Quick Presets:</span>
            {PRESET_GOALS.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setGoalInput(preset);
                  handleGenerateStrategy(preset);
                }}
                className="rounded border border-slate-800 bg-slate-950/90 px-2 py-0.5 text-[11px] text-slate-400 hover:border-blue-500 hover:text-blue-300 transition-colors"
              >
                {preset.length > 40 ? `${preset.slice(0, 40)}...` : preset}
              </button>
            ))}
          </div>

          {strategyGenerated && (
            <div className="rounded border border-emerald-800/60 bg-emerald-950/20 p-2.5 text-xs text-emerald-300 flex items-center justify-between mt-2">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Strategy applied: {strategyGenerated.summary}
              </span>
              <Badge variant="outline" className="border-emerald-700 text-emerald-300 text-[10px]">
                {Math.round(strategyGenerated.confidence * 100)}% Confidence
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Campaign Configuration Form */}
      <Card className="border-slate-800 bg-slate-900 text-slate-100 shadow-xl">
        <CardHeader>
          <CardTitle className="text-xl font-bold">Campaign Parameters & Sequence Settings</CardTitle>
          <CardDescription className="text-slate-400 text-xs">
            Review and fine-tune sender identities, daily send quotas, and multi-step sequence steps.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Campaign Name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border-slate-800 bg-slate-950 text-slate-100 font-medium"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dailyLimit" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Daily Send Limit
              </Label>
              <Input
                id="dailyLimit"
                type="number"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(Number(e.target.value))}
                className="border-slate-800 bg-slate-950 text-slate-100"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetAudience" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Target Audience (ICP)
              </Label>
              <Input
                id="targetAudience"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                className="border-slate-800 bg-slate-950 text-slate-100 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="offer" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Core Offer / Value Prop
              </Label>
              <Input
                id="offer"
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
                className="border-slate-800 bg-slate-950 text-slate-100 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fromName" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Sender Display Name
              </Label>
              <Input
                id="fromName"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                className="border-slate-800 bg-slate-950 text-slate-100 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fromEmail" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Sender Email
              </Label>
              <Input
                id="fromEmail"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                className="border-slate-800 bg-slate-950 text-slate-100 text-sm"
              />
            </div>
          </div>

          {/* Sequence Steps Section */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div>
                <h4 className="text-sm font-bold text-slate-200">
                  Multi-Touch Outreach Sequence ({steps.length} Steps)
                </h4>
                <p className="text-[11px] text-slate-400">
                  Adaptive sequence cadence automatically halting upon recipient response, bounce, or unsubscribe.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={addStep}
                variant="outline"
                className="border-slate-800 bg-slate-950 text-slate-300 text-xs"
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add Step
              </Button>
            </div>

            <div className="space-y-3">
              {steps.map((st, i) => {
                const stepChannel = (st as any).channel || 'email';
                const isLinkedIn = stepChannel.startsWith('linkedin');
                const isConnect = stepChannel === 'linkedin_connect';

                return (
                  <div key={i} className={`rounded-lg border ${isLinkedIn ? 'border-indigo-900/60 bg-indigo-950/20' : 'border-slate-800 bg-slate-950'} p-4 space-y-3`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-blue-950 text-blue-300 border border-blue-800 font-mono">
                          Step {st.step}
                        </Badge>

                        {/* Channel Selector */}
                        <select
                          value={stepChannel}
                          onChange={(e) => {
                            const updated = [...steps];
                            (updated[i] as any).channel = e.target.value;
                            if (e.target.value === 'linkedin_visit') {
                              updated[i].template = 'LinkedIn Profile Visit & Social Awareness';
                            } else if (e.target.value === 'linkedin_connect') {
                              updated[i].template = 'LinkedIn Connection Request & Note';
                              (updated[i] as any).linkedinNote = 'Hi {{firstName}}, saw your recent team expansion at {{company}}. Would love to connect and share benchmark data on deliverability.';
                            } else if (e.target.value === 'linkedin_message') {
                              updated[i].template = 'LinkedIn Direct Message / InMail';
                            } else {
                              updated[i].template = 'Pain-Point Introduction & Signal Reference';
                            }
                            setSteps(updated);
                          }}
                          className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                        >
                          <option value="email">✉️ Email Touchpoint</option>
                          <option value="linkedin_visit">👁️ LinkedIn Profile Visit</option>
                          <option value="linkedin_connect">🤝 LinkedIn Connection Request</option>
                          <option value="linkedin_message">💬 LinkedIn Direct Message (InMail)</option>
                        </select>

                        <span className="font-semibold text-slate-300 truncate max-w-[200px]">{st.template}</span>
                      </div>

                      <div className="flex items-center gap-2 text-slate-400">
                        <span>Send Delay:</span>
                        <Input
                          type="number"
                          value={st.delayDays}
                          onChange={(e) => {
                            const updated = [...steps];
                            updated[i].delayDays = Number(e.target.value);
                            setSteps(updated);
                          }}
                          className="w-16 h-7 border-slate-800 bg-slate-900 text-slate-100 text-xs"
                        />
                        <span>days</span>
                        {steps.length > 1 && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => removeStep(i)}
                            className="h-7 w-7 text-red-400 hover:text-red-300 ml-2"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Channel Specific Inputs */}
                    {stepChannel === 'email' ? (
                      <div className="space-y-2">
                        <Input
                          value={st.subject || ''}
                          onChange={(e) => {
                            const updated = [...steps];
                            updated[i].subject = e.target.value;
                            setSteps(updated);
                          }}
                          placeholder="Email subject line..."
                          className="border-slate-800 bg-slate-900 text-slate-100 text-xs font-medium"
                        />
                        <Textarea
                          value={st.bodyHook || ''}
                          onChange={(e) => {
                            const updated = [...steps];
                            updated[i].bodyHook = e.target.value;
                            setSteps(updated);
                          }}
                          rows={2}
                          placeholder="Email body template & opening hook..."
                          className="border-slate-800 bg-slate-900 text-slate-300 text-xs"
                        />
                      </div>
                    ) : isConnect ? (
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-[11px] text-slate-400">
                          <span>Personalized LinkedIn Connection Note (Max 300 characters)</span>
                          <span className={((st as any).linkedinNote || '').length > 300 ? 'text-red-400 font-bold' : 'text-slate-400 font-mono'}>
                            {((st as any).linkedinNote || '').length}/300
                          </span>
                        </div>
                        <Textarea
                          value={(st as any).linkedinNote || ''}
                          onChange={(e) => {
                            const updated = [...steps];
                            (updated[i] as any).linkedinNote = e.target.value;
                            setSteps(updated);
                          }}
                          rows={2}
                          placeholder="Hi {{firstName}}, noticed your expansion at {{company}}..."
                          className="border-indigo-900/60 bg-slate-900 text-slate-200 text-xs"
                        />
                      </div>
                    ) : stepChannel === 'linkedin_message' ? (
                      <div className="space-y-1.5">
                        <span className="text-[11px] text-slate-400">LinkedIn InMail / Direct Message Body</span>
                        <Textarea
                          value={st.bodyHook || ''}
                          onChange={(e) => {
                            const updated = [...steps];
                            updated[i].bodyHook = e.target.value;
                            setSteps(updated);
                          }}
                          rows={2}
                          placeholder="Direct message sent to 1st degree connection..."
                          className="border-indigo-900/60 bg-slate-900 text-slate-200 text-xs"
                        />
                      </div>
                    ) : (
                      <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
                        <span>👁️ AI SDR visits prospect's LinkedIn profile 24h prior to connection request to trigger a notification and increase connect rate by ~38%.</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-3 border-t border-slate-800 pt-4">
          <Button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-900/30"
          >
            {loading ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Creating Campaign...
              </>
            ) : (
              <>
                <Zap className="mr-1.5 h-4 w-4" /> Save & Launch Campaign
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
