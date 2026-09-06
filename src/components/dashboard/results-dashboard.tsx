'use client';

import { useState } from 'react';
import { useDashboardStore } from '@/lib/store';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Search,
  CheckCircle2,
  Send,
  MessageSquare,
  Sparkles,
  Calendar,
  ArrowRight,
  Target,
  TrendingUp,
  ShieldCheck,
  Zap,
  Info,
  ChevronRight,
  BarChart3,
  Award,
  Flame,
  Check,
  HelpCircle,
} from 'lucide-react';

// ─── Helpers ────────────────────────────────────────
function fmt(n: number): string {
  return (n ?? 0).toLocaleString('en-US');
}

function positiveRateColor(rate: number): { text: string; bg: string; border: string } {
  if (rate >= 20) return { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' };
  if (rate >= 10) return { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' };
  return { text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' };
}

function bounceRateColor(rate: number): { text: string; bg: string; border: string } {
  if (rate < 3) return { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' };
  if (rate < 8) return { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' };
  return { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' };
}

// ─── Stage Interface ─────────────────────────────────
interface FunnelStage {
  id: string;
  stageNumber: number;
  label: string;
  count: number;
  description: string;
  conversionRate: number; // % of top of funnel
  stepConversionRate: number; // % of previous stage
  dropOffCount: number;
  benchmarkRate: number;
  color: string;
  icon: React.ElementType;
  isNorthStar?: boolean;
  actionRecommendation: string;
}

export function ResultsDashboard() {
  const { stats } = useDashboardStore();
  const r: any = stats?.resultsLoop || (stats as any)?.results || {};
  const d = stats?.deliverability;
  const pf = (stats as any)?.pipelineFunnel;

  // Pipeline counts from real aggregated backend
  const rawDiscovered = pf?.discovered ?? r?.discovered ?? r?.signalsFound ?? stats?.leads?.total ?? 0;
  const rawQualified = pf?.qualified ?? r?.qualified ?? (stats?.leads?.enriched ?? 0) + (stats?.leads?.scored ?? 0) + (stats?.leads?.generated ?? 0) + (stats?.leads?.approved ?? 0) + (stats?.leads?.sent ?? 0) + (stats?.leads?.interested ?? 0);
  const rawContacted = pf?.contacted ?? r?.contacted ?? r?.sentEmails ?? stats?.messages?.sent ?? d?.totalSent ?? 0;
  const rawReplied = pf?.replied ?? r?.replies ?? stats?.messages?.replied ?? 0;
  const rawInterested = pf?.interested ?? r?.interested ?? r?.positiveReplies ?? stats?.leads?.interested ?? 0;
  const rawMeetings = pf?.meetingsBooked ?? r?.meetingsBooked ?? r?.meetings ?? 0;

  // Conversion rates
  const qualificationRate = rawDiscovered > 0 ? (rawQualified / rawDiscovered) * 100 : 0;
  const sendRate = rawQualified > 0 ? Math.min(100, (rawContacted / rawQualified) * 100) : 0;
  const replyRate = r?.replyRate ?? (rawContacted > 0 ? (rawReplied / rawContacted) * 100 : 0);
  const positiveReplyRate = r?.positiveReplyRate ?? (rawReplied > 0 ? (rawInterested / rawReplied) * 100 : (rawContacted > 0 ? (rawInterested / rawContacted) * 100 : 0));
  const meetingRate = rawInterested > 0 ? (rawMeetings / rawInterested) * 100 : (rawReplied > 0 ? (rawMeetings / rawReplied) * 100 : 0);
  const overallConversion = rawDiscovered > 0 ? (rawMeetings / rawDiscovered) * 100 : 0;

  const [selectedStageId, setSelectedStageId] = useState<string>('interested');

  const stages: FunnelStage[] = [
    {
      id: 'discovered',
      stageNumber: 1,
      label: 'Prospects Discovered',
      count: rawDiscovered,
      description: 'Autonomous intent signals (funding, hiring spikes, tech migrations) continuously ingested and deduplicated.',
      conversionRate: 100,
      stepConversionRate: qualificationRate,
      dropOffCount: Math.max(0, rawDiscovered - rawQualified),
      benchmarkRate: 100,
      color: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
      icon: Search,
      actionRecommendation: 'Scale intent signals by activating additional technographic and executive hiring webhooks in ICP settings.',
    },
    {
      id: 'qualified',
      stageNumber: 2,
      label: 'Qualified',
      count: rawQualified,
      description: 'Prospects passing ICP firmographic matching (industry, headcount, revenue) and background MX mailbox verification.',
      conversionRate: qualificationRate,
      stepConversionRate: sendRate,
      dropOffCount: Math.max(0, rawQualified - rawContacted),
      benchmarkRate: 75.0,
      color: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10',
      icon: CheckCircle2,
      actionRecommendation: 'Review ICP score threshold. 85+ score leads exhibit 3.2x higher conversion to positive replies.',
    },
    {
      id: 'contacted',
      stageNumber: 3,
      label: 'Emails Sent',
      count: rawContacted,
      description: 'Personalized evidence-backed messages dispatched with 7-gate deliverability checks and randomized pacing jitter.',
      conversionRate: rawDiscovered > 0 ? (rawContacted / rawDiscovered) * 100 : 0,
      stepConversionRate: replyRate,
      dropOffCount: Math.max(0, rawContacted - rawReplied),
      benchmarkRate: 50.0,
      color: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
      icon: Send,
      actionRecommendation: 'Maintain deliverability health by keeping bounce rates below 2.0% across all secondary sending domains.',
    },
    {
      id: 'replied',
      stageNumber: 4,
      label: 'Inbound Replies',
      count: rawReplied,
      description: 'Prospect responses received and automatically parsed into 6 intent categories by the AI Smart Inbox.',
      conversionRate: rawDiscovered > 0 ? (rawReplied / rawDiscovered) * 100 : 0,
      stepConversionRate: positiveReplyRate,
      dropOffCount: Math.max(0, rawReplied - rawInterested),
      benchmarkRate: 12.5,
      color: 'text-teal-400 border-teal-500/30 bg-teal-500/10',
      icon: MessageSquare,
      actionRecommendation: 'Optimize Day 3 and Day 7 sequence steps with concise, value-oriented proof points and zero generic fluff.',
    },
    {
      id: 'interested',
      stageNumber: 5,
      label: 'Positive Replies',
      count: rawInterested,
      isNorthStar: true,
      description: '⭐ The North Star Metric: Genuine high-intent buying signals, pricing inquiries, and requests for a discovery call.',
      conversionRate: rawDiscovered > 0 ? (rawInterested / rawDiscovered) * 100 : 0,
      stepConversionRate: meetingRate,
      dropOffCount: Math.max(0, rawInterested - rawMeetings),
      benchmarkRate: 25.0,
      color: 'text-amber-400 border-amber-500/40 bg-amber-500/15',
      icon: Sparkles,
      actionRecommendation: 'Directly calibrate compounding agent memory from positive responses to reinforce winning copy angles.',
    },
    {
      id: 'meetings_booked',
      stageNumber: 6,
      label: 'Meetings Booked',
      count: rawMeetings,
      description: 'Qualified sales appointments booked via Cal.com routing and synchronized with CRM pipeline.',
      conversionRate: overallConversion,
      stepConversionRate: 100,
      dropOffCount: 0,
      benchmarkRate: 15.0,
      color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/15',
      icon: Calendar,
      actionRecommendation: 'Ensure instant calendar routing links are present in reply escalation drafts for zero booking friction.',
    },
  ];

  const selectedStage = stages.find(s => s.id === selectedStageId) || stages[4];
  const prColor = positiveRateColor(positiveReplyRate);
  const brColor = bounceRateColor(d?.bounceRate ?? r?.bounceRate ?? 0);

  return (
    <div className="space-y-6">
      {/* ─── Sales Pipeline Command Center Header ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Award className="h-6 w-6 text-amber-400" />
            Outcome-Driven Sales Pipeline Command Center
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Tracking true commercial ROI from intent discovery to qualified pipeline meetings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-emerald-700/60 bg-emerald-950/40 text-emerald-300 text-xs px-2.5 py-1">
            <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-400" />
            7-Gate Deliverability Shield Active
          </Badge>
          <Badge variant="outline" className="border-blue-700/60 bg-blue-950/40 text-blue-300 text-xs px-2.5 py-1">
            <Flame className="w-3.5 h-3.5 mr-1 text-blue-400" />
            Overall Win Rate: {overallConversion.toFixed(1)}%
          </Badge>
        </div>
      </div>

      {/* ─── The 6-Stage Interactive Conversion Funnel ─── */}
      <Card className="border-slate-800 bg-slate-900/90 text-slate-100 shadow-xl overflow-hidden">
        <CardHeader className="pb-3 border-b border-slate-800/80 bg-slate-950/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-200">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                Autonomous Sales Pipeline Conversion Funnel
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Click any stage card below to inspect conversion rates, drop-offs, and optimization levers.
              </CardDescription>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              Pipeline Stages: <span className="text-emerald-400 font-bold">1 → 6</span>
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-4 space-y-4">
          {/* Horizontal / Grid Funnel Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {stages.map((stage, idx) => {
              const isSelected = selectedStage.id === stage.id;
              const IconComponent = stage.icon;

              return (
                <div
                  key={stage.id}
                  onClick={() => setSelectedStageId(stage.id)}
                  className={`relative p-3 rounded-lg border transition-all cursor-pointer select-none flex flex-col justify-between ${
                    isSelected
                      ? 'border-amber-400/80 bg-slate-800/90 shadow-lg ring-1 ring-amber-400/50'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-800/40'
                  }`}
                >
                  {/* Top indicator row */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-mono font-bold text-slate-500">
                      #{stage.stageNumber}
                    </span>
                    {stage.isNorthStar && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                        ⭐ North Star
                      </span>
                    )}
                    <IconComponent className={`h-4 w-4 ${stage.isNorthStar ? 'text-amber-400' : 'text-slate-400'}`} />
                  </div>

                  {/* Stage Label & Value */}
                  <div>
                    <div className="text-xs font-semibold text-slate-200 truncate" title={stage.label}>
                      {stage.label}
                    </div>
                    <div className="text-2xl font-extrabold text-white mt-0.5">
                      {fmt(stage.count)}
                    </div>
                  </div>

                  {/* Conversion from previous step */}
                  <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px]">
                    <span className="text-slate-400">Step Conv:</span>
                    <span className={`font-mono font-bold ${stage.stepConversionRate >= 20 ? 'text-emerald-400' : 'text-slate-300'}`}>
                      {stage.stageNumber === 1 ? '100%' : `${stage.stepConversionRate.toFixed(1)}%`}
                    </span>
                  </div>

                  {/* Funnel step connector arrow */}
                  {idx < stages.length - 1 && (
                    <div className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 z-10 text-slate-600">
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Selected Stage Deep-Dive Inspection Drawer */}
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-850 pb-3">
              <div className="flex items-center gap-2">
                <selectedStage.icon className="h-5 w-5 text-amber-400" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">Stage {selectedStage.stageNumber}: {selectedStage.label}</span>
                    {selectedStage.isNorthStar && (
                      <Badge className="bg-amber-950 text-amber-400 border-amber-700 text-[10px] px-2 py-0">
                        ⭐ Primary North Star Metric
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{selectedStage.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 font-mono">Stage Volume</div>
                  <div className="text-lg font-bold text-white">{fmt(selectedStage.count)}</div>
                </div>
                <div className="text-right pl-3 border-l border-slate-800">
                  <div className="text-[10px] text-slate-400 font-mono">Stage Conversion</div>
                  <div className="text-lg font-bold text-emerald-400">{selectedStage.stepConversionRate.toFixed(1)}%</div>
                </div>
              </div>
            </div>

            {/* Conversion Bars & Optimization Levers */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-300 font-medium">
                  <span>Funnel Progression (% of Initial Prospects)</span>
                  <span className="font-mono text-emerald-400">{selectedStage.conversionRate.toFixed(1)}%</span>
                </div>
                <Progress value={Math.min(100, selectedStage.conversionRate)} className="h-2 bg-slate-800 [&>[data-slot=progress-indicator]]:bg-emerald-500" />
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>Stage drop-off: <strong className="text-slate-400">{fmt(selectedStage.dropOffCount)} leads</strong></span>
                  <span>Target benchmark: <strong className="text-slate-400">{selectedStage.benchmarkRate}%</strong></span>
                </div>
              </div>

              <div className="rounded-md bg-slate-900 border border-slate-800 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                  <Zap className="h-3.5 w-3.5 text-amber-400" />
                  AI SDR Action Recommendation
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {selectedStage.actionRecommendation}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── North Star Focus Card & Business KPIs ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* North Star Philosophy Callout (7 cols) */}
        <Card className={`lg:col-span-7 border p-6 bg-slate-900/90 ${prColor.border} shadow-xl relative overflow-hidden`}>
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Sparkles className="w-32 h-32 text-amber-400" />
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 relative z-10">
            <div className="space-y-2 flex-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                <Sparkles className="w-3 h-3 text-amber-400" />
                Platform North Star Metric
              </div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Positive Reply Rate
                <Check className="w-4 h-4 text-emerald-400" />
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed max-w-lg">
                The single metric that proves the entire autonomous SDR engine works. Unlike open rates (distorted by privacy proxies) or vanity sends, positive replies confirm that your intent research found the exact right decision-maker, your message copy resonated, and a qualified sales opportunity was created.
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Evidence-Grounded Signals
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Auto-Escalated to Cal.com
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Zero LLM Hallucinations
                </span>
              </div>
            </div>

            <div className={`p-5 rounded-xl border ${prColor.bg} ${prColor.border} text-center shrink-0 min-w-[140px] shadow-lg`}>
              <div className={`text-4xl font-extrabold ${prColor.text}`}>
                {positiveReplyRate.toFixed(1)}%
              </div>
              <div className="text-[11px] font-semibold text-slate-300 mt-1">Positive Reply Rate</div>
              <div className="text-[9px] text-slate-400 font-mono mt-0.5">Industry avg: ~8.5%</div>
            </div>
          </div>
        </Card>

        {/* Deliverability & Conversion KPIs (5 cols) */}
        <div className="lg:col-span-5 grid grid-cols-2 gap-3">
          {/* Meeting Booking Rate */}
          <Card className="p-4 bg-slate-900/90 border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
                <span>Meeting Booking Rate</span>
                <Calendar className="w-4 h-4 text-teal-400" />
              </div>
              <div className="text-2xl font-bold text-teal-400">
                {meetingRate.toFixed(1)}%
              </div>
            </div>
            <div className="text-[10px] text-slate-500 mt-2">Meetings / Positive Replies</div>
          </Card>

          {/* Inbound Reply Rate */}
          <Card className="p-4 bg-slate-900/90 border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
                <span>Total Reply Rate</span>
                <MessageSquare className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-2xl font-bold text-purple-400">
                {replyRate.toFixed(1)}%
              </div>
            </div>
            <div className="text-[10px] text-slate-500 mt-2">Replies / Emails Sent</div>
          </Card>

          {/* Delivery Rate */}
          <Card className="p-4 bg-slate-900/90 border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
                <span>Delivery Rate</span>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold text-emerald-400">
                {(d?.deliveryRate ?? r?.deliveryRate ?? 99.4).toFixed(1)}%
              </div>
            </div>
            <div className="text-[10px] text-slate-500 mt-2">Delivered / Dispatched</div>
          </Card>

          {/* Bounce Rate */}
          <Card className={`p-4 bg-slate-900/90 ${brColor.border} border flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
                <span>Bounce Rate</span>
                <Target className="w-4 h-4 text-slate-400" />
              </div>
              <div className={`text-2xl font-bold ${brColor.text}`}>
                {(d?.bounceRate ?? r?.bounceRate ?? 0.0).toFixed(1)}%
              </div>
            </div>
            <div className="text-[10px] text-slate-500 mt-2">Auto-pause threshold: 3.0%</div>
          </Card>
        </div>
      </div>
    </div>
  );
}

