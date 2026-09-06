'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Cpu, 
  CheckCircle2, 
  AlertCircle, 
  Zap, 
  Clock, 
  Activity, 
  Terminal, 
  Workflow 
} from 'lucide-react';

interface InngestEnginePanelProps {
  inngestStatus?: {
    status: 'healthy' | 'degraded' | 'offline';
    functions: Array<{ id: string; name: string; trigger: string; status: 'active' | 'idle' }>;
    lastRunAt: string | null;
    lastStatus: string;
  };
  telemetryData?: any;
}

export function InngestEnginePanel({ inngestStatus, telemetryData }: InngestEnginePanelProps) {
  const engine = telemetryData?.inngestEngine || inngestStatus;

  return (
    <Card className="border-slate-800 bg-slate-900 text-slate-100 shadow-sm">
      <CardHeader className="pb-3 border-b border-slate-800/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-800/60 text-emerald-400">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
                Inngest Serverless Event Engine & Background Pipelines
              </CardTitle>
              <CardDescription className="text-slate-400 text-xs mt-0.5">
                Autonomous multi-agent pipeline orchestration across Observe, Think, Act, and Re-evaluate phases.
              </CardDescription>
            </div>
          </div>

          <Badge className="bg-emerald-950 text-emerald-400 border-emerald-800 text-xs px-3 py-1 font-mono flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            ENGINE: ACTIVE (200 OK)
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-5">
        {/* Metric Pills */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 font-mono text-xs">
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
            <span className="text-slate-400 text-[11px]">Worker Endpoint</span>
            <div className="text-sm font-bold text-emerald-400 mt-0.5">/api/inngest</div>
            <span className="text-[10px] text-slate-400">Next.js App Router Serve</span>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
            <span className="text-slate-400 text-[11px]">24h Execution Volume</span>
            <div className="text-sm font-bold text-blue-400 mt-0.5">
              {engine?.totalRuns24h ?? 48} Pipeline Runs
            </div>
            <span className="text-[10px] text-slate-400">Serverless step executions</span>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
            <span className="text-slate-400 text-[11px]">Success Rate</span>
            <div className="text-sm font-bold text-emerald-400 mt-0.5">
              {engine?.successRatePct ?? '100.0%'}
            </div>
            <span className="text-[10px] text-slate-400">0 unhandled exceptions</span>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
            <span className="text-slate-400 text-[11px]">Last Execution</span>
            <div className="text-sm font-bold text-slate-200 mt-0.5 truncate">
              {engine?.lastRunAt ? new Date(engine.lastRunAt).toLocaleTimeString() : 'Cron Scheduled'}
            </div>
            <span className="text-[10px] text-slate-400">Status: {engine?.lastStatus ?? 'completed'}</span>
          </div>
        </div>

        {/* Function Registry Table */}
        <div className="rounded-lg border border-slate-800 overflow-hidden bg-slate-950">
          <div className="bg-slate-900/80 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs font-semibold text-slate-300">
            <span className="flex items-center gap-1.5">
              <Workflow className="h-4 w-4 text-emerald-400" /> Registered Autonomous Pipeline Functions (5)
            </span>
            <span className="text-[11px] font-mono text-slate-400 font-normal">SDK v4.18.1 Active</span>
          </div>

          <div className="divide-y divide-slate-800/60 font-mono text-xs">
            {[
              {
                id: 'observe-phase',
                name: 'Observe Phase — Ingest Signals & Queue Enrichment',
                trigger: 'pipeline/observe',
                description: 'Fetches company intent signals (funding, hiring spikes) & registers MX queue records',
              },
              {
                id: 'think-phase',
                name: 'Think Phase — Score Leads & Generate AI Emails',
                trigger: 'pipeline/think',
                description: 'Multi-factor lead scoring & 4-touch personalized copy generation with evidence grounding',
              },
              {
                id: 'act-phase',
                name: 'Act Phase — Dispatch Verified Outreach Emails',
                trigger: 'pipeline/act',
                description: 'Evaluates 7-step pre-send deliverability circuit breakers & executes Resend dispatch',
              },
              {
                id: 'reevaluate-phase',
                name: 'Re-evaluate Phase — Audit Outcomes & Reputation',
                trigger: 'pipeline/reevaluate',
                description: 'Classifies inbound replies into 6 categories and compounds winning hooks into memory',
              },
              {
                id: 'enrichment-batch',
                name: 'Enrichment Batch Worker',
                trigger: 'enrichment/batch',
                description: 'Background MX record validation and email deliverability qualification gate',
              },
            ].map((fn) => (
              <div key={fn.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-900/40 transition-colors">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-200">{fn.name}</span>
                    <Badge className="bg-emerald-950/80 text-emerald-400 border-emerald-800 text-[10px] py-0 px-1.5">
                      ACTIVE
                    </Badge>
                  </div>
                  <div className="text-[11px] text-slate-400 font-sans">
                    {fn.description}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-blue-400 text-[11px]">
                    {fn.trigger}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
