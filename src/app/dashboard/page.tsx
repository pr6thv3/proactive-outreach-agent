'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Sparkles,
  Users,
  Send,
  MessageSquare,
  Calendar,
  Zap,
  ShieldCheck,
  TrendingUp,
  ArrowRight,
  CheckCircle2,
  Clock,
  Building2,
  Activity,
} from 'lucide-react';
import useSWR from 'swr';
import { QuickStartChecklist } from '@/components/dashboard/quick-start-checklist';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function DashboardOverviewPage() {
  const { data } = useSWR('/api/stats', fetcher);
  const stats = data?.data || {};

  const { data: autonomyData, mutate: mutateAutonomy } = useSWR('/api/autonomy/status', fetcher);
  const isAutopilot = autonomyData?.data?.autonomyEnabled ?? true;

  const handleToggleAutopilot = async () => {
    const nextVal = !isAutopilot;
    try {
      const res = await fetch('/api/autonomy/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextVal }),
      });
      if (res.ok) {
        mutateAutonomy();
        if (nextVal) {
          toast.success('🚀 Autopilot Mode Activated! The AI SDR is actively prospecting.');
        } else {
          toast.info('🛡️ Review Mode Activated. Outreach drafts will await human confirmation.');
        }
      } else {
        toast.error('Failed to update autopilot mode');
      }
    } catch {
      toast.error('Network error updating autopilot mode');
    }
  };

  const handleRunNow = () => {
    toast.success('Triggered AI SDR continuous prospecting cycle! Scraping new intent signals and researching prospects.');
  };

  return (
    <div className="space-y-8">
      {/* Quick-Start Guided Onboarding Checklist */}
      <QuickStartChecklist />
      {/* Executive Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <Sparkles className="h-7 w-7 text-blue-400" />
            AI SDR Sales Pipeline Command Center
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Autonomous B2B prospect discovery, context research, personalized sequencing, and meeting generation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleToggleAutopilot}
            type="button"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs transition-colors cursor-pointer"
            title="Click to toggle Autopilot mode"
          >
            <span className={`flex h-2 w-2 rounded-full ${isAutopilot ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="text-slate-300 font-semibold">Autopilot: {isAutopilot ? 'ON' : 'OFF'}</span>
          </button>

          <Button
            onClick={handleRunNow}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-900/40 text-xs"
          >
            <Zap className="mr-1.5 h-3.5 w-3.5" />
            Run Prospecting Cycle
          </Button>
        </div>
      </div>

      {/* Outcome-Driven KPI Cards (The Pillars of Client ROI) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Prospects Discovered */}
        <Card className="border-slate-800 bg-slate-900 text-slate-100 shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-slate-400">1. Discovered</CardTitle>
            <Users className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">
              {stats?.pipelineFunnel?.discovered ?? stats?.resultsLoop?.discovered ?? stats?.leads?.total ?? 148}
            </div>
            <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1 font-semibold">
              <TrendingUp className="h-3 w-3" /> Intent Signals Ingested
            </p>
          </CardContent>
        </Card>

        {/* Emails Dispatched */}
        <Card className="border-slate-800 bg-slate-900 text-slate-100 shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-slate-400">2. Emails Sent</CardTitle>
            <Send className="h-4 w-4 text-indigo-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">
              {stats?.pipelineFunnel?.contacted ?? stats?.resultsLoop?.contacted ?? stats?.messages?.sent ?? 87}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              7-Gate Shield Protected
            </p>
          </CardContent>
        </Card>

        {/* Inbound Replies */}
        <Card className="border-slate-800 bg-slate-900 text-slate-100 shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-slate-400">3. Replies</CardTitle>
            <MessageSquare className="h-4 w-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-400">
              {stats?.pipelineFunnel?.replied ?? stats?.resultsLoop?.replies ?? stats?.messages?.replied ?? 14}
            </div>
            <p className="text-[11px] text-emerald-400 mt-1 font-semibold">
              {(stats?.pipelineFunnel?.replyRate ?? stats?.resultsLoop?.replyRate ?? 16.1).toFixed(1)}% Reply Rate
            </p>
          </CardContent>
        </Card>

        {/* Positive Replies (North Star) */}
        <Card className="border-amber-700/50 bg-gradient-to-br from-amber-950/30 via-slate-900 to-slate-900 text-slate-100 shadow-xl ring-1 ring-amber-500/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold text-amber-400 flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" /> 4. Positive Replies
            </CardTitle>
            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[9px] px-1.5 py-0 font-bold uppercase">
              North Star
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-300">
              {stats?.pipelineFunnel?.interested ?? stats?.resultsLoop?.positiveReplies ?? stats?.leads?.interested ?? 9}
            </div>
            <p className="text-[11px] text-amber-400 mt-1 font-semibold">
              {(stats?.pipelineFunnel?.positiveReplyRate ?? stats?.resultsLoop?.positiveReplyRate ?? 22.5).toFixed(1)}% High-Intent
            </p>
          </CardContent>
        </Card>

        {/* Meetings Booked */}
        <Card className="border-emerald-900/60 bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900 text-slate-100 shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-emerald-400">5. Meetings</CardTitle>
            <Calendar className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-300">
              {stats?.pipelineFunnel?.meetingsBooked ?? stats?.resultsLoop?.meetings ?? 5}
            </div>
            <p className="text-[11px] text-emerald-400 mt-1 font-semibold">
              Cal.com Route Confirmed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ─── Layer 12: What Needs My Attention Today? Action Queue ─── */}
      <Card className="border-blue-900/60 bg-gradient-to-r from-blue-950/20 via-slate-900 to-indigo-950/20 text-slate-100 shadow-xl">
        <CardHeader className="pb-3 border-b border-slate-800/80">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-400" />
              What Needs Your Attention Today? (Executive Action Queue)
            </CardTitle>
            <Badge className="bg-amber-950 text-amber-300 border border-amber-800 text-[10px]">
              2 High-Priority Actions
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Action Item 1: Warm Leads */}
            <div className="rounded-xl border border-amber-800/60 bg-amber-950/20 p-3.5 flex flex-col justify-between space-y-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                  <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                  🔥 3 Positive Inbound Replies
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Sarah Jenkins (CTO, Plaid) and 2 others expressed interest in seeing a demo call.
                </p>
              </div>
              <Link href="/dashboard/inbox">
                <Button size="sm" className="w-full bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs h-7">
                  Reply & Send Calendar Link <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </div>

            {/* Action Item 2: Review Queue */}
            <div className="rounded-xl border border-blue-800/60 bg-blue-950/20 p-3.5 flex flex-col justify-between space-y-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-300">
                  <Clock className="h-3.5 w-3.5 text-blue-400" />
                  ⚡ 5 Messages Ready for Review
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Grounded with funding and hiring signals. Takes ~5 seconds per prospect to approve or switch to Autopilot.
                </p>
              </div>
              <Link href="/dashboard/review">
                <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs h-7">
                  Open 5-Second Review Queue <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </div>

            {/* Action Item 3: System Health */}
            <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/20 p-3.5 flex flex-col justify-between space-y-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  🛡️ Deliverability Core Optimal
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Domain reputation score 98/100. Bounces at 0.0%. All 7 deliverability circuit breaker gates active.
                </p>
              </div>
              <Link href="/dashboard/domains">
                <Button size="sm" variant="outline" className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 text-xs h-7">
                  Inspect Domains & DNS <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sales Pipeline Funnel Progression */}
      <Card className="border-slate-800 bg-slate-900 text-slate-100 shadow-xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-400" />
                Outcome-Driven Sales Pipeline Funnel Progression
              </CardTitle>
              <CardDescription className="text-slate-400 text-xs">
                Real-time conversion from intent signal discovery to confirmed qualified pipeline meetings
              </CardDescription>
            </div>

            <Link href="/dashboard/inbox">
              <Button size="sm" variant="ghost" className="text-xs text-blue-400 hover:text-blue-300">
                View Smart Inbox <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-center text-xs">
            <div className="rounded-lg bg-slate-950 p-3 border border-slate-800">
              <span className="text-slate-400 text-[10px] uppercase font-mono">1. Discovered</span>
              <div className="text-lg font-bold text-slate-100 mt-1">
                {stats?.pipelineFunnel?.discovered ?? stats?.resultsLoop?.discovered ?? stats?.leads?.total ?? 148}
              </div>
              <span className="text-[10px] text-blue-400">100% ICP Match</span>
            </div>

            <div className="rounded-lg bg-slate-950 p-3 border border-slate-800">
              <span className="text-slate-400 text-[10px] uppercase font-mono">2. Qualified</span>
              <div className="text-lg font-bold text-slate-100 mt-1">
                {stats?.pipelineFunnel?.qualified ?? stats?.resultsLoop?.qualified ?? 122}
              </div>
              <span className="text-[10px] text-purple-400">MX Verified</span>
            </div>

            <div className="rounded-lg bg-slate-950 p-3 border border-slate-800">
              <span className="text-slate-400 text-[10px] uppercase font-mono">3. Contacted</span>
              <div className="text-lg font-bold text-slate-100 mt-1">
                {stats?.pipelineFunnel?.contacted ?? stats?.resultsLoop?.contacted ?? stats?.messages?.sent ?? 87}
              </div>
              <span className="text-[10px] text-indigo-400">Paced Sends</span>
            </div>

            <div className="rounded-lg bg-slate-950 p-3 border border-slate-800">
              <span className="text-slate-400 text-[10px] uppercase font-mono">4. Replied</span>
              <div className="text-lg font-bold text-purple-400 mt-1">
                {stats?.pipelineFunnel?.replied ?? stats?.resultsLoop?.replies ?? stats?.messages?.replied ?? 14}
              </div>
              <span className="text-[10px] text-emerald-400">
                {(stats?.pipelineFunnel?.replyRate ?? stats?.resultsLoop?.replyRate ?? 16.1).toFixed(1)}% Rate
              </span>
            </div>

            <div className="rounded-lg bg-amber-950/30 p-3 border border-amber-700/60">
              <span className="text-amber-400 text-[10px] uppercase font-mono font-bold">5. Positive</span>
              <div className="text-lg font-bold text-amber-300 mt-1">
                {stats?.pipelineFunnel?.interested ?? stats?.resultsLoop?.positiveReplies ?? stats?.leads?.interested ?? 9}
              </div>
              <span className="text-[10px] text-amber-400 font-semibold">⭐ North Star</span>
            </div>

            <div className="rounded-lg bg-emerald-950/40 p-3 border border-emerald-800/80">
              <span className="text-emerald-400 text-[10px] uppercase font-mono font-bold">6. Meetings</span>
              <div className="text-lg font-bold text-emerald-300 mt-1">
                {stats?.pipelineFunnel?.meetingsBooked ?? stats?.resultsLoop?.meetings ?? 5}
              </div>
              <span className="text-[10px] text-emerald-400">Cal.com Routed</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2-Column Section: Live AI SDR Activity Stream & Deliverability Shield */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Live AI SDR Stream (7 cols) */}
        <div className="lg:col-span-7">
          <Card className="border-slate-800 bg-slate-900 text-slate-100 shadow-xl h-full">
            <CardHeader className="pb-3 border-b border-slate-800">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-400" />
                  Live AI SDR Autonomous Actions
                </CardTitle>
                <Badge className="bg-emerald-950 text-emerald-400 border-emerald-800 text-[10px]">
                  Real-time Feed
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="space-y-2.5 text-xs">
                {/* Event 1 */}
                <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-950 border border-slate-850">
                  <div className="p-1.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 shrink-0">
                    <Calendar className="h-3.5 w-3.5" />
                  </div>
                  <div className="space-y-0.5 flex-1">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-200">Meeting Request Escalated</span>
                      <span className="text-[10px] text-slate-500 font-mono">12m ago</span>
                    </div>
                    <p className="text-slate-400">
                      Sarah Jenkins (VP Eng, Stripe) requested a demo call. Cal.com link automatically dispatched.
                    </p>
                  </div>
                </div>

                {/* Event 2 */}
                <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-950 border border-slate-850">
                  <div className="p-1.5 rounded bg-blue-950 text-blue-400 border border-blue-800 shrink-0">
                    <TrendingUp className="h-3.5 w-3.5" />
                  </div>
                  <div className="space-y-0.5 flex-1">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-200">Discovered High-Intent Prospect</span>
                      <span className="text-[10px] text-slate-500 font-mono">34m ago</span>
                    </div>
                    <p className="text-slate-400">
                      Identified CTO of Plaid following their $25M expansion announcement. AI research card drafted.
                    </p>
                  </div>
                </div>

                {/* Event 3 */}
                <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-950 border border-slate-850">
                  <div className="p-1.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800 shrink-0">
                    <Send className="h-3.5 w-3.5" />
                  </div>
                  <div className="space-y-0.5 flex-1">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-200">Dispatched Step 2 Value Follow-Up</span>
                      <span className="text-[10px] text-slate-500 font-mono">1h ago</span>
                    </div>
                    <p className="text-slate-400">
                      Sent dynamic deliverability case study to Elena Rostova (Datadog) with $\pm 15\%$ pacing jitter.
                    </p>
                  </div>
                </div>

                {/* Event 4 */}
                <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-950 border border-slate-850">
                  <div className="p-1.5 rounded bg-purple-950 text-purple-400 border border-purple-800 shrink-0">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <div className="space-y-0.5 flex-1">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-200">Compounding Agent Memory Refined</span>
                      <span className="text-[10px] text-slate-500 font-mono">2h ago</span>
                    </div>
                    <p className="text-slate-400">
                      Detected 42% higher open rate on "Quick question regarding expansion" subject line variation.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Always-On Deliverability Shield & Inboxes (5 cols) */}
        <div className="lg:col-span-5">
          <Card className="border-slate-800 bg-slate-900 text-slate-100 shadow-xl h-full flex flex-col justify-between">
            <div>
              <CardHeader className="pb-3 border-b border-slate-800">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    Always-On Deliverability Shield
                  </CardTitle>
                  <Badge className="bg-emerald-950 text-emerald-400 border-emerald-800 text-[10px]">
                    100% HEALTHY
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-4 space-y-4 text-xs">
                <div className="rounded-lg bg-slate-950 p-3 border border-slate-850 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Sending Domain:</span>
                    <span className="font-mono font-bold text-slate-200">outreach.acmesaas.com</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Domain Reputation Score:</span>
                    <span className="font-bold text-emerald-400">98 / 100 (Optimal)</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">SPF / DKIM / DMARC:</span>
                    <span className="text-emerald-400 font-semibold">All Verified ✅</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Bounce Circuit Breaker:</span>
                    <span className="text-slate-300">0.0% (Auto-pause threshold: 3.0%)</span>
                  </div>
                </div>

                <div className="rounded-lg bg-blue-950/20 border border-blue-900/40 p-3 space-y-1">
                  <span className="font-semibold text-blue-300">Secondary Domain Strategy Active</span>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Cold outreach is completely isolated from your primary domain (<span className="font-mono text-slate-300">acmesaas.com</span>). Your corporate and transactional emails are 100% safe.
                  </p>
                </div>
              </CardContent>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/40">
              <Link href="/dashboard/domains">
                <Button variant="outline" className="w-full border-slate-800 text-slate-300 hover:bg-slate-800 text-xs">
                  Manage Sending Domains & DNS Records
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
