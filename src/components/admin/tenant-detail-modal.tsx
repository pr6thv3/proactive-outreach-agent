'use client';

import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter 
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Building2, 
  ShieldCheck, 
  ShieldAlert, 
  AlertTriangle, 
  Globe, 
  Send, 
  Layers, 
  Coins, 
  Users, 
  Settings, 
  RotateCcw, 
  PauseCircle, 
  PlayCircle, 
  CheckCircle2, 
  XCircle,
  RefreshCw
} from 'lucide-react';
import { TenantMetrics } from '@/lib/admin/telemetry';

interface TenantDetailModalProps {
  tenant: TenantMetrics | null;
  isOpen: boolean;
  onClose: () => void;
  onToggleAutonomy: (tenantId: string, currentPaused: boolean) => Promise<void>;
  onTriggerHealthCheck: (tenantId: string) => Promise<void>;
  onResetDailySends: (tenantId: string) => Promise<void>;
  onUpdateLimits: (tenantId: string, dailyLimit: number, minScore: number) => Promise<void>;
  onClearFailedQueue: (tenantId: string) => Promise<void>;
}

export function TenantDetailModal({
  tenant,
  isOpen,
  onClose,
  onToggleAutonomy,
  onTriggerHealthCheck,
  onResetDailySends,
  onUpdateLimits,
  onClearFailedQueue,
}: TenantDetailModalProps) {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'domains' | 'campaigns' | 'queue' | 'tokens' | 'settings'>('overview');
  const [details, setDetails] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dailyLimitInput, setDailyLimitInput] = useState<number>(50);
  const [minScoreInput, setMinScoreInput] = useState<number>(60);
  const [isSavingLimits, setIsSavingLimits] = useState(false);

  const fetchTenantDetails = async (id: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/tenants/${id}`);
      if (res.ok) {
        const data = await res.json();
        setDetails(data.data);
      }
    } catch (err) {
      console.error('Failed to load tenant details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (tenant && isOpen) {
      setDailyLimitInput(tenant.dailySendLimit);
      setMinScoreInput(tenant.minLeadScore);
      fetchTenantDetails(tenant.id);
    }
  }, [tenant, isOpen]);

  const handleSaveLimits = async () => {
    if (!tenant) return;
    setIsSavingLimits(true);
    try {
      await onUpdateLimits(tenant.id, dailyLimitInput, minScoreInput);
      await fetchTenantDetails(tenant.id);
    } finally {
      setIsSavingLimits(false);
    }
  };

  if (!tenant) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl bg-slate-950 border-slate-800 text-slate-100 p-0 overflow-hidden font-sans">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-950/60 border border-blue-800/60 flex items-center justify-center text-blue-400 font-bold text-base uppercase">
                {tenant.name.slice(0, 2)}
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  {tenant.name}
                  <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-[10px] font-mono uppercase">
                    {tenant.plan}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400 font-mono mt-0.5">
                  Tenant ID: {tenant.id} · Created {new Date(tenant.createdAt).toLocaleDateString()}
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge className={`text-xs font-mono px-2.5 py-1 ${
                tenant.circuitBreakerStatus === 'HEALTHY'
                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                  : tenant.circuitBreakerStatus === 'WARNING'
                  ? 'bg-amber-950 text-amber-400 border-amber-800'
                  : 'bg-red-950 text-red-400 border-red-800'
              }`}>
                {tenant.circuitBreakerStatus}
              </Badge>
              {tenant.autonomyPaused && (
                <Badge className="bg-amber-950 text-amber-400 border-amber-800 text-xs font-mono">
                  PAUSED
                </Badge>
              )}
            </div>
          </div>

          {/* Sub Navigation */}
          <div className="flex items-center gap-1 mt-5 border-t border-slate-800/80 pt-3">
            {[
              { id: 'overview', label: 'Health Overview', icon: Building2 },
              { id: 'domains', label: `Domains (${details?.sendingDomains?.length ?? tenant.sendingDomainsCount})`, icon: Globe },
              { id: 'campaigns', label: `Campaigns (${tenant.totalCampaigns})`, icon: Send },
              { id: 'queue', label: 'Queue & Pipeline', icon: Layers },
              { id: 'tokens', label: 'Tokens & Costs', icon: Coins },
              { id: 'settings', label: 'Admin Overrides', icon: Settings },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSubTab(tab.id as any)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    isActive
                      ? 'bg-slate-800 text-slate-100 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-6">
          {/* Tab 1: Overview */}
          {activeSubTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3.5">
                  <span className="text-slate-400 text-xs font-medium">Deliverability Score</span>
                  <div className="text-2xl font-bold font-mono text-slate-100 mt-1">
                    {tenant.deliverabilityScore}% ({tenant.deliverabilityGrade})
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                    Based on domain reputations & bounce rates
                  </p>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3.5">
                  <span className="text-slate-400 text-xs font-medium">Lead Ledger</span>
                  <div className="text-2xl font-bold font-mono text-slate-100 mt-1">
                    {tenant.leadCount.toLocaleString()} Leads
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                    {tenant.signalCount.toLocaleString()} Intent signals ingested
                  </p>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3.5">
                  <span className="text-slate-400 text-xs font-medium">LLM Usage</span>
                  <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
                    ${tenant.tokenUsage.estimatedCostUsd.toFixed(4)}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                    {(tenant.tokenUsage.totalTokens / 1000).toFixed(1)}k tokens used
                  </p>
                </div>
              </div>

              {tenant.circuitBreakerReason && (
                <div className="rounded-lg border border-red-900/60 bg-red-950/30 p-3.5 text-xs text-red-300 flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-semibold">Circuit Breaker Alert:</strong> {tenant.circuitBreakerReason}
                  </div>
                </div>
              )}

              {details?.members && (
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                  <h4 className="text-xs font-semibold text-slate-300 mb-2.5 flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-blue-400" /> Organization Members ({details.members.length})
                  </h4>
                  <div className="space-y-2">
                    {details.members.map((m: any) => (
                      <div key={m.id} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-800/60 last:border-0">
                        <span className="text-slate-200">{m.user.name || m.user.email} <span className="text-slate-400">({m.user.email})</span></span>
                        <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-300 font-mono">
                          {m.role}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Sending Domains */}
          {activeSubTab === 'domains' && (
            <div className="space-y-3">
              {details?.sendingDomains?.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs font-mono">
                  No sending domains configured for this organization.
                </div>
              ) : (
                details?.sendingDomains?.map((d: any) => (
                  <div key={d.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-2">
                        <Globe className="h-4 w-4 text-blue-400" />
                        {d.domain}
                        <Badge className={`text-[10px] font-mono ${
                          d.status === 'verified' || d.status === 'active' || d.status === 'ACTIVE'
                            ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                            : 'bg-amber-950 text-amber-400 border-amber-800'
                        }`}>
                          {d.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-1">
                        Daily Limit: {d.dailyLimit} · Daily Sends: {d.dailySendsCount ?? 0} · Reputation: {d.reputationScore ?? 95}%
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className={`px-2 py-0.5 rounded text-[11px] ${d.dkimVerified ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-400'}`}>
                        DKIM: {d.dkimVerified ? 'OK' : 'Pending'}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[11px] ${d.spfVerified ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-400'}`}>
                        SPF: {d.spfVerified ? 'OK' : 'Pending'}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[11px] ${d.dmarcVerified ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-400'}`}>
                        DMARC: {d.dmarcVerified ? 'OK' : 'Pending'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab 3: Campaigns */}
          {activeSubTab === 'campaigns' && (
            <div className="space-y-3">
              {details?.campaigns?.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs font-mono">
                  No campaigns created for this tenant.
                </div>
              ) : (
                details?.campaigns?.map((c: any) => (
                  <div key={c.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-2">
                        <Send className="h-4 w-4 text-emerald-400" />
                        {c.name}
                        <Badge className={`text-[10px] font-mono ${
                          c.status === 'ACTIVE' || c.status === 'active'
                            ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {c.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-1">
                        Daily Limit: {c.dailyLimit || c.maxDailySends || 50} · Sender: {c.senderEmail || 'Default'}
                      </div>
                      {c.pausedReason && (
                        <div className="text-[11px] text-amber-400 font-mono mt-1">
                          Pause Reason: {c.pausedReason}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab 4: Queue & Pipeline */}
          {activeSubTab === 'queue' && (
            <div className="space-y-4 font-mono text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-900 border border-slate-800 rounded">
                  <span className="text-slate-400 text-[11px]">Pending MX Queue</span>
                  <div className="text-lg font-bold text-cyan-400 mt-0.5">{tenant.queueHealth.pendingEnrichment}</div>
                </div>
                <div className="p-3 bg-slate-900 border border-slate-800 rounded">
                  <span className="text-slate-400 text-[11px]">MX Verified</span>
                  <div className="text-lg font-bold text-emerald-400 mt-0.5">{tenant.queueHealth.mxVerified}</div>
                </div>
                <div className="p-3 bg-slate-900 border border-slate-800 rounded">
                  <span className="text-slate-400 text-[11px]">Queued Emails</span>
                  <div className="text-lg font-bold text-blue-400 mt-0.5">{tenant.queueHealth.queuedEmails}</div>
                </div>
                <div className="p-3 bg-slate-900 border border-slate-800 rounded">
                  <span className="text-slate-400 text-[11px]">Sent (24h)</span>
                  <div className="text-lg font-bold text-purple-400 mt-0.5">{tenant.queueHealth.sent24h}</div>
                </div>
              </div>

              {details?.recentRuns && (
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                  <h4 className="text-xs font-semibold text-slate-300 mb-2 font-sans">Recent Pipeline Runs</h4>
                  <div className="space-y-1.5">
                    {details.recentRuns.slice(0, 5).map((r: any) => (
                      <div key={r.id} className="flex justify-between py-1 border-b border-slate-800/40 text-[11px]">
                        <span className="text-slate-300">[{r.phase?.toUpperCase()}] {r.agentName || 'Pipeline'}</span>
                        <span className={r.status === 'completed' ? 'text-emerald-400' : 'text-red-400'}>
                          {r.status} ({r.durationMs ? `${r.durationMs}ms` : '0ms'})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 5: Tokens & Costs */}
          {activeSubTab === 'tokens' && (
            <div className="space-y-4 font-mono text-xs">
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                <h4 className="text-xs font-semibold text-slate-300 mb-3 font-sans">LLM Token Consumption Breakdown</h4>
                <div className="space-y-2">
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Prompt / Input Tokens:</span>
                    <span className="text-slate-200">{tenant.tokenUsage.promptTokens.toLocaleString()} tokens (@ $0.15/1M)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Completion / Output Tokens:</span>
                    <span className="text-slate-200">{tenant.tokenUsage.completionTokens.toLocaleString()} tokens (@ $0.60/1M)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60 font-bold text-slate-100">
                    <span>Total Tokens Consumed:</span>
                    <span>{tenant.tokenUsage.totalTokens.toLocaleString()} tokens</span>
                  </div>
                  <div className="flex justify-between py-1 text-amber-400 font-bold text-sm">
                    <span>Estimated Cost (USD):</span>
                    <span>${tenant.tokenUsage.estimatedCostUsd.toFixed(4)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 6: Admin Overrides */}
          {activeSubTab === 'settings' && (
            <div className="space-y-5">
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Settings className="h-3.5 w-3.5 text-blue-400" /> Tenant Send Limits & Thresholds
                </h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-slate-400">Daily Send Limit</Label>
                    <Input
                      type="number"
                      value={dailyLimitInput}
                      onChange={(e) => setDailyLimitInput(Number(e.target.value))}
                      className="mt-1 h-8 text-xs bg-slate-950 border-slate-800 text-slate-200 font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-400">Min Lead Score (0-100)</Label>
                    <Input
                      type="number"
                      value={minScoreInput}
                      onChange={(e) => setMinScoreInput(Number(e.target.value))}
                      className="mt-1 h-8 text-xs bg-slate-950 border-slate-800 text-slate-200 font-mono"
                    />
                  </div>
                </div>

                <Button
                  size="sm"
                  disabled={isSavingLimits}
                  onClick={handleSaveLimits}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-7 mt-2"
                >
                  {isSavingLimits ? 'Saving...' : 'Update Limits'}
                </Button>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5 text-amber-400" /> Administrative Actions
                </h4>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onToggleAutonomy(tenant.id, tenant.autonomyPaused)}
                    className="border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800 text-xs h-8"
                  >
                    {tenant.autonomyPaused ? (
                      <>
                        <PlayCircle className="h-3.5 w-3.5 mr-1 text-emerald-400" />
                        Resume Tenant Autonomy
                      </>
                    ) : (
                      <>
                        <PauseCircle className="h-3.5 w-3.5 mr-1 text-amber-400" />
                        Emergency Pause Autonomy
                      </>
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onResetDailySends(tenant.id)}
                    className="border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800 text-xs h-8"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1 text-blue-400" />
                    Reset Daily Send Counter
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onClearFailedQueue(tenant.id)}
                    className="border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800 text-xs h-8"
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1 text-purple-400" />
                    Retry Failed Queue Items
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-mono">
            ProactiveReach Multi-Tenant Admin Isolation Guarantee Active
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 text-xs h-8"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
