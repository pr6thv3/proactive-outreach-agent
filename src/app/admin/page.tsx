'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { AdminHeader } from '@/components/admin/admin-header';
import { FleetOverviewCards } from '@/components/admin/fleet-overview-cards';
import { TenantTable } from '@/components/admin/tenant-table';
import { TenantDetailModal } from '@/components/admin/tenant-detail-modal';
import { InngestEnginePanel } from '@/components/admin/inngest-engine-panel';
import { RedisTelemetryPanel } from '@/components/admin/redis-telemetry-panel';
import { LLMCostTracker } from '@/components/admin/llm-cost-tracker';
import { TenantMetrics } from '@/lib/admin/telemetry';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedTenant, setSelectedTenant] = useState<TenantMetrics | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Fetch Fleet Metrics
  const { data: fleetData, error: fleetError, isLoading: fleetLoading, mutate: mutateFleet } = useSWR(
    '/api/admin/fleet',
    fetcher,
    { refreshInterval: 15000 }
  );

  // Fetch Telemetry Data
  const { data: telemetryData, mutate: mutateTelemetry } = useSWR(
    '/api/admin/telemetry',
    fetcher,
    { refreshInterval: 15000 }
  );

  const fleet = fleetData?.data;
  const tenants: TenantMetrics[] = fleet?.tenants || [];
  const summary = fleet?.summary;

  const handleRefresh = async () => {
    toast.info('Refreshing fleet telemetry and connection pools...');
    await Promise.all([mutateFleet(), mutateTelemetry()]);
    toast.success('Fleet status updated');
  };

  const handleSelectTenant = (tenant: TenantMetrics) => {
    setSelectedTenant(tenant);
    setIsModalOpen(true);
  };

  const handleToggleAutonomy = async (tenantId: string, currentPaused: boolean) => {
    try {
      const nextPaused = !currentPaused;
      const res = await fetch(`/api/admin/tenants/${tenantId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_autonomy', paused: nextPaused }),
      });

      if (res.ok) {
        toast.success(nextPaused ? 'Tenant autonomy PAUSED' : 'Tenant autonomy RESUMED');
        await mutateFleet();
        if (selectedTenant && selectedTenant.id === tenantId) {
          setSelectedTenant({ ...selectedTenant, autonomyPaused: nextPaused });
        }
      } else {
        const json = await res.json();
        toast.error(json.error?.message || 'Failed to toggle autonomy');
      }
    } catch {
      toast.error('Network error modifying tenant autonomy');
    }
  };

  const handleTriggerHealthCheck = async (tenantId: string) => {
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trigger_health_check' }),
      });

      if (res.ok) {
        const json = await res.json();
        toast.success(`Health audit complete: Deliverability ${json.data?.deliverability?.deliverabilityScore}%`);
        await mutateFleet();
      } else {
        toast.error('Health audit failed');
      }
    } catch {
      toast.error('Network error during health audit');
    }
  };

  const handleResetDailySends = async (tenantId: string) => {
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_daily_sends' }),
      });

      if (res.ok) {
        toast.success('Daily send counters reset');
        await mutateFleet();
      } else {
        toast.error('Failed to reset daily send counter');
      }
    } catch {
      toast.error('Network error resetting sends');
    }
  };

  const handleUpdateLimits = async (tenantId: string, dailyLimit: number, minScore: number) => {
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_limits', dailySendLimit: dailyLimit, minLeadScore: minScore }),
      });

      if (res.ok) {
        toast.success('Tenant thresholds saved');
        await mutateFleet();
      } else {
        toast.error('Failed to update tenant limits');
      }
    } catch {
      toast.error('Network error updating limits');
    }
  };

  const handleClearFailedQueue = async (tenantId: string) => {
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_failed_queue' }),
      });

      if (res.ok) {
        const json = await res.json();
        toast.success(`Reset ${json.data?.resetCount ?? 0} failed queue items for retry`);
        await mutateFleet();
      } else {
        toast.error('Failed to retry queue');
      }
    } catch {
      toast.error('Network error clearing queue');
    }
  };

  let systemStatus: 'healthy' | 'warning' | 'tripped' | 'loading' = 'loading';
  if (summary) {
    if (summary.statusBreakdown.tripped > 0) systemStatus = 'tripped';
    else if (summary.statusBreakdown.warning > 0) systemStatus = 'warning';
    else systemStatus = 'healthy';
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 bg-slate-950 min-h-screen text-slate-100 font-sans">
      <AdminHeader
        systemStatus={systemStatus}
        lastUpdated={telemetryData?.data?.timestamp || null}
        onRefresh={handleRefresh}
        isRefreshing={fleetLoading}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* KPI Overview Cards */}
      <FleetOverviewCards summary={summary} isLoading={fleetLoading} />

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <TenantTable
            tenants={tenants}
            onSelectTenant={handleSelectTenant}
            onToggleAutonomy={handleToggleAutonomy}
            onTriggerHealthCheck={handleTriggerHealthCheck}
            onResetDailySends={handleResetDailySends}
            isLoading={fleetLoading}
          />
        </div>
      )}

      {activeTab === 'telemetry' && (
        <div className="space-y-6">
          <InngestEnginePanel 
            inngestStatus={fleet?.inngestStatus} 
            telemetryData={telemetryData?.data} 
          />
          <RedisTelemetryPanel 
            redisTelemetry={fleet?.redisTelemetry} 
            telemetryData={telemetryData?.data} 
          />
        </div>
      )}

      {activeTab === 'costs' && (
        <div className="space-y-6">
          <LLMCostTracker
            tenants={tenants}
            summary={summary}
            telemetryData={telemetryData?.data}
          />
        </div>
      )}

      {/* Drill-down Modal */}
      <TenantDetailModal
        tenant={selectedTenant}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onToggleAutonomy={handleToggleAutonomy}
        onTriggerHealthCheck={handleTriggerHealthCheck}
        onResetDailySends={handleResetDailySends}
        onUpdateLimits={handleUpdateLimits}
        onClearFailedQueue={handleClearFailedQueue}
      />
    </div>
  );
}
