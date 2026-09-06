'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Database, 
  Activity, 
  Clock, 
  ShieldCheck, 
  Sliders, 
  Gauge,
  KeyRound
} from 'lucide-react';

interface RedisTelemetryPanelProps {
  redisTelemetry?: {
    status: 'connected' | 'in_memory_fallback';
    rateLimiterStatus: 'active' | 'inactive';
    dailyCounterKeysActive: number;
    jitterRange: string;
  };
  telemetryData?: any;
}

export function RedisTelemetryPanel({ redisTelemetry, telemetryData }: RedisTelemetryPanelProps) {
  const telemetry = telemetryData?.redisTelemetry || redisTelemetry;
  const isConnected = telemetry?.status === 'connected';

  return (
    <Card className="border-slate-800 bg-slate-900 text-slate-100 shadow-sm">
      <CardHeader className="pb-3 border-b border-slate-800/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-950/60 border border-amber-800/60 text-amber-400">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
                Upstash Redis Rate Limiting & Send Cadence Telemetry
              </CardTitle>
              <CardDescription className="text-slate-400 text-xs mt-0.5">
                Atomic counter tracking with 25h TTL, dynamic ±15% ISP jitter, and sliding window rate limits.
              </CardDescription>
            </div>
          </div>

          <Badge className={`text-xs px-3 py-1 font-mono flex items-center gap-1.5 ${
            isConnected
              ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
              : 'bg-blue-950 text-blue-400 border-blue-800'
          }`}>
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            {isConnected ? 'UPSTASH REDIS: REST SDK' : 'DEV IN-MEMORY FALLBACK'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-5">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 font-mono text-xs">
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
            <span className="text-slate-400 text-[11px]">Daily Send Key Format</span>
            <div className="text-xs font-bold text-amber-400 mt-1 truncate">org:*:sends:YYYY-MM-DD</div>
            <span className="text-[10px] text-slate-400">25-Hour Atomic TTL</span>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
            <span className="text-slate-400 text-[11px]">Active Tenant Counters</span>
            <div className="text-sm font-bold text-blue-400 mt-0.5">
              {telemetry?.dailyCounterKeysActive ?? 1} Keys Tracked
            </div>
            <span className="text-[10px] text-slate-400">0 Quota overruns</span>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
            <span className="text-slate-400 text-[11px]">ISP Send Jitter</span>
            <div className="text-sm font-bold text-emerald-400 mt-0.5">
              ±15% Dynamic Jitter
            </div>
            <span className="text-[10px] text-slate-400">Anti-Spam Filter Bypass</span>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
            <span className="text-slate-400 text-[11px]">Minimum Interval</span>
            <div className="text-sm font-bold text-purple-400 mt-0.5">
              30.0 Seconds
            </div>
            <span className="text-[10px] text-slate-400">Per-sender spacing</span>
          </div>
        </div>

        {/* Configuration Overview */}
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 space-y-3 font-mono text-xs">
          <h4 className="font-semibold text-slate-300 font-sans flex items-center gap-1.5">
            <Sliders className="h-4 w-4 text-amber-400" /> Active Platform Throttling Policies
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-900 border border-slate-800 rounded">
              <div className="text-slate-300 font-bold">API Ingestion Rate</div>
              <div className="text-slate-400 text-[11px] mt-1">100 requests / minute per IP</div>
              <div className="text-slate-400 text-[11px]">1,000 requests / min per Org</div>
            </div>

            <div className="p-3 bg-slate-900 border border-slate-800 rounded">
              <div className="text-slate-300 font-bold">Deliverability Pacing</div>
              <div className="text-slate-400 text-[11px] mt-1">20 sends / hour max per inbox</div>
              <div className="text-slate-400 text-[11px]">Hourly burst protection</div>
            </div>

            <div className="p-3 bg-slate-900 border border-slate-800 rounded">
              <div className="text-slate-300 font-bold">Circuit Auto-Pause</div>
              <div className="text-slate-400 text-[11px] mt-1">Trip on &gt; 3% simulated bounce</div>
              <div className="text-slate-400 text-[11px]">Trip on &gt; 0.1% spam complaint</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
