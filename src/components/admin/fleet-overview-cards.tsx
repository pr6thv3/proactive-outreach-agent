'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { FleetSummary } from '@/lib/admin/telemetry';
import { 
  Building2, 
  Send, 
  ShieldCheck, 
  MailCheck, 
  Coins, 
  Layers 
} from 'lucide-react';

interface FleetOverviewCardsProps {
  summary?: FleetSummary;
  isLoading?: boolean;
}

export function FleetOverviewCards({ summary, isLoading }: FleetOverviewCardsProps) {
  if (isLoading || !summary) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="border-slate-800 bg-slate-900/80 text-slate-100 animate-pulse h-24">
            <CardContent className="p-4" />
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: 'Total Active Tenants',
      value: summary.totalTenants.toString(),
      subtext: `${summary.statusBreakdown.healthy} Healthy · ${summary.statusBreakdown.warning + summary.statusBreakdown.tripped} Alerts`,
      icon: Building2,
      iconColor: 'text-blue-400',
      bgGlow: 'from-blue-500/10 to-transparent',
    },
    {
      title: 'Active Campaigns',
      value: summary.activeCampaigns.toString(),
      subtext: `${summary.totalLeads.toLocaleString()} Leads Tracked`,
      icon: Send,
      iconColor: 'text-emerald-400',
      bgGlow: 'from-emerald-500/10 to-transparent',
    },
    {
      title: 'Fleet Deliverability',
      value: `${summary.fleetDeliverabilityScore}%`,
      subtext: `Bounce Rate: ${summary.fleetBounceRatePct}`,
      icon: ShieldCheck,
      iconColor: summary.fleetDeliverabilityScore >= 90 ? 'text-emerald-400' : 'text-amber-400',
      bgGlow: summary.fleetDeliverabilityScore >= 90 ? 'from-emerald-500/10 to-transparent' : 'from-amber-500/10 to-transparent',
    },
    {
      title: '24h Outreach Volume',
      value: summary.totalSent24h.toLocaleString(),
      subtext: `${summary.totalBounced24h} Bounces Recorded`,
      icon: MailCheck,
      iconColor: 'text-purple-400',
      bgGlow: 'from-purple-500/10 to-transparent',
    },
    {
      title: 'Queue Pressure',
      value: summary.queuePressure.toLocaleString(),
      subtext: 'Pending Verification & Sends',
      icon: Layers,
      iconColor: 'text-cyan-400',
      bgGlow: 'from-cyan-500/10 to-transparent',
    },
    {
      title: 'Total LLM Cost',
      value: `$${summary.totalEstimatedCostUsd.toFixed(2)}`,
      subtext: `${(summary.totalTokensUsed / 1000).toFixed(1)}k Total Tokens`,
      icon: Coins,
      iconColor: 'text-amber-400',
      bgGlow: 'from-amber-500/10 to-transparent',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <Card 
            key={idx} 
            className="border-slate-800 bg-slate-900/90 text-slate-100 relative overflow-hidden transition-all hover:border-slate-700"
          >
            <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl ${card.bgGlow} rounded-full -mr-8 -mt-8 pointer-events-none`} />
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3.5 px-4">
              <CardTitle className="text-xs font-medium text-slate-400 truncate pr-1">
                {card.title}
              </CardTitle>
              <Icon className={`h-4 w-4 ${card.iconColor} shrink-0`} />
            </CardHeader>
            <CardContent className="px-4 pb-3.5 pt-1">
              <div className="text-xl font-bold font-mono tracking-tight text-slate-100">
                {card.value}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                {card.subtext}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
