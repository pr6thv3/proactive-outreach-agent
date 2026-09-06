'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Building2, Cpu, TrendingUp, MailCheck, ShieldCheck } from 'lucide-react';

export interface LeadScoreBreakdownProps {
  score: number;
  company?: string | null;
  title?: string | null;
  emailVerified?: boolean;
  signalCount?: number;
  breakdown?: {
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
}

export function LeadScoreBreakdown({
  score,
  company,
  title,
  emailVerified = false,
  signalCount = 0,
  breakdown,
}: LeadScoreBreakdownProps) {
  // Score formula breakdown (total max 100):
  // Firmographics: 40 pts max
  // Technographics: 20 pts max
  // Signal Strength & Intent: 30 pts max
  // Email MX Verification: 10 pts max

  const firmographicScore = breakdown?.firmographicScore ?? ((company ? 25 : 0) + (title ? 15 : 0));
  const technographicScore = breakdown?.technographicScore ?? 20;
  const signalScore = breakdown?.intentScore ?? Math.min(30, Math.max(10, Math.round((signalCount || 1) * 15)));
  const verificationScore = breakdown?.mxScore ?? (emailVerified ? 10 : 0);
  const displayScore = breakdown?.totalScore ?? Math.min(100, Math.max(0, firmographicScore + technographicScore + signalScore + verificationScore));

  const priorityTier = displayScore >= 80 ? 'HOT' : displayScore >= 60 ? 'WARM' : 'COLD';

  return (
    <Card className="border-slate-800 bg-slate-900 text-slate-100 shadow-xl">
      <CardHeader className="pb-3 border-b border-slate-800/80">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-400" />
              ICP Match & Lead Score Breakdown
            </CardTitle>
            <p className="text-xs text-slate-400 mt-0.5">Multi-pillar deterministic qualification algorithm</p>
          </div>
          <Badge
            className={
              displayScore >= 80
                ? 'bg-emerald-950 text-emerald-400 border-emerald-800 font-mono text-xs'
                : displayScore >= 60
                ? 'bg-amber-950 text-amber-400 border-amber-800 font-mono text-xs'
                : 'bg-slate-800 text-slate-400 border-slate-700 font-mono text-xs'
            }
          >
            {displayScore} / 100 ({priorityTier})
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {/* Factor 1: Firmographics */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-slate-300">
            <span className="flex items-center gap-1.5 text-slate-200">
              <Building2 className="h-3.5 w-3.5 text-blue-400" />
              Firmographic Match (Title & Company)
            </span>
            <span className="font-mono text-blue-400 font-bold">{firmographicScore} / 40 pts</span>
          </div>
          <Progress value={(firmographicScore / 40) * 100} className="h-2 bg-slate-800" />
          {breakdown?.details?.firmographic && (
            <p className="text-[10px] text-slate-400">{breakdown.details.firmographic}</p>
          )}
        </div>

        {/* Factor 2: Technographics */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-slate-300">
            <span className="flex items-center gap-1.5 text-slate-200">
              <Cpu className="h-3.5 w-3.5 text-teal-400" />
              Technographic Fit (Tech Stack Alignment)
            </span>
            <span className="font-mono text-teal-400 font-bold">{technographicScore} / 20 pts</span>
          </div>
          <Progress value={(technographicScore / 20) * 100} className="h-2 bg-slate-800" />
          {breakdown?.details?.technographic && (
            <p className="text-[10px] text-slate-400">{breakdown.details.technographic}</p>
          )}
        </div>

        {/* Factor 3: Signal Strength */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-slate-300">
            <span className="flex items-center gap-1.5 text-slate-200">
              <TrendingUp className="h-3.5 w-3.5 text-amber-400" />
              Buying Intent Signal & Urgency
            </span>
            <span className="font-mono text-amber-400 font-bold">{signalScore} / 30 pts</span>
          </div>
          <Progress value={(signalScore / 30) * 100} className="h-2 bg-slate-800" />
          {breakdown?.details?.intent && (
            <p className="text-[10px] text-slate-400">{breakdown.details.intent}</p>
          )}
        </div>

        {/* Factor 4: Verification Status */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-slate-300">
            <span className="flex items-center gap-1.5 text-slate-200">
              <MailCheck className="h-3.5 w-3.5 text-emerald-400" />
              Email MX Verification Gate
            </span>
            <span className="font-mono text-emerald-400 font-bold">{verificationScore} / 10 pts</span>
          </div>
          <Progress value={(verificationScore / 10) * 100} className="h-2 bg-slate-800" />
          {breakdown?.details?.mxVerification && (
            <p className="text-[10px] text-slate-400">{breakdown.details.mxVerification}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
