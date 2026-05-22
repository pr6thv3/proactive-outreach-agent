'use client';

import { useDashboardStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Zap, RefreshCw, ArrowRight, Brain, Search, Sparkles, Send, MessageSquare, TrendingUp, Loader2 } from 'lucide-react';

export function AutonomousLoopPanel() {
  const { stats, leads, autonomyRunning, runAutonomousCycle, enableAutonomy, addToast, runFullPipeline } = useDashboardStore();

  const queueStats = stats?.queue || { pending: 0, running: 0, completed: 0, failed: 0, dead: 0, byType: {} };
  const pipelineMetrics = stats?.pipelineMetrics || [];

  // Leads by priority
  const hotLeads = leads.filter(l => l.priorityTier === 'hot');
  const warmLeads = leads.filter(l => l.priorityTier === 'warm');
  const autonomyEnabledLeads = leads.filter(l => l.autonomyEnabled);

  // The Magical Loop visualization
  const loopSteps = [
    { icon: Search, label: 'Discover', desc: 'Find new leads', color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
    { icon: Sparkles, label: 'Signal', desc: 'Detect WHY NOW', color: 'text-amber-400', bgColor: 'bg-amber-500/10' },
    { icon: TrendingUp, label: 'Score', desc: 'Prioritize leads', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
    { icon: Brain, label: 'Draft', desc: 'Generate outreach', color: 'text-purple-400', bgColor: 'bg-purple-500/10' },
    { icon: Send, label: 'Send', desc: 'Deliver message', color: 'text-cyan-400', bgColor: 'bg-cyan-500/10' },
    { icon: MessageSquare, label: 'Learn', desc: 'Compound memory', color: 'text-pink-400', bgColor: 'bg-pink-500/10' },
  ];

  return (
    <div className="space-y-5">
      {/* ─── THE MAGICAL LOOP ─── */}
      <Card className="bg-gradient-to-br from-purple-950/30 via-slate-900/50 to-slate-900/50 border-purple-800/30">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-purple-400" />
            <CardTitle className="text-purple-400 text-base">The Magical Loop</CardTitle>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Lead discovered → Signal found → Pain inferred → Pitch generated → Approval → Sent → Reply classified → System learns → Future outreach improves
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-2">
            {loopSteps.map((step, i) => (
              <div key={step.label} className="flex items-center gap-2">
                <div className={`flex flex-col items-center p-3 rounded-xl ${step.bgColor} border border-slate-700/30 min-w-[100px]`}>
                  <step.icon className={`w-5 h-5 ${step.color} mb-1`} />
                  <span className={`text-xs font-medium ${step.color}`}>{step.label}</span>
                  <span className="text-[10px] text-slate-500">{step.desc}</span>
                </div>
                {i < loopSteps.length - 1 && (
                  <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                )}
              </div>
            ))}
            {/* Loop back arrow */}
            <div className="flex flex-col items-center ml-1">
              <ArrowRight className="w-4 h-4 text-purple-500 rotate-180" />
              <span className="text-[9px] text-purple-400">compound</span>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Button
              onClick={runAutonomousCycle}
              disabled={autonomyRunning}
              className="bg-purple-600 hover:bg-purple-700 text-white text-xs h-8"
            >
              {autonomyRunning ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1" />}
              Run Autonomous Cycle
            </Button>
            <span className="text-[10px] text-slate-500">
              Runs the full loop: discover → enrich → score → draft → schedule → learn
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ─── Lead Priority Distribution ─── */}
      <div className="grid grid-cols-3 gap-5">
        <Card className="bg-slate-900/50 border-red-800/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-xs font-medium text-red-400">Hot Leads</span>
            </div>
            <div className="text-3xl font-bold text-white">{hotLeads.length}</div>
            <p className="text-[10px] text-slate-500 mt-1">Score 70+ — Auto-engage candidates</p>
            {hotLeads.length > 0 && (
              <div className="mt-2 space-y-1">
                {hotLeads.slice(0, 3).map(l => (
                  <div key={l.id} className="flex items-center gap-2 text-[10px]">
                    <span className="text-slate-300">{l.name}</span>
                    <span className="text-slate-500">({l.leadScore?.toFixed(0)})</span>
                    <Button variant="ghost" size="sm" className="h-4 text-[9px] px-1 text-emerald-400" onClick={() => { runFullPipeline(l.id); }}>
                      Run
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-amber-800/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-xs font-medium text-amber-400">Warm Leads</span>
            </div>
            <div className="text-3xl font-bold text-white">{warmLeads.length}</div>
            <p className="text-[10px] text-slate-500 mt-1">Score 40-69 — Monitor and enrich</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-slate-500" />
              <span className="text-xs font-medium text-slate-400">Autonomy Enabled</span>
            </div>
            <div className="text-3xl font-bold text-white">{autonomyEnabledLeads.length}</div>
            <p className="text-[10px] text-slate-500 mt-1">In the autonomous loop</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[9px] text-purple-400 mt-1 px-1"
              onClick={() => {
                if (hotLeads.length > 0) {
                  enableAutonomy(hotLeads[0].id);
                } else {
                  addToast('No leads to enable autonomy for', 'info');
                }
              }}
            >
              Enable for top lead
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ─── Job Queue ─── */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-cyan-400" />
            <CardTitle className="text-sm text-white">Job Queue</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-3 mb-4">
            <div className="text-center p-2 rounded bg-slate-800/50">
              <div className="text-lg font-bold text-amber-400">{queueStats.pending}</div>
              <div className="text-[10px] text-slate-500">Pending</div>
            </div>
            <div className="text-center p-2 rounded bg-slate-800/50">
              <div className="text-lg font-bold text-blue-400">{queueStats.running}</div>
              <div className="text-[10px] text-slate-500">Running</div>
            </div>
            <div className="text-center p-2 rounded bg-slate-800/50">
              <div className="text-lg font-bold text-emerald-400">{queueStats.completed}</div>
              <div className="text-[10px] text-slate-500">Completed</div>
            </div>
            <div className="text-center p-2 rounded bg-slate-800/50">
              <div className="text-lg font-bold text-red-400">{queueStats.failed}</div>
              <div className="text-[10px] text-slate-500">Failed</div>
            </div>
            <div className="text-center p-2 rounded bg-slate-800/50">
              <div className="text-lg font-bold text-slate-400">{queueStats.dead}</div>
              <div className="text-[10px] text-slate-500">Dead Letter</div>
            </div>
          </div>

          {Object.keys(queueStats.byType || {}).length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] text-slate-500 font-medium">Active Jobs by Type</span>
              {Object.entries(queueStats.byType).map(([type, count]) => (
                <div key={type} className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 min-w-[140px]">{type.replace(/_/g, ' ')}</span>
                  <Progress value={Math.min(100, (count as number) * 10)} className="h-1.5 flex-1" />
                  <span className="text-[10px] text-slate-500 font-mono">{count as number}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Pipeline Metrics ─── */}
      {pipelineMetrics.length > 0 && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-white">Pipeline Performance (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pipelineMetrics.map((m, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded bg-slate-800/30 border border-slate-700/30">
                  <Badge className="text-[10px] bg-slate-700/50 text-slate-300">{String(m.phase)}</Badge>
                  <span className="text-xs text-slate-400 min-w-[120px]">{String(m.agentName)}</span>
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-[10px] text-slate-500">Success:</span>
                    <Progress value={(m.successRate as number) * 100} className="h-1.5 flex-1" />
                    <span className="text-[10px] text-emerald-400 font-mono">{((m.successRate as number) * 100).toFixed(0)}%</span>
                  </div>
                  <span className="text-[10px] text-slate-500">Avg: {(m.avgDurationMs as number)?.toFixed(0) || 0}ms</span>
                  <span className="text-[10px] text-slate-500">Runs: {String(m.totalRuns)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
