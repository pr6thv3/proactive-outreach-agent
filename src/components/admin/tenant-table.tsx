'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Building2, 
  Search, 
  ShieldCheck, 
  ShieldAlert, 
  AlertTriangle, 
  PauseCircle, 
  PlayCircle, 
  Activity, 
  ExternalLink,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Filter
} from 'lucide-react';
import { TenantMetrics } from '@/lib/admin/telemetry';

interface TenantTableProps {
  tenants: TenantMetrics[];
  onSelectTenant: (tenant: TenantMetrics) => void;
  onToggleAutonomy: (tenantId: string, currentPaused: boolean) => Promise<void>;
  onTriggerHealthCheck: (tenantId: string) => Promise<void>;
  onResetDailySends: (tenantId: string) => Promise<void>;
  isLoading?: boolean;
}

export function TenantTable({
  tenants,
  onSelectTenant,
  onToggleAutonomy,
  onTriggerHealthCheck,
  onResetDailySends,
  isLoading,
}: TenantTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'healthy' | 'warning' | 'tripped' | 'paused'>('all');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Filter tenants by search & status
  const filteredTenants = tenants.filter(t => {
    const matchesSearch = 
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.slug && t.slug.toLowerCase().includes(searchTerm.toLowerCase())) ||
      t.id.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === 'healthy') {
      return t.circuitBreakerStatus === 'HEALTHY' && !t.autonomyPaused;
    }
    if (statusFilter === 'warning') {
      return t.circuitBreakerStatus === 'WARNING';
    }
    if (statusFilter === 'tripped') {
      return t.circuitBreakerStatus === 'TRIPPED';
    }
    if (statusFilter === 'paused') {
      return t.autonomyPaused;
    }

    return true;
  });

  const handleAction = async (tenantId: string, actionType: string, fn: () => Promise<void>) => {
    setActionInProgress(`${tenantId}:${actionType}`);
    try {
      await fn();
    } finally {
      setActionInProgress(null);
    }
  };

  const getCircuitBreakerBadge = (tenant: TenantMetrics) => {
    if (tenant.autonomyPaused) {
      return (
        <Badge className="bg-amber-950/80 text-amber-400 border-amber-800 text-[11px] font-mono flex items-center gap-1">
          <PauseCircle className="h-3 w-3" />
          AUTONOMY PAUSED
        </Badge>
      );
    }

    switch (tenant.circuitBreakerStatus) {
      case 'HEALTHY':
        return (
          <Badge className="bg-emerald-950/80 text-emerald-400 border-emerald-800 text-[11px] font-mono flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            HEALTHY
          </Badge>
        );
      case 'WARNING':
        return (
          <Badge className="bg-yellow-950/80 text-yellow-400 border-yellow-800 text-[11px] font-mono flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            WARNING
          </Badge>
        );
      case 'TRIPPED':
        return (
          <Badge className="bg-red-950/80 text-red-400 border-red-800 text-[11px] font-mono flex items-center gap-1">
            <ShieldAlert className="h-3 w-3" />
            CIRCUIT TRIPPED
          </Badge>
        );
    }
  };

  const getDeliverabilityBadge = (score: number, grade: string) => {
    let colorClasses = 'bg-emerald-950/80 text-emerald-400 border-emerald-800';
    if (score < 70) colorClasses = 'bg-red-950/80 text-red-400 border-red-800';
    else if (score < 85) colorClasses = 'bg-amber-950/80 text-amber-400 border-amber-800';

    return (
      <Badge className={`${colorClasses} text-xs font-mono font-bold px-2 py-0.5`}>
        {score}% ({grade})
      </Badge>
    );
  };

  return (
    <Card className="border-slate-800 bg-slate-900 text-slate-100 shadow-sm">
      <CardHeader className="pb-3 border-b border-slate-800/80">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-400" />
              Tenant Operations & Multi-Client Fleet Health
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs mt-0.5">
              Live deliverability metrics, circuit breaker kill-switches, queue pressure, and LLM costs per tenant.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <Input
                placeholder="Search clients..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 text-xs bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-500"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-md border border-slate-800">
              {(['all', 'healthy', 'warning', 'tripped', 'paused'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`px-2 py-1 text-[11px] font-medium rounded transition-colors capitalize ${
                    statusFilter === filter
                      ? 'bg-slate-800 text-slate-200 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4 font-medium">Tenant / Client</th>
                <th className="py-3 px-4 font-medium">Campaigns</th>
                <th className="py-3 px-4 font-medium">Deliverability</th>
                <th className="py-3 px-4 font-medium">Circuit Breaker</th>
                <th className="py-3 px-4 font-medium">Queue Health</th>
                <th className="py-3 px-4 font-medium">Token Usage</th>
                <th className="py-3 px-4 font-medium">Estimated Cost</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 text-xs font-mono">
                    {isLoading ? 'Loading tenant fleet telemetry...' : 'No organizations match your query.'}
                  </td>
                </tr>
              ) : (
                filteredTenants.map((tenant) => {
                  const isPausing = actionInProgress === `${tenant.id}:pause`;
                  const isAuditing = actionInProgress === `${tenant.id}:audit`;
                  const isResetting = actionInProgress === `${tenant.id}:reset`;

                  return (
                    <tr 
                      key={tenant.id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Client Name */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-bold text-xs uppercase">
                            {tenant.name.slice(0, 2)}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                              {tenant.name}
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-slate-700 text-slate-400 font-mono uppercase">
                                {tenant.plan}
                              </Badge>
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              {tenant.leadCount} leads · {tenant.sendingDomainsCount} domains ({tenant.verifiedDomainsCount} verified)
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Active Campaigns */}
                      <td className="py-3.5 px-4 font-mono">
                        <div className="text-slate-200 font-medium">
                          {tenant.activeCampaigns} <span className="text-slate-400 font-normal">/ {tenant.totalCampaigns}</span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {tenant.pausedCampaigns > 0 ? `${tenant.pausedCampaigns} paused` : 'All operational'}
                        </div>
                      </td>

                      {/* Deliverability Score */}
                      <td className="py-3.5 px-4">
                        {getDeliverabilityBadge(tenant.deliverabilityScore, tenant.deliverabilityGrade)}
                      </td>

                      {/* Circuit Breaker Status */}
                      <td className="py-3.5 px-4">
                        {getCircuitBreakerBadge(tenant)}
                      </td>

                      {/* Queue Health */}
                      <td className="py-3.5 px-4 font-mono text-[11px]">
                        <div className="text-slate-300">
                          <span className="text-cyan-400 font-semibold">{tenant.queueHealth.pendingEnrichment}</span> pending · <span className="text-emerald-400 font-semibold">{tenant.queueHealth.mxVerified}</span> MX ok
                        </div>
                        <div className="text-slate-400">
                          {tenant.queueHealth.queuedEmails} queued · {tenant.queueHealth.sent24h} sent (24h)
                        </div>
                      </td>

                      {/* Token Usage */}
                      <td className="py-3.5 px-4 font-mono text-[11px]">
                        <div className="text-slate-200 font-semibold">
                          {(tenant.tokenUsage.totalTokens / 1000).toFixed(1)}k
                        </div>
                        <div className="text-slate-400 text-[10px]">
                          {(tenant.tokenUsage.promptTokens / 1000).toFixed(0)}k in · {(tenant.tokenUsage.completionTokens / 1000).toFixed(0)}k out
                        </div>
                      </td>

                      {/* Estimated Cost */}
                      <td className="py-3.5 px-4 font-mono">
                        <span className="text-amber-400 font-bold">
                          ${tenant.tokenUsage.estimatedCostUsd.toFixed(4)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onSelectTenant(tenant)}
                            className="h-7 text-xs px-2.5 text-slate-300 hover:text-slate-100 hover:bg-slate-800"
                            title="Inspect Tenant Diagnostics"
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />
                            Inspect
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isPausing}
                            onClick={() => handleAction(tenant.id, 'pause', () => onToggleAutonomy(tenant.id, tenant.autonomyPaused))}
                            className={`h-7 text-xs px-2 border-slate-700 ${
                              tenant.autonomyPaused
                                ? 'bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900/60 border-emerald-800'
                                : 'bg-amber-950/60 text-amber-300 hover:bg-amber-900/60 border-amber-800'
                            }`}
                            title={tenant.autonomyPaused ? 'Resume Autonomy' : 'Emergency Kill-switch'}
                          >
                            {tenant.autonomyPaused ? (
                              <>
                                <PlayCircle className="h-3 w-3 mr-1" />
                                Resume
                              </>
                            ) : (
                              <>
                                <PauseCircle className="h-3 w-3 mr-1" />
                                Pause
                              </>
                            )}
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isAuditing}
                            onClick={() => handleAction(tenant.id, 'audit', () => onTriggerHealthCheck(tenant.id))}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                            title="Trigger Send-Readiness Audit"
                          >
                            <Activity className={`h-3.5 w-3.5 ${isAuditing ? 'animate-spin text-blue-400' : ''}`} />
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isResetting}
                            onClick={() => handleAction(tenant.id, 'reset', () => onResetDailySends(tenant.id))}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                            title="Reset Redis Daily Counter"
                          >
                            <RotateCcw className={`h-3.5 w-3.5 ${isResetting ? 'animate-spin text-amber-400' : ''}`} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
