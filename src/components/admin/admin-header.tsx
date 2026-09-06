'use client';

import React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ShieldAlert, 
  RefreshCw, 
  ArrowLeft, 
  Layers, 
  Cpu, 
  Coins, 
  Activity 
} from 'lucide-react';

interface AdminHeaderProps {
  systemStatus: 'healthy' | 'warning' | 'tripped' | 'loading';
  lastUpdated: string | null;
  onRefresh: () => void;
  isRefreshing: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function AdminHeader({
  systemStatus,
  lastUpdated,
  onRefresh,
  isRefreshing,
  activeTab,
  setActiveTab,
}: AdminHeaderProps) {
  const getStatusBadge = () => {
    switch (systemStatus) {
      case 'healthy':
        return (
          <Badge className="bg-emerald-950 text-emerald-400 border-emerald-800 text-xs px-3 py-1 font-mono flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            FLEET HEALTH: OPTIMAL
          </Badge>
        );
      case 'warning':
        return (
          <Badge className="bg-amber-950 text-amber-400 border-amber-800 text-xs px-3 py-1 font-mono flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            FLEET HEALTH: WARNING
          </Badge>
        );
      case 'tripped':
        return (
          <Badge className="bg-red-950 text-red-400 border-red-800 text-xs px-3 py-1 font-mono flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
            FLEET HEALTH: CIRCUIT TRIPPED
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-800 text-slate-400 border-slate-700 text-xs px-3 py-1 font-mono flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-slate-400 animate-spin" />
            CONNECTING...
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-4 border-b border-slate-800 pb-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-red-950/60 border border-red-800/60 text-red-400">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-3">
                Agency Multi-Tenant Operations Portal
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono font-normal">
                  v2.0 Platform Admin
                </span>
              </h1>
              <p className="text-slate-400 text-xs mt-0.5">
                Centralized fleet health, deliverability circuit breakers, Inngest orchestration, and tenant cost telemetry.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {getStatusBadge()}

          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-slate-100 text-xs h-8"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Link href="/dashboard">
            <Button
              variant="outline"
              size="sm"
              className="border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-slate-100 text-xs h-8"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              SDR Workspace
            </Button>
          </Link>
        </div>
      </div>

      {/* Admin Tab Navigation */}
      <div className="flex items-center gap-2 pt-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'overview'
              ? 'bg-slate-800 text-slate-100 border border-slate-700 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <Layers className="h-3.5 w-3.5 text-blue-400" />
          Fleet Overview & Tenants
        </button>

        <button
          onClick={() => setActiveTab('telemetry')}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'telemetry'
              ? 'bg-slate-800 text-slate-100 border border-slate-700 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <Cpu className="h-3.5 w-3.5 text-emerald-400" />
          Inngest & Redis Telemetry
        </button>

        <button
          onClick={() => setActiveTab('costs')}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'costs'
              ? 'bg-slate-800 text-slate-100 border border-slate-700 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <Coins className="h-3.5 w-3.5 text-amber-400" />
          Token & LLM Costs
        </button>
      </div>
    </div>
  );
}
