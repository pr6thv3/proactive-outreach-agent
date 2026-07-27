'use client';

import { DashboardStats } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Users, Mail, TrendingUp, Zap, Clock, CheckCircle, ShieldAlert, FileCheck, Brain, Flame, Target, BarChart3 } from 'lucide-react';

interface Props { stats: DashboardStats | null }

export function StatsCards({ stats }: Props) {
  const cards = [
    { label: 'Total Leads', value: stats?.leads.total ?? 0, sub: `${stats?.leads.new ?? 0} new`, icon: Users, bg: 'bg-emerald-500/10', tx: 'text-emerald-400', br: 'border-emerald-500/20' },
    { label: 'Hot Leads', value: stats?.leads.hot ?? 0, sub: `${stats?.leads.warm ?? 0} warm`, icon: Flame, bg: 'bg-red-500/10', tx: 'text-red-400', br: 'border-red-500/20' },
    { label: 'Match Quality', value: parseFloat(stats?.leads.avgLeadScore || '0').toFixed(0), sub: `max: ${stats?.leads.maxLeadScore || 0}`, icon: Target, bg: 'bg-amber-500/10', tx: 'text-amber-400', br: 'border-amber-500/20' },
    { label: 'Generated', value: stats?.messages.generated ?? 0, sub: 'awaiting review', icon: FileCheck, bg: 'bg-purple-500/10', tx: 'text-purple-400', br: 'border-purple-500/20' },
    { label: 'Sent', value: stats?.messages.sent ?? 0, sub: `${stats?.messages.responseRate ?? '0'}% response`, icon: Mail, bg: 'bg-blue-500/10', tx: 'text-blue-400', br: 'border-blue-500/20' },
    { label: 'Interested', value: stats?.leads.interested ?? 0, sub: `${stats?.leads.interestRate ?? '0'}% rate`, icon: CheckCircle, bg: 'bg-green-500/10', tx: 'text-green-400', br: 'border-green-500/20' },
    { label: 'Signals', value: stats?.signals.total ?? 0, sub: `${stats?.signals.urgency?.high ?? 0} high urgency`, icon: TrendingUp, bg: 'bg-amber-500/10', tx: 'text-amber-400', br: 'border-amber-500/20' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
      {cards.map(c => (
        <Card key={c.label} className={`p-3 bg-slate-900/50 border ${c.br} backdrop-blur-sm`}>
          <div className="flex items-start justify-between mb-1.5">
            <span className="text-[10px] text-slate-400 font-medium">{c.label}</span>
            <div className={`w-6 h-6 rounded ${c.bg} flex items-center justify-center`}><c.icon className={`w-3 h-3 ${c.tx}`} /></div>
          </div>
          <div className="text-xl font-bold text-white">{c.value}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{c.sub}</div>
        </Card>
      ))}
    </div>
  );
}
