'use client';

import { useDashboardStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, Brain, Send, RotateCcw, ArrowRight, Play, Loader2 } from 'lucide-react';

const PHASES = [
  { id: 'observe', label: 'OBSERVE', color: 'emerald', agents: [{ n: 'Lead Ingestion', d: 'CSV + validation + dedup' }, { n: 'Web Scraper', d: 'Site + search + ScrapeData' }, { n: 'Signal Extractor', d: 'Pain / hiring / growth / tech' }] },
  { id: 'think', label: 'THINK', color: 'purple', agents: [{ n: 'LLM Reasoning', d: 'Full 4-email sequence' }, { n: 'Pitch Strategist', d: 'Campaign-aware angle' }, { n: 'Personalizer', d: 'Signal-driven copy' }] },
  { id: 'act', label: 'ACT', color: 'orange', agents: [{ n: 'CRM Logger', d: 'Lifecycle + Activity log' }, { n: 'Email Sender', d: 'DNC + limits + unsub' }, { n: 'Follow-up Scheduler', d: 'T+3 / T+7 / T+14' }] },
  { id: 'reeval', label: 'RE-EVAL', color: 'amber', agents: [{ n: 'Reply Classifier', d: 'Interested / Neutral / Negative / Unsub' }] },
];

const COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  emerald: { bg: 'bg-emerald-500/8', border: 'border-emerald-500/25', text: 'text-emerald-400', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  purple: { bg: 'bg-purple-500/8', border: 'border-purple-500/25', text: 'text-purple-400', badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  orange: { bg: 'bg-orange-500/8', border: 'border-orange-500/25', text: 'text-orange-400', badge: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  amber: { bg: 'bg-amber-500/8', border: 'border-amber-500/25', text: 'text-amber-400', badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
};

const ICONS: Record<string, typeof Eye> = { observe: Eye, think: Brain, act: Send, reeval: RotateCcw };

export function PipelineView() {
  const { leads, campaigns, pipelineRunning, pipelinePhase, runFullPipeline, runObserve, runThink } = useDashboardStore();
  const canRun = leads.length > 0 && !pipelineRunning;
  const firstLead = leads[0];
  const firstCampaign = campaigns[0];

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-slate-900/50 border-slate-700/50">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-medium text-white">Pipeline Actions</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {canRun ? `Ready for: ${firstLead?.name}` : 'Add leads to start'}
              {firstCampaign ? ` | Campaign: ${firstCampaign.name}` : ' | No campaign yet'}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" disabled={!canRun || !firstLead} onClick={() => firstLead && runObserve(firstLead.id)} className="border-emerald-600/40 text-emerald-400 hover:bg-emerald-500/10 h-8 text-xs"><Eye className="w-3.5 h-3.5 mr-1" />Observe</Button>
            <Button size="sm" variant="outline" disabled={!canRun || !firstLead} onClick={() => firstLead && runThink(firstLead.id, firstCampaign?.id)} className="border-purple-600/40 text-purple-400 hover:bg-purple-500/10 h-8 text-xs"><Brain className="w-3.5 h-3.5 mr-1" />Think</Button>
            <Button size="sm" disabled={!canRun || !firstLead} onClick={() => firstLead && runFullPipeline(firstLead.id, firstCampaign?.id)} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs">
              {pipelineRunning ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />}Full Pipeline
            </Button>
            {leads.length > 1 && (
              <Button size="sm" variant="outline" disabled={!canRun} onClick={() => useDashboardStore.getState().batchGenerate(leads.slice(0, 5).map(l => l.id), firstCampaign?.id)} className="border-slate-600 text-slate-300 hover:bg-slate-700 h-8 text-xs">Batch (5)</Button>
            )}
          </div>
        </div>
      </Card>

      <div className="flex flex-col lg:flex-row gap-3 items-stretch">
        {PHASES.map((phase, idx) => {
          const c = COLORS[phase.color];
          const Icon = ICONS[phase.id];
          const active = pipelinePhase === phase.id;
          return (
            <div key={phase.id} className="flex-1 flex items-stretch gap-3">
              <Card className={`flex-1 p-3 ${c.bg} ${c.border} border shadow-lg transition-all ${active ? 'ring-2 ring-offset-2 ring-offset-slate-900 shadow-xl' : ''}`}>
                <div className="flex items-center gap-2 mb-2.5">
                  <div className={`w-7 h-7 rounded-lg ${c.badge} border flex items-center justify-center`}><Icon className={`w-3.5 h-3.5 ${c.text}`} /></div>
                  <div>
                    <h3 className={`text-xs font-bold ${c.text}`}>{phase.label}</h3>
                    {active && <div className="flex items-center gap-1 mt-0.5"><Loader2 className="w-2.5 h-2.5 animate-spin text-amber-400" /><span className="text-[10px] text-amber-400">Running</span></div>}
                  </div>
                </div>
                <div className="space-y-1.5">
                  {phase.agents.map(a => (
                    <div key={a.n} className={`rounded-md p-2 border ${c.border} ${c.bg} hover:bg-slate-800/50 transition-colors`}>
                      <div className="text-[11px] font-medium text-white">{a.n}</div>
                      <div className="text-[9px] text-slate-400 mt-0.5">{a.d}</div>
                    </div>
                  ))}
                </div>
              </Card>
              {idx < PHASES.length - 1 && <div className="flex items-center justify-center"><ArrowRight className="w-4 h-4 text-slate-600 hidden lg:block" /></div>}
            </div>
          );
        })}
      </div>

      <Card className="p-2.5 bg-slate-900/30 border-slate-800/50">
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <span>Retry: 3x with exponential backoff (1s → 30s)</span>
          <Badge variant="outline" className="text-[9px] h-4 border-slate-700 text-slate-500">Approval required before send</Badge>
          <Badge variant="outline" className="text-[9px] h-4 border-slate-700 text-slate-500">DNC + blacklist safety</Badge>
        </div>
      </Card>
    </div>
  );
}
