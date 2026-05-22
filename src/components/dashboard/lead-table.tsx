'use client';

import { useDashboardStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Play, Search, Zap, Mail, ShieldAlert } from 'lucide-react';
import { useState } from 'react';

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  enriched: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  generated: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  approved: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  sent: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  replied: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  interested: 'bg-green-500/15 text-green-300 border-green-500/30',
  negative: 'bg-red-500/15 text-red-300 border-red-500/30',
  unsubscribed: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

const STATUS_OPTIONS = ['all', 'new', 'enriched', 'generated', 'approved', 'sent', 'interested', 'negative', 'unsubscribed'];

export function LeadTable() {
  const { leads, pipelineRunning, fetchLeads, runFullPipeline, campaigns } = useDashboardStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = leads.filter(l => {
    const matchSearch = !search || l.name.toLowerCase().includes(search.toLowerCase()) || l.email.toLowerCase().includes(search.toLowerCase()) || (l.company || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || l.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const firstCampaign = campaigns[0];

  return (
    <Card className="bg-slate-900/50 border-slate-700/50 overflow-hidden">
      <div className="p-3 border-b border-slate-800 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <Input placeholder="Search leads..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 h-8 text-xs" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {STATUS_OPTIONS.map(s => (
            <button key={s} onClick={() => { setStatusFilter(s); fetchLeads(s); }} className={`px-2 py-1 rounded text-[10px] border transition-colors ${statusFilter === s ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10' : 'border-slate-700 text-slate-500 hover:text-slate-300'}`}>
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-slate-500">{filtered.length} leads</span>
      </div>

      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-slate-900">
            <tr className="border-b border-slate-800">
              <th className="text-left text-[10px] font-medium text-slate-400 px-3 py-2">Lead</th>
              <th className="text-left text-[10px] font-medium text-slate-400 px-3 py-2">Company</th>
              <th className="text-left text-[10px] font-medium text-slate-400 px-3 py-2">Status</th>
              <th className="text-left text-[10px] font-medium text-slate-400 px-3 py-2">Signals</th>
              <th className="text-left text-[10px] font-medium text-slate-400 px-3 py-2">Safety</th>
              <th className="text-right text-[10px] font-medium text-slate-400 px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-slate-500 text-xs">No leads found</td></tr>
            ) : filtered.map(lead => (
              <tr key={lead.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <td className="px-3 py-2">
                  <div className="text-xs font-medium text-white">{lead.name}</div>
                  <div className="text-[10px] text-slate-500">{lead.email}</div>
                </td>
                <td className="px-3 py-2">
                  <div className="text-xs text-slate-300">{lead.company || '—'}</div>
                  <div className="text-[10px] text-slate-500">{lead.title || ''}</div>
                </td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className={`text-[9px] h-4 ${STATUS_COLORS[lead.status] || STATUS_COLORS.new}`}>{lead.status}</Badge>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1"><Zap className="w-3 h-3 text-amber-400" /><span className="text-[10px] text-slate-300">{lead.signalCount}</span></div>
                </td>
                <td className="px-3 py-2">
                  {lead.isBlacklisted || lead.doNotContact ? <ShieldAlert className="w-3.5 h-3.5 text-red-400" /> : <span className="text-[10px] text-emerald-400">OK</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" disabled={pipelineRunning || lead.isBlacklisted || lead.doNotContact} onClick={() => runFullPipeline(lead.id, firstCampaign?.id)} className="h-6 text-[10px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 px-2">
                    <Play className="w-2.5 h-2.5 mr-0.5" />Run
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
