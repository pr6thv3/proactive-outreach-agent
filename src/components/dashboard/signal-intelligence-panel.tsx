'use client';

import { useDashboardStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Brain, TrendingUp, AlertTriangle, Target, Sparkles, Clock, ArrowRight } from 'lucide-react';

const SIGNAL_COLORS: Record<string, string> = {
  funding_round: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  hiring_spike: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  engineering_hiring_spike: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  traffic_drop: 'bg-red-500/20 text-red-400 border-red-500/30',
  product_launch: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  rebranding: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  seo_decline: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  tech_stack_migration: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  competitor_pressure: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  ai_adoption_signal: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  pain_point: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  growth: 'bg-green-500/20 text-green-400 border-green-500/30',
  expansion: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

const SIGNAL_LABELS: Record<string, string> = {
  funding_round: 'Funding Round',
  hiring_spike: 'Hiring Spike',
  engineering_hiring_spike: 'Eng Hiring Spike',
  traffic_drop: 'Traffic Drop',
  product_launch: 'Product Launch',
  rebranding: 'Rebranding',
  seo_decline: 'SEO Decline',
  tech_stack_migration: 'Tech Migration',
  competitor_pressure: 'Competitor Pressure',
  ai_adoption_signal: 'AI Adoption',
  pain_point: 'Pain Point',
  growth: 'Growth Signal',
  expansion: 'Expansion',
  job_change: 'Job Change',
  tech_stack: 'Tech Stack',
  personalization_hook: 'Personalization Hook',
  trigger: 'Trigger',
  hiring: 'Hiring',
  funding: 'Funding',
  news: 'News',
};

export function SignalIntelligencePanel() {
  const { stats, leads } = useDashboardStore();

  const topSignals = stats?.signals?.topSignals || [];
  const urgencyDist = stats?.signals?.urgency || { high: 0, medium: 0, low: 0 };
  const signalBreakdown = stats?.signals?.breakdown || [];
  const memoryCategories = stats?.memory?.categories || [];
  const totalMemory = stats?.memory?.totalEntries || 0;

  // Get leads with their signal data
  const leadsWithIntelligence = leads
    .filter(l => l.signals && l.signals.length > 0)
    .map(l => ({
      ...l,
      maxUrgency: Math.max(...l.signals.map(s => s.urgency || 0), 0),
      topSignalType: l.signals.sort((a, b) => (b.urgency || 0) - (a.urgency || 0))[0]?.type,
    }))
    .sort((a, b) => b.maxUrgency - a.maxUrgency)
    .slice(0, 8);

  return (
    <div className="space-y-5">
      {/* ─── THE MOAT: WHY NOW? ─── */}
      <Card className="bg-gradient-to-br from-amber-950/30 via-slate-900/50 to-slate-900/50 border-amber-800/30">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-amber-400" />
            <CardTitle className="text-amber-400 text-base">Signal Intelligence Engine — WHY NOW?</CardTitle>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            This is the moat. Every signal is scored for urgency (WHY outreach should happen NOW) with recommended pitch angles and offers.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="text-2xl font-bold text-red-400">{urgencyDist.high}</div>
              <div className="text-xs text-red-300">High Urgency</div>
              <div className="text-[10px] text-slate-500 mt-1">Reach out NOW</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div className="text-2xl font-bold text-amber-400">{urgencyDist.medium}</div>
              <div className="text-xs text-amber-300">Medium Urgency</div>
              <div className="text-[10px] text-slate-500 mt-1">Reach out soon</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-slate-500/10 border border-slate-500/20">
              <div className="text-2xl font-bold text-slate-400">{urgencyDist.low}</div>
              <div className="text-xs text-slate-300">Low Urgency</div>
              <div className="text-[10px] text-slate-500 mt-1">Monitor</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Top Signals by Urgency ─── */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <CardTitle className="text-sm text-white">Top Signals by Urgency</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {topSignals.length === 0 ? (
            <p className="text-xs text-slate-500">No signals detected yet. Run the pipeline to discover signal intelligence.</p>
          ) : (
            <div className="space-y-2">
              {topSignals.map((signal, i) => (
                <div key={i} className="flex items-start gap-3 p-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
                  <Badge className={`text-[10px] px-1.5 py-0.5 ${SIGNAL_COLORS[signal.type] || 'bg-slate-500/20 text-slate-400'}`}>
                    {SIGNAL_LABELS[signal.type] || signal.type}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white truncate">{signal.content}</p>
                    {signal.recommendedPitchAngle && (
                      <p className="text-[10px] text-amber-400/70 mt-0.5 truncate">
                        <Sparkles className="w-2.5 h-2.5 inline mr-0.5" />
                        {signal.recommendedPitchAngle}
                      </p>
                    )}
                    {signal.lead && (
                      <p className="text-[10px] text-slate-500 mt-0.5">{signal.lead} at {signal.company}</p>
                    )}
                    {signal.sourceUrl && (
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[8px] text-slate-500">Source:</span>
                        <a href={signal.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[8px] text-blue-400 hover:underline inline-flex items-center gap-0.5 max-w-[200px] truncate">
                          {signal.sourceTitle || signal.sourceUrl}
                        </a>
                        {signal.citationQuality && (
                          <Badge variant="outline" className={`text-[8px] h-3.5 px-1 ${
                            signal.citationQuality === 'strong' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5' :
                            signal.citationQuality === 'medium' ? 'border-amber-500/30 text-amber-400 bg-amber-500/5' :
                            'border-slate-700 text-slate-400 bg-slate-800/10'
                          }`}>
                            {signal.citationQuality}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1">
                      <AlertTriangle className={`w-3 h-3 ${signal.urgency >= 0.7 ? 'text-red-400' : signal.urgency >= 0.4 ? 'text-amber-400' : 'text-slate-500'}`} />
                      <span className={`text-xs font-mono font-bold ${signal.urgency >= 0.7 ? 'text-red-400' : signal.urgency >= 0.4 ? 'text-amber-400' : 'text-slate-500'}`}>
                        {(signal.urgency * 100).toFixed(0)}%
                      </span>
                    </div>
                    <Progress value={signal.urgency * 100} className="w-16 h-1" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Leads Ranked by Signal Urgency ─── */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-purple-400" />
            <CardTitle className="text-sm text-white">Leads Ranked by Signal Urgency</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {leadsWithIntelligence.length === 0 ? (
            <p className="text-xs text-slate-500">No leads with signal intelligence yet.</p>
          ) : (
            <div className="space-y-1.5">
              {leadsWithIntelligence.map((lead) => {
                const topSignal = lead.signals.sort((a, b) => (b.urgency || 0) - (a.urgency || 0))[0];
                return (
                  <div key={lead.id} className="flex flex-col gap-1.5 p-2 rounded-lg bg-slate-800/30 border border-slate-700/30 hover:bg-slate-800/60 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 min-w-[160px]">
                        <div>
                          <p className="text-xs font-medium text-white">{lead.name}</p>
                          <p className="text-[10px] text-slate-400">{lead.company}</p>
                        </div>
                      </div>
                      <Badge className={`text-[10px] px-1.5 py-0.5 ${SIGNAL_COLORS[lead.topSignalType] || 'bg-slate-500/20 text-slate-400'}`}>
                        {SIGNAL_LABELS[lead.topSignalType] || lead.topSignalType}
                      </Badge>
                      <div className="flex-1">
                        <Progress value={lead.maxUrgency * 100} className="h-1.5" />
                      </div>
                      <span className={`text-xs font-mono font-bold ${lead.maxUrgency >= 0.7 ? 'text-red-400' : lead.maxUrgency >= 0.4 ? 'text-amber-400' : 'text-slate-500'}`}>
                        {(lead.maxUrgency * 100).toFixed(0)}%
                      </span>
                      <Badge className={`text-[10px] ${lead.priorityTier === 'hot' ? 'bg-red-500/20 text-red-400' : lead.priorityTier === 'warm' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-500/20 text-slate-400'}`}>
                        {lead.priorityTier}
                      </Badge>
                      <div className="text-[10px] text-slate-500">Score: {lead.leadScore?.toFixed(0) || 0}</div>
                    </div>
                    
                    {topSignal?.sourceUrl && (
                      <div className="pl-2.5 border-l border-slate-700 text-[9px] text-slate-500 flex items-center gap-1.5">
                        <span>Cited Top Signal Source:</span>
                        <a href={topSignal.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate max-w-[250px]">{topSignal.sourceTitle || topSignal.sourceUrl}</a>
                        {topSignal.citationQuality && (
                          <Badge variant="outline" className={`text-[8px] h-3.5 px-1 ${
                            topSignal.citationQuality === 'strong' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5' :
                            topSignal.citationQuality === 'medium' ? 'border-amber-500/30 text-amber-400 bg-amber-500/5' :
                            'border-slate-700 text-slate-400 bg-slate-800/10'
                          }`}>
                            {topSignal.citationQuality}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Signal Breakdown + Memory ─── */}
      <div className="grid grid-cols-2 gap-5">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-white">Signal Type Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {signalBreakdown.slice(0, 8).map((s) => (
                <div key={s.type} className="flex items-center gap-2">
                  <Badge className={`text-[10px] px-1.5 py-0.5 min-w-[90px] justify-center ${SIGNAL_COLORS[s.type] || 'bg-slate-500/20 text-slate-400'}`}>
                    {SIGNAL_LABELS[s.type] || s.type}
                  </Badge>
                  <div className="flex-1">
                    <Progress value={signalBreakdown[0]?.count ? (s.count / signalBreakdown[0].count) * 100 : 0} className="h-1.5" />
                  </div>
                  <span className="text-xs text-slate-400 font-mono">{s.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-violet-400" />
              <CardTitle className="text-sm text-white">Agent Memory ({totalMemory} entries)</CardTitle>
            </div>
            <p className="text-[10px] text-slate-500">The system gets smarter with every interaction. Memory compounds over time.</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {memoryCategories.map((m) => (
                <div key={m.category} className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 min-w-[120px] truncate">{m.category.replace(/_/g, ' ')}</span>
                  <div className="flex-1">
                    <Progress value={parseFloat(m.avgScore) * 100} className="h-1.5" />
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">{m.count} / {m.avgScore}</span>
                </div>
              ))}
              {memoryCategories.length === 0 && (
                <p className="text-[10px] text-slate-500">Memory entries will appear as the system learns from interactions.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
