'use client';

import { useEffect } from 'react';
import { useDashboardStore } from '@/lib/store';
import { StatsCards } from '@/components/dashboard/stats-cards';
import { PipelineView } from '@/components/dashboard/pipeline-view';
import { LeadTable } from '@/components/dashboard/lead-table';
import { MessageLog } from '@/components/dashboard/message-log';
import { ApprovalQueue } from '@/components/dashboard/approval-queue';
import { ActivityTimeline } from '@/components/dashboard/activity-feed';
import { CampaignPanel } from '@/components/dashboard/campaign-panel';
import { AddLeadDialog } from '@/components/dashboard/add-lead-dialog';
import { CsvImportDialog } from '@/components/dashboard/csv-import-dialog';
import { ClassifyReplyDialog } from '@/components/dashboard/classify-reply-dialog';
import { ToastContainer } from '@/components/dashboard/toast-container';
import { SignalIntelligencePanel } from '@/components/dashboard/signal-intelligence-panel';
import { AutonomousLoopPanel } from '@/components/dashboard/autonomous-loop-panel';
import { ResultsDashboard } from '@/components/dashboard/results-dashboard';
import { DeliverabilityPanel } from '@/components/dashboard/deliverability-panel';
import { JobHealthPanel } from '@/components/dashboard/job-health-panel';
import { DemoRunPanel } from '@/components/dashboard/demo-run-panel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Database, RefreshCw, Loader2, Zap, Brain, Shield, TrendingUp, Cpu, Rocket } from 'lucide-react';

export default function Home() {
  const { stats, activeTab, pipelineRunning, autonomyRunning, setActiveTab, refreshAll, addSampleData, runAutonomousCycle, addToast } = useDashboardStore();

  useEffect(() => { refreshAll(); }, [refreshAll]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Autonomous Signal-Driven Outbound Platform</h1>
              <p className="text-[11px] text-slate-400">Signals → Emails → Replies → Meetings → Revenue</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={runAutonomousCycle}
              disabled={autonomyRunning}
              className="border-emerald-700/50 text-emerald-400 hover:bg-emerald-900/30 text-xs h-8"
            >
              {autonomyRunning ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1" />}
              Auto Cycle
            </Button>
            <Button variant="outline" size="sm" onClick={addSampleData} className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs h-8">
              <Database className="w-3.5 h-3.5 mr-1" />Sample Data
            </Button>
            <Button variant="outline" size="sm" onClick={() => { refreshAll(); addToast('Refreshed', 'info'); }} className="border-slate-700 text-slate-300 hover:bg-slate-800 h-8 w-8 p-0">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5 space-y-5">
        <StatsCards stats={stats} />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-4">
            <TabsList className="bg-slate-800/50 border border-slate-700 h-9 flex-wrap">
              <TabsTrigger value="results" className="data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400 text-xs px-3">
                <TrendingUp className="w-3 h-3 mr-1" />Results
              </TabsTrigger>
              <TabsTrigger value="deliverability" className="data-[state=active]:bg-amber-600/20 data-[state=active]:text-amber-400 text-xs px-3">
                <Shield className="w-3 h-3 mr-1" />Deliverability
              </TabsTrigger>
              <TabsTrigger value="pipeline" className="data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400 text-xs px-3">Pipeline</TabsTrigger>
              <TabsTrigger value="intelligence" className="data-[state=active]:bg-amber-600/20 data-[state=active]:text-amber-400 text-xs px-3">
                <Brain className="w-3 h-3 mr-1" />Intelligence
              </TabsTrigger>
              <TabsTrigger value="leads" className="data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400 text-xs px-3">Leads</TabsTrigger>
              <TabsTrigger value="approval" className="data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400 text-xs px-3">Approval Queue</TabsTrigger>
              <TabsTrigger value="messages" className="data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400 text-xs px-3">Messages</TabsTrigger>
              <TabsTrigger value="campaigns" className="data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400 text-xs px-3">Campaigns</TabsTrigger>
              <TabsTrigger value="autonomy" className="data-[state=active]:bg-purple-600/20 data-[state=active]:text-purple-400 text-xs px-3">
                <Zap className="w-3 h-3 mr-1" />Autonomy
              </TabsTrigger>
              <TabsTrigger value="activity" className="data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400 text-xs px-3">Activity</TabsTrigger>
              <TabsTrigger value="jobs" className="data-[state=active]:bg-cyan-600/20 data-[state=active]:text-cyan-400 text-xs px-3">
                <Cpu className="w-3 h-3 mr-1" />Job Health
              </TabsTrigger>
              <TabsTrigger value="demo" className="data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400 text-xs px-3">
                <Rocket className="w-3 h-3 mr-1" />Demo Run
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              {pipelineRunning && (
                <div className="flex items-center gap-2 text-xs text-amber-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Running...</span></div>
              )}
              {autonomyRunning && (
                <div className="flex items-center gap-2 text-xs text-purple-400"><Zap className="w-3.5 h-3.5 animate-pulse" /><span>Autonomous...</span></div>
              )}
              <AddLeadDialog />
              <CsvImportDialog />
              <ClassifyReplyDialog />
            </div>
          </div>

          <TabsContent value="results"><ResultsDashboard /></TabsContent>
          <TabsContent value="deliverability"><DeliverabilityPanel /></TabsContent>
          <TabsContent value="pipeline"><PipelineView /></TabsContent>
          <TabsContent value="intelligence"><SignalIntelligencePanel /></TabsContent>
          <TabsContent value="leads"><LeadTable /></TabsContent>
          <TabsContent value="approval"><ApprovalQueue /></TabsContent>
          <TabsContent value="messages"><MessageLog /></TabsContent>
          <TabsContent value="campaigns"><CampaignPanel /></TabsContent>
          <TabsContent value="autonomy"><AutonomousLoopPanel /></TabsContent>
          <TabsContent value="activity"><ActivityTimeline /></TabsContent>
          <TabsContent value="jobs"><JobHealthPanel /></TabsContent>
          <TabsContent value="demo"><DemoRunPanel /></TabsContent>
        </Tabs>
      </main>

      <ToastContainer />
    </div>
  );
}
