'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Coins, 
  Sparkles, 
  TrendingUp, 
  PieChart, 
  Calculator, 
  Layers 
} from 'lucide-react';
import { TenantMetrics, FleetSummary } from '@/lib/admin/telemetry';

interface LLMCostTrackerProps {
  tenants: TenantMetrics[];
  summary?: FleetSummary;
  telemetryData?: any;
}

export function LLMCostTracker({ tenants, summary, telemetryData }: LLMCostTrackerProps) {
  const llmTelemetry = telemetryData?.llmTelemetry;
  const promptTokens = llmTelemetry?.aggregates?.promptTokens ?? summary?.totalTokensUsed ? Math.round((summary?.totalTokensUsed || 0) * 0.7) : 0;
  const completionTokens = llmTelemetry?.aggregates?.completionTokens ?? summary?.totalTokensUsed ? Math.round((summary?.totalTokensUsed || 0) * 0.3) : 0;
  const totalTokens = promptTokens + completionTokens;
  const totalCost = summary?.totalEstimatedCostUsd ?? llmTelemetry?.aggregates?.totalCostUsd ?? 0;

  return (
    <div className="space-y-4">
      {/* Top Cost KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
        <Card className="border-slate-800 bg-slate-900 text-slate-100 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Total Fleet Cost</span>
            <Coins className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-400 mt-1.5">
            ${totalCost.toFixed(2)}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Across {tenants.length} client organizations
          </p>
        </Card>

        <Card className="border-slate-800 bg-slate-900 text-slate-100 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Total Tokens Consumed</span>
            <Sparkles className="h-4 w-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-purple-400 mt-1.5">
            {totalTokens.toLocaleString()}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {(promptTokens / 1000).toFixed(0)}k in · {(completionTokens / 1000).toFixed(0)}k out
          </p>
        </Card>

        <Card className="border-slate-800 bg-slate-900 text-slate-100 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Input Token Pricing</span>
            <Calculator className="h-4 w-4 text-blue-400" />
          </div>
          <div className="text-xl font-bold font-mono text-blue-400 mt-1.5">
            $0.15 <span className="text-xs text-slate-400 font-normal">/ 1M tokens</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Standard Reasoning & ICP Context
          </p>
        </Card>

        <Card className="border-slate-800 bg-slate-900 text-slate-100 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Output Token Pricing</span>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-400 mt-1.5">
            $0.60 <span className="text-xs text-slate-400 font-normal">/ 1M tokens</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            High-Converting Copy Generation
          </p>
        </Card>
      </div>

      {/* Breakdown per Tenant Table */}
      <Card className="border-slate-800 bg-slate-900 text-slate-100 shadow-sm">
        <CardHeader className="pb-3 border-b border-slate-800/80">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Coins className="h-4 w-4 text-amber-400" />
                Tenant Token Consumption & Cost Allocation Ledger
              </CardTitle>
              <CardDescription className="text-slate-400 text-xs mt-0.5">
                Accurate unit economics and LLM inference cost tracking by organization.
              </CardDescription>
            </div>
            <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-xs font-mono">
              REAL-TIME USAGE
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4 font-medium">Tenant Name</th>
                  <th className="py-3 px-4 font-medium">Prompt Tokens</th>
                  <th className="py-3 px-4 font-medium">Completion Tokens</th>
                  <th className="py-3 px-4 font-medium">Total Tokens</th>
                  <th className="py-3 px-4 font-medium">Est. Cost (USD)</th>
                  <th className="py-3 px-4 font-medium">Cost Distribution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {tenants.map((t) => {
                  const pct = totalCost > 0 ? (t.tokenUsage.estimatedCostUsd / totalCost) * 100 : 0;
                  return (
                    <tr key={t.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-slate-200">
                        {t.name}
                        <div className="text-[11px] text-slate-400 font-mono">{t.plan.toUpperCase()} Plan</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {t.tokenUsage.promptTokens.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {t.tokenUsage.completionTokens.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-100">
                        {t.tokenUsage.totalTokens.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-amber-400">
                        ${t.tokenUsage.estimatedCostUsd.toFixed(4)}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-28 bg-slate-800 h-2 rounded-full overflow-hidden">
                            <div 
                              className="bg-amber-400 h-full rounded-full" 
                              style={{ width: `${Math.max(4, Math.min(100, pct))}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-mono text-slate-400">{pct.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
