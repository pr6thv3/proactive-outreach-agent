'use client';

import { useDashboardStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Zap, RefreshCw, ArrowRight, Brain, Search, Sparkles, Send, MessageSquare, TrendingUp, Loader2, ShieldCheck, ShieldAlert, AlertTriangle } from 'lucide-react';
import { useState, useEffect } from 'react';

export function AutonomousLoopPanel() {
  const { stats, leads, autonomyRunning, runAutonomousCycle, enableAutonomy, addToast, runFullPipeline } = useDashboardStore();

  const [showDetailedHealth, setShowDetailedHealth] = useState(false);
  const [detailedHealth, setDetailedHealth] = useState<any>(null);
  const [loadingDetailedHealth, setLoadingDetailedHealth] = useState(false);

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

  const fetchDetailedHealth = async () => {
    setLoadingDetailedHealth(true);
    try {
      const res = await fetch('/api/jobs/health');
      if (res.ok) {
        const data = await res.json();
        setDetailedHealth(data.data);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingDetailedHealth(false);
    }
  };

  useEffect(() => {
    if (showDetailedHealth) {
      fetchDetailedHealth();
    }
  }, [showDetailedHealth]);

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
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-cyan-400" />
            <CardTitle className="text-sm text-white">Job Queue</CardTitle>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-cyan-400 hover:text-white"
            onClick={() => setShowDetailedHealth(!showDetailedHealth)}
          >
            {showDetailedHealth ? 'Hide Health Details' : 'View Job Health Details'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-5 gap-3">
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

          {Object.keys(queueStats.byType || {}).length > 0 && !showDetailedHealth && (
            <div className="space-y-1.5 pt-2">
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

          {/* Detailed Job Health Panel */}
          {showDetailedHealth && (
            <div className="mt-3 border-t border-slate-800 pt-3 space-y-3">
              {loadingDetailedHealth ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                </div>
              ) : detailedHealth ? (
                <div className="space-y-3 font-sans text-xs">
                  {/* Redis connectivity status */}
                  <div className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800/80">
                    <div className="flex items-center gap-2">
                      {detailedHealth.redis.connected ? (
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <ShieldAlert className="w-4 h-4 text-amber-400" />
                      )}
                      <span className="font-semibold text-slate-300">Redis Broker Status</span>
                    </div>
                    <Badge className={
                      detailedHealth.redis.connected
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                        : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                    }>
                      {detailedHealth.redis.connected ? 'Connected' : detailedHealth.redis.configured ? 'Configured but offline' : 'Not Configured'}
                    </Badge>
                  </div>
                  {detailedHealth.redis.error && (
                    <div className="p-2 rounded bg-red-950/20 border border-red-500/20 text-[10px] text-red-400 font-mono">
                      Redis Error: {detailedHealth.redis.error}
                    </div>
                  )}

                  {/* Queues breakdown */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-slate-500 font-medium">Queue Statuses</span>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.values(detailedHealth.queues).map((q: any) => (
                        <div key={q.name} className="p-2 rounded bg-slate-800/30 border border-slate-700/30 flex justify-between items-center">
                          <span className="text-[10px] text-slate-300 font-medium capitalize">{String(q.name).replace(/-/g, ' ')}</span>
                          <div className="flex gap-1.5 font-mono text-[9px]">
                            {q.pending > 0 && <span className="text-amber-400">P:{q.pending}</span>}
                            {q.running > 0 && <span className="text-blue-400">R:{q.running}</span>}
                            {q.staleRunning > 0 && <span className="text-red-400 font-bold">Stale:{q.staleRunning}</span>}
                            {q.failed > 0 && <span className="text-red-300">F:{q.failed}</span>}
                            {q.dead > 0 && <span className="text-slate-500 font-bold">Dead:{q.dead}</span>}
                            {q.pending === 0 && q.running === 0 && q.failed === 0 && q.dead === 0 && <span className="text-slate-500">Idle</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recent Jobs list with trace ID */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-500 font-medium">Recent Activity Logs (Last 25 Jobs)</span>
                      <Button size="sm" variant="ghost" className="h-5 text-[9px] text-slate-400 hover:text-white px-1" onClick={fetchDetailedHealth}>
                        <RefreshCw className="w-2.5 h-2.5 mr-1" /> Reload
                      </Button>
                    </div>
                    {detailedHealth.recentJobs.length === 0 ? (
                      <p className="text-[10px] text-slate-500 italic py-2">No recent jobs recorded.</p>
                    ) : (
                      <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1">
                        {detailedHealth.recentJobs.map((job: any) => (
                          <div key={job.id} className="p-1.5 rounded bg-slate-950/60 border border-slate-800/40 text-[10px] flex items-start justify-between gap-3 font-mono">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Badge variant="outline" className={`text-[8px] h-3.5 px-1 ${
                                  job.status === 'completed' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5' :
                                  job.status === 'running' ? 'border-blue-500/30 text-blue-400 bg-blue-500/5 animate-pulse' :
                                  job.status === 'failed' ? 'border-red-500/30 text-red-400 bg-red-500/5' :
                                  job.status === 'dead' ? 'border-slate-700 text-slate-500 bg-slate-800/10' :
                                  'border-amber-500/30 text-amber-400 bg-amber-500/5'
                                }`}>
                                  {job.status}
                                </Badge>
                                <span className="font-semibold text-slate-300 capitalize">{String(job.queue).replace(/-/g, ' ')}</span>
                              </div>
                              {job.error && (
                                <div className="text-[9px] text-red-400/90 mt-1 max-w-[350px] break-all">{job.error}</div>
                              )}
                              <div className="text-[9px] text-slate-500 mt-1 flex gap-3 flex-wrap">
                                <span>Created: {new Date(job.createdAt).toLocaleTimeString()}</span>
                                {job.startedAt && <span>Started: {new Date(job.startedAt).toLocaleTimeString()}</span>}
                              </div>
                            </div>
                            <div className="text-right shrink-0 flex flex-col items-end justify-between self-stretch">
                              <span className="text-[8px] text-slate-500 select-all">Trace: {job.traceId || 'none'}</span>
                              <span className="text-[8px] text-slate-600">ID: {job.id.slice(0, 8)}...</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-slate-500">Failed to load detailed health stats.</p>
              )}
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
