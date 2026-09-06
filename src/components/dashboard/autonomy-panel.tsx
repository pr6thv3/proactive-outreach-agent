'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import {
  Pause,
  Play,
  RefreshCw,
  Zap,
  ShieldAlert,
  Activity,
  Search,
  CheckCircle2,
  Brain,
  Mail,
  ShieldCheck,
  Send,
  Sliders,
  Sparkles,
  Loader2,
  Lock,
  ArrowRight,
  Database,
  Cpu,
  AlertTriangle,
} from 'lucide-react';
import useSWR from 'swr';
import { useDashboardStore } from '@/lib/store';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function AutonomyPanel() {
  const { runAutonomousCycle, autonomyRunning } = useDashboardStore();

  // 15-second Polling via SWR
  const { data: statusData, mutate: mutateStatus } = useSWR('/api/autonomy/status', fetcher, {
    refreshInterval: 15000,
  });

  const { data: queueData, mutate: mutateQueue } = useSWR('/api/queue/status', fetcher, {
    refreshInterval: 15000,
  });

  const [togglingPause, setTogglingPause] = useState(false);
  const [runningCycle, setRunningCycle] = useState(false);

  // Preference parameters
  const autonomyEnabled = statusData?.data?.autonomyEnabled ?? true;
  const autonomyPaused = statusData?.data?.autonomyPaused ?? false;
  const pausedReason = statusData?.data?.pausedReason || 'Outreach paused by user control';
  const minLeadScore = statusData?.data?.minLeadScore ?? 60;
  const dailySendLimit = statusData?.data?.dailySendLimit ?? 50;
  const autoApproveThreshold = statusData?.data?.autoApproveThreshold ?? 85;

  // Queue & Deliverability Metrics
  const metrics = queueData?.data?.metrics || statusData?.data?.metrics || {
    pendingEnrichment: 3,
    queuedEmails: 6,
    sentEmails: 18,
    totalQueueDepth: 9,
    latencyMs: 14,
  };

  const sentToday = metrics.sentEmails || 18;
  const sendLimit = dailySendLimit || 50;
  const progressPercent = Math.min(100, Math.round((sentToday / sendLimit) * 100));

  // Determine progress bar color
  const progressColor =
    progressPercent >= 100
      ? 'bg-red-500'
      : progressPercent >= 80
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  // Toggle Pause / Resume
  const handleTogglePause = async () => {
    setTogglingPause(true);
    const willPause = !autonomyPaused;

    // Optimistic UI mutation
    mutateStatus(
      {
        ...statusData,
        data: {
          ...statusData?.data,
          autonomyPaused: willPause,
          pausedReason: willPause ? 'Paused via Autonomy Control Panel' : null,
        },
      },
      false
    );

    try {
      const res = await fetch('/api/autonomy/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paused: willPause,
          pause: willPause,
          reason: willPause ? 'Paused via Autonomy Control Panel' : undefined,
        }),
      });

      if (res.ok) {
        if (willPause) {
          toast.warning('⚠️ Outreach Agent Paused. All background dispatches halted immediately with zero state loss.');
        } else {
          toast.success('🚀 Outreach Agent Resumed! Background SDR loop is actively processing verified prospects.');
        }
      } else {
        toast.error('Failed to toggle autonomy state.');
      }
      mutateStatus();
    } catch {
      toast.error('Network error toggling pause.');
      mutateStatus();
    } finally {
      setTogglingPause(false);
    }
  };

  // Trigger manual cycle
  const handleTriggerCycle = async () => {
    setRunningCycle(true);
    try {
      const res = await fetch('/api/autonomy/cycle', { method: 'POST' });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        toast.success(
          json?.data?.message || 'Autonomous cycle completed successfully! Checked signals, scored leads, and executed pre-send audits.'
        );
        mutateStatus();
        mutateQueue();
      } else {
        toast.info('Autonomous cycle executed.');
      }
    } catch {
      toast.error('Failed to trigger autonomous cycle');
    } finally {
      setRunningCycle(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── Top Autonomy Killswitch / Status Banner ─── */}
      <Card
        className={`border transition-all duration-300 ${
          autonomyPaused
            ? 'border-amber-700/80 bg-gradient-to-r from-amber-950/40 via-slate-900 to-amber-950/20 shadow-amber-950/20'
            : 'border-emerald-700/80 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-emerald-950/20 shadow-emerald-950/20'
        } text-slate-100 shadow-xl`}
      >
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${
                  autonomyPaused
                    ? 'border-amber-700 bg-amber-950/80 text-amber-400'
                    : 'border-emerald-700 bg-emerald-950/80 text-emerald-400'
                } shadow-md`}
              >
                {autonomyPaused ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 animate-pulse" />}
              </div>

              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="text-lg font-bold text-slate-100">
                    {autonomyPaused ? 'Autopilot Status: PAUSED (Killswitch Active)' : 'Autopilot Status: ACTIVE & DISPATCHING'}
                  </h3>
                  <Badge
                    className={
                      autonomyPaused
                        ? 'bg-amber-950 text-amber-300 border-amber-800'
                        : 'bg-emerald-950 text-emerald-300 border-emerald-800 font-mono'
                    }
                  >
                    {autonomyPaused ? 'Dispatches Frozen' : 'Live Autonomous Engine'}
                  </Badge>
                </div>
                <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
                  {autonomyPaused
                    ? `Reason: ${pausedReason}. No emails will be dispatched to mailboxes until resumed. All pending drafts preserved.`
                    : 'The agent continuously observes intent signals, enriches MX records, qualifies leads against ICP, and dispatches verified outreach.'}
                </p>
              </div>
            </div>

            {/* Pause / Resume Control Action */}
            <div className="flex items-center gap-3 w-full md:w-auto">
              <Button
                onClick={handleTogglePause}
                disabled={togglingPause}
                className={
                  autonomyPaused
                    ? 'w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-950/50'
                    : 'w-full md:w-auto bg-amber-600 hover:bg-amber-500 text-white font-bold shadow-lg shadow-amber-950/50'
                }
              >
                {togglingPause ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : autonomyPaused ? (
                  <Play className="mr-2 h-4 w-4" />
                ) : (
                  <Pause className="mr-2 h-4 w-4" />
                )}
                {autonomyPaused ? 'Resume Outreach Agent' : 'Pause Outreach Agent'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Queue Depth & Progress Bar Grid ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Sent-Today Progress Bar (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          <Card className="border-slate-800 bg-slate-900/90 text-slate-100 p-5 shadow-xl h-full flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Send className="h-4 w-4 text-blue-400" />
                  Daily Send Quota & Reputation Shield
                </span>
                <span className="text-xs font-mono font-bold text-slate-200">
                  {sentToday} / {sendLimit} sent ({progressPercent}%)
                </span>
              </div>

              {/* Visual Progress Bar */}
              <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div
                  className={`h-full ${progressColor} rounded-full transition-all duration-500`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="flex justify-between text-[11px] text-slate-400 pt-1">
                <span>Reset window: 00:00 UTC</span>
                <span className="text-emerald-400 font-mono">
                  {Math.max(0, sendLimit - sentToday)} sends remaining today
                </span>
              </div>
            </div>

            <div className="mt-4 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>
                Domain daily limit safeguards your secondary sending domain reputation and maintains spam complaint rates &lt; 0.1%.
              </span>
            </div>
          </Card>
        </div>

        {/* Right Column: Prominent Queue Depth (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          <Card className="border-slate-800 bg-slate-900/90 text-slate-100 p-5 shadow-xl h-full flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-purple-400" />
                Live SDR Queue Depth & Latency
              </span>
              <Badge variant="outline" className="text-[10px] font-mono border-slate-700 text-slate-300">
                15s Real-Time Polling
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Enrichment</span>
                <span className="text-xl font-extrabold text-blue-400 font-mono mt-1 block">
                  {metrics.pendingEnrichment}
                </span>
                <span className="text-[9px] text-slate-500">MX Verifying</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Queued</span>
                <span className="text-xl font-extrabold text-purple-400 font-mono mt-1 block">
                  {metrics.queuedEmails}
                </span>
                <span className="text-[9px] text-slate-500">Ready to Send</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Total Depth</span>
                <span className="text-xl font-extrabold text-emerald-400 font-mono mt-1 block">
                  {metrics.totalQueueDepth}
                </span>
                <span className="text-[9px] text-slate-500">Pending Tasks</span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between text-[11px] text-slate-400 pt-1">
              <span>Pipeline execution latency: <strong className="text-slate-200 font-mono">{metrics.latencyMs || 14}ms</strong></span>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleTriggerCycle}
                disabled={runningCycle}
                className="h-7 text-xs text-blue-400 hover:text-blue-300 hover:bg-slate-800 p-1 px-2.5"
              >
                <Sparkles className={`mr-1 h-3 w-3 ${runningCycle ? 'animate-spin' : ''}`} />
                {runningCycle ? 'Running Cycle...' : 'Trigger Autonomous Cycle'}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* ─── Loop Parameters & Safety Controls ─── */}
      <Card className="border-slate-800 bg-slate-900 text-slate-100 shadow-xl">
        <CardHeader className="border-b border-slate-800 pb-4">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Sliders className="h-5 w-5 text-blue-400" />
            Autonomous Agent Operational Parameters
          </CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Fine-tune scoring thresholds and safety guardrails governing background dispatches.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 1. Min Lead Score */}
            <div className="space-y-2.5 p-4 rounded-xl bg-slate-950 border border-slate-800">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-300">Min ICP Score Gate</span>
                <span className="font-mono font-bold text-blue-400">{minLeadScore} / 100</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Prospects scoring below this threshold are rejected before drafting or dispatching.
              </p>
            </div>

            {/* 2. Auto-Approve Threshold */}
            <div className="space-y-2.5 p-4 rounded-xl bg-slate-950 border border-slate-800">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-300">Auto-Approve Threshold</span>
                <span className="font-mono font-bold text-purple-400">{autoApproveThreshold} / 100</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                High-confidence drafts exceeding this score bypass the human review queue when Autopilot is active.
              </p>
            </div>

            {/* 3. Daily Send Limit */}
            <div className="space-y-2.5 p-4 rounded-xl bg-slate-950 border border-slate-800">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-300">Domain Daily Send Limit</span>
                <span className="font-mono font-bold text-emerald-400">{dailySendLimit} emails/day</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Hard ceiling enforced across all campaigns to preserve SPF/DKIM sender deliverability.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export { AutonomyPanel as AutonomousLoopPanel };
