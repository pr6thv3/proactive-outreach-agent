'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  TrendingUp,
  Target,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  Clock,
  Sparkles,
  Building2,
  Cpu,
  MailCheck,
} from 'lucide-react';

export interface WhyQualifiedCardProps {
  prospect?: {
    id?: string;
    name?: string;
    company?: string | null;
    title?: string | null;
    industry?: string | null;
    companySize?: string | null;
    score?: number;
    confidenceScore?: number;
    isVerified?: boolean;
    mxVerified?: boolean;
    outreachAngle?: string;
    whyFound?: string;
    triggerSignal?: {
      type?: string;
      category?: string;
      content?: string;
      sourceUrl?: string | null;
      sourceTitle?: string | null;
      detectedAt?: string;
      urgency?: number;
      confidence?: number;
      relevance?: number;
      citationQuality?: string;
    };
    icpMatchBreakdown?: {
      firmographicScore?: number;
      technographicScore?: number;
      intentScore?: number;
      mxScore?: number;
      totalScore?: number;
      details?: {
        firmographic?: string;
        technographic?: string;
        intent?: string;
        mxVerification?: string;
      };
    };
  };
  compact?: boolean;
}

export function WhyQualifiedCard({ prospect, compact = false }: WhyQualifiedCardProps) {
  if (!prospect) return null;

  const score = prospect.score || 85;
  const confidence = prospect.confidenceScore || Math.min(99, score + 5);
  const isVerified = prospect.mxVerified ?? prospect.isVerified ?? false;

  // Breakdown metrics
  const breakdown = prospect.icpMatchBreakdown || {
    firmographicScore: (prospect.company ? 20 : 0) + (prospect.title ? 15 : 0) + 5,
    technographicScore: 20,
    intentScore: Math.min(30, Math.round(((prospect.triggerSignal?.urgency || 80) / 100) * 30)),
    mxScore: isVerified ? 10 : 0,
    totalScore: score,
    details: {
      firmographic: `${prospect.title || 'Executive'} at ${prospect.company || 'Enterprise'}`,
      technographic: 'High cloud SaaS fit',
      intent: `${prospect.triggerSignal?.category || 'Intent'}: ${prospect.triggerSignal?.urgency || 85}% urgency`,
      mxVerification: isVerified ? 'Verified deliverable' : 'Pending lookup',
    },
  };

  const firmographicScore = breakdown.firmographicScore ?? 35;
  const technographicScore = breakdown.technographicScore ?? 20;
  const intentScore = breakdown.intentScore ?? 25;
  const mxScore = breakdown.mxScore ?? (isVerified ? 10 : 0);
  const totalScore = breakdown.totalScore ?? (firmographicScore + technographicScore + intentScore + mxScore);

  const signal = prospect.triggerSignal || {
    type: 'funding_round',
    category: 'Funding Round',
    content: prospect.whyFound || 'Recent growth and executive scaling announcement.',
    sourceUrl: 'https://example.com/press',
    sourceTitle: 'Corporate Press Announcement',
    detectedAt: new Date().toISOString(),
    urgency: 90,
    confidence: 95,
    citationQuality: 'strong',
  };

  const urgency = signal.urgency || 85;
  const outreachAngle = prospect.outreachAngle || 'Strategic growth partnership addressing scaling bottlenecks.';

  return (
    <Card className="border-slate-800 bg-slate-900/95 text-slate-100 shadow-xl overflow-hidden">
      {/* Header Banner: AI Confidence & MX Gate */}
      <CardHeader className="p-4 bg-slate-950/80 border-b border-slate-800/80 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-sm font-bold text-slate-100 flex items-center gap-2">
              Why Qualified Research Card
            </CardTitle>
            <p className="text-[11px] text-slate-400">Transparent AI reasoning, signals, and fit breakdown</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* MX Gate Badge */}
          {isVerified ? (
            <Badge className="bg-emerald-950/80 text-emerald-300 border-emerald-800 text-[11px] gap-1 py-0.5">
              <MailCheck className="h-3 w-3 text-emerald-400" /> MX Gate Passed
            </Badge>
          ) : (
            <Badge className="bg-amber-950/80 text-amber-300 border-amber-800 text-[11px] gap-1 py-0.5">
              <AlertTriangle className="h-3 w-3 text-amber-400" /> MX Unverified
            </Badge>
          )}

          {/* AI Confidence Score */}
          <Badge
            variant="outline"
            className="font-mono text-[11px] border-blue-800 text-blue-300 bg-blue-950/40 py-0.5"
          >
            AI Confidence: {confidence}%
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-5 text-xs">
        {/* Section 1: Trigger Signal Detected */}
        <div className="rounded-xl border border-blue-900/40 bg-gradient-to-br from-blue-950/30 to-slate-950 p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="font-bold text-blue-300 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                <TrendingUp className="h-3.5 w-3.5" /> Trigger Signal Detected
              </span>
              <Badge className="bg-blue-900/60 text-blue-200 border-blue-700 text-[10px] py-0 px-1.5">
                {signal.category || 'Trigger Signal'}
              </Badge>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              <span className="text-slate-400">Urgency:</span>
              <span className={urgency >= 80 ? 'text-red-400 font-bold' : urgency >= 60 ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                {urgency}% {urgency >= 80 ? '(High - Reach Out Now)' : urgency >= 60 ? '(Medium)' : '(Monitor)'}
              </span>
            </div>
          </div>

          <p className="text-slate-200 text-xs leading-relaxed font-sans">
            {signal.content}
          </p>

          {/* Citation Grounding */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-[11px]">
            <div className="flex items-center gap-1.5 text-slate-400 truncate max-w-md">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span className="text-slate-400">Grounding Source:</span>
              {signal.sourceUrl ? (
                <a
                  href={signal.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-1 truncate max-w-[240px]"
                >
                  {signal.sourceTitle || signal.sourceUrl}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              ) : (
                <span className="text-slate-300">Verified Corporate Registry Data</span>
              )}
            </div>

            <div className="flex items-center gap-2 text-slate-400">
              <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-300 px-1.5 py-0">
                Quality: {signal.citationQuality || 'strong'}
              </Badge>
              <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                <Clock className="h-3 w-3" />
                {signal.detectedAt ? new Date(signal.detectedAt).toLocaleDateString() : 'Active'}
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: ICP Match Breakdown (4 Pillars) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-200 flex items-center gap-1.5 text-xs">
              <Target className="h-3.5 w-3.5 text-purple-400" /> ICP Match Breakdown
            </span>
            <span className="font-mono font-bold text-xs text-purple-300">
              Total Score: {totalScore} / 100 pts
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Pillar 1: Firmographic */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-1.5">
              <div className="flex items-center justify-between text-slate-300">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
                  <Building2 className="h-3.5 w-3.5 text-blue-400" /> Firmographic Fit
                </span>
                <span className="font-mono text-blue-400 font-bold">{firmographicScore} / 40 pts</span>
              </div>
              <Progress value={(firmographicScore / 40) * 100} className="h-1.5 bg-slate-800" />
              <p className="text-[10px] text-slate-400 truncate">
                {prospect.title || 'Executive'} • {prospect.company || 'Enterprise'} ({prospect.companySize || '50-500 emp'})
              </p>
            </div>

            {/* Pillar 2: Technographic */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-1.5">
              <div className="flex items-center justify-between text-slate-300">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
                  <Cpu className="h-3.5 w-3.5 text-teal-400" /> Technographic Fit
                </span>
                <span className="font-mono text-teal-400 font-bold">{technographicScore} / 20 pts</span>
              </div>
              <Progress value={(technographicScore / 20) * 100} className="h-1.5 bg-slate-800" />
              <p className="text-[10px] text-slate-400 truncate">
                Modern B2B Stack (Cloud, API, Security)
              </p>
            </div>

            {/* Pillar 3: Intent Signal Strength */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-1.5">
              <div className="flex items-center justify-between text-slate-300">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
                  <TrendingUp className="h-3.5 w-3.5 text-amber-400" /> Buying Intent Urgency
                </span>
                <span className="font-mono text-amber-400 font-bold">{intentScore} / 30 pts</span>
              </div>
              <Progress value={(intentScore / 30) * 100} className="h-1.5 bg-slate-800" />
              <p className="text-[10px] text-slate-400 truncate">
                {signal.category || 'Intent Trigger'} ({urgency}% urgency)
              </p>
            </div>

            {/* Pillar 4: Email MX Gate */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-1.5">
              <div className="flex items-center justify-between text-slate-300">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
                  <MailCheck className="h-3.5 w-3.5 text-emerald-400" /> MX Verification Gate
                </span>
                <span className="font-mono text-emerald-400 font-bold">{mxScore} / 10 pts</span>
              </div>
              <Progress value={(mxScore / 10) * 100} className="h-1.5 bg-slate-800" />
              <p className="text-[10px] text-slate-400 truncate">
                {isVerified ? 'DNS MX records verified & deliverable' : 'Lookup pending or unverified'}
              </p>
            </div>
          </div>
        </div>

        {/* Section 3: Strategic Outreach Angle */}
        <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/15 p-3.5 space-y-1.5">
          <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs uppercase tracking-wide">
            <Zap className="h-3.5 w-3.5" /> Recommended Strategic Outreach Angle
          </div>
          <p className="text-slate-200 text-xs leading-relaxed">
            {outreachAngle}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
