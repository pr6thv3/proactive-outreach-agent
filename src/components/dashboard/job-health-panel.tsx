'use client';

import { useEffect } from 'react';
import { useDashboardStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Cpu,
  Loader2,
  RefreshCw,
  Server,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';

export function JobHealthPanel() {
  const { jobHealth, fetchJobHealth } = useDashboardStore();

  useEffect(() => {
    fetchJobHealth();
    const interval = setInterval(fetchJobHealth, 15000);
    return () => clearInterval(interval);
  }, [fetchJobHealth]);

  if (!jobHealth) {
    return (
      <Card className="bg-slate-900/50 border-slate-700/50 p-8 text-center">
        <Loader2 className="w-6 h-6 text-slate-500 mx-auto mb-2 animate-spin" />
        <p className="text-sm text-slate-500">Loading job health...</p>
      </Card>
    );
  }

  const redis = jobHealth.redis;
  const totals = jobHealth.totals;
  const queues = jobHealth.queues || [];
  const recentJobs = jobHealth.recentJobs || [];
  const hasStaleJobs = totals.stale > 0;
  const hasDeadJobs = totals.dead > 0;
  const hasFailedJobs = totals.failed > 0;

  return (
    <div className="space-y-4">
      {/* Redis Status Banner */}
      <Card className={`p-4 border ${
        redis.connected
          ? 'bg-emerald-500/5 border-emerald-500/20'
          : redis.configured
            ? 'bg-red-500/10 border-red-500/30'
            : 'bg-amber-500/10 border-amber-500/30'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {redis.connected ? (
              <Wifi className="w-5 h-5 text-emerald-400" />
            ) : (
              <WifiOff className="w-5 h-5 text-red-400" />
            )}
            <div>
              <div className="text-sm font-medium text-white flex items-center gap-2">
                Redis {redis.connected ? 'Connected' : redis.configured ? 'Disconnected' : 'Not Configured'}
                {redis.latencyMs !== undefined && redis.connected && (
                  <Badge className="text-[9px] h-4 bg-slate-800 text-emerald-300 border border-slate-700">
                    {redis.latencyMs}ms latency
                  </Badge>
                )}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {redis.connected
                  ? 'BullMQ workers are active and processing jobs in real-time.'
                  : redis.configured
                    ? `Connection error: ${redis.error || 'Unknown'}. Jobs will queue to database fallback.`
                    : 'REDIS_URL not set. Jobs are queued to the database (queued_without_redis).'}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => fetchJobHealth()}
            className="h-7 text-xs text-slate-400 hover:text-white"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Refresh
          </Button>
        </div>
      </Card>

      {/* Warning Banners */}
      {!redis.configured && (
        <Card className="p-3 bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-center gap-2 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              <strong>queued_without_redis</strong> — Jobs are saved to the database but won&apos;t process
              until a Redis-backed worker is running. Set <code className="text-amber-200">REDIS_URL</code> to enable real-time processing.
            </span>
          </div>
        </Card>
      )}

      {hasStaleJobs && (
        <Card className="p-3 bg-red-500/10 border border-red-500/30">
          <div className="flex items-center gap-2 text-xs text-red-300">
            <Clock className="w-4 h-4 shrink-0" />
            <span>
              <strong>{totals.stale} stale job{totals.stale > 1 ? 's' : ''}</strong> detected — these have been pending for too long.
              Check if the worker process is running.
            </span>
          </div>
        </Card>
      )}

      {/* Queue Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: 'Pending', count: totals.pending, icon: Clock, color: 'text-slate-400', bg: 'bg-slate-500/10' },
          { label: 'Running', count: totals.running, icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'Completed', count: totals.completed, icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Failed', count: totals.failed, icon: XCircle, color: hasFailedJobs ? 'text-amber-400' : 'text-slate-500', bg: hasFailedJobs ? 'bg-amber-500/10' : 'bg-slate-500/10' },
          { label: 'Dead', count: totals.dead, icon: XCircle, color: hasDeadJobs ? 'text-red-400' : 'text-slate-500', bg: hasDeadJobs ? 'bg-red-500/10' : 'bg-slate-500/10' },
          { label: 'Stale', count: totals.stale, icon: AlertTriangle, color: hasStaleJobs ? 'text-red-400' : 'text-slate-500', bg: hasStaleJobs ? 'bg-red-500/10' : 'bg-slate-500/10' },
        ].map(item => (
          <Card key={item.label} className={`p-3 ${item.bg} border-slate-700/50`}>
            <div className="flex items-center gap-2 mb-1">
              <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
              <span className="text-[10px] text-slate-400">{item.label}</span>
            </div>
            <div className={`text-lg font-bold ${item.color}`}>{item.count}</div>
          </Card>
        ))}
      </div>

      {/* Per-Queue Breakdown */}
      {queues.length > 0 && (
        <Card className="bg-slate-900/50 border-slate-700/50 overflow-hidden">
          <div className="p-3 border-b border-slate-800 bg-slate-800/30">
            <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Server className="w-3.5 h-3.5 text-slate-400" />
              Queue Breakdown
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800/50 text-slate-500 text-[10px]">
                  <th className="text-left p-2.5 font-medium">Queue</th>
                  <th className="text-right p-2.5 font-medium">Waiting</th>
                  <th className="text-right p-2.5 font-medium">Active</th>
                  <th className="text-right p-2.5 font-medium">Completed</th>
                  <th className="text-right p-2.5 font-medium">Failed</th>
                  <th className="text-right p-2.5 font-medium">Delayed</th>
                </tr>
              </thead>
              <tbody>
                {queues.map(q => (
                  <tr key={q.name} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                    <td className="p-2.5 text-slate-300 font-mono">{q.name}</td>
                    <td className="p-2.5 text-right text-slate-400">{q.waiting}</td>
                    <td className="p-2.5 text-right text-blue-400">{q.active}</td>
                    <td className="p-2.5 text-right text-emerald-400">{q.completed}</td>
                    <td className="p-2.5 text-right text-amber-400">{q.failed}</td>
                    <td className="p-2.5 text-right text-slate-400">{q.delayed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Recent Jobs */}
      <Card className="bg-slate-900/50 border-slate-700/50 overflow-hidden">
        <div className="p-3 border-b border-slate-800 bg-slate-800/30">
          <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-slate-400" />
            Recent Jobs
          </h3>
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {recentJobs.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              <Cpu className="w-6 h-6 mx-auto mb-2 text-slate-600" />
              No recent jobs found
            </div>
          ) : (
            <div className="divide-y divide-slate-800/30">
              {recentJobs.map(job => (
                <div key={job.id} className="p-2.5 flex items-center justify-between text-[11px] hover:bg-slate-800/20">
                  <div className="flex items-center gap-2">
                    <Badge className={`text-[8px] h-3.5 px-1 ${
                      job.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' :
                      job.status === 'running' ? 'bg-blue-500/15 text-blue-400 border-blue-500/20' :
                      job.status === 'failed' ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' :
                      job.status === 'dead' ? 'bg-red-500/15 text-red-400 border-red-500/20' :
                      'bg-slate-500/15 text-slate-400 border-slate-500/20'
                    }`}>
                      {job.status}
                    </Badge>
                    <span className="text-slate-300 font-mono">{job.type}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[9px] text-slate-500">
                    {job.traceId && <span className="font-mono truncate max-w-[120px]">{job.traceId}</span>}
                    <span>{new Date(job.createdAt).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Debug Footer */}
      <div className="text-[9px] text-slate-600 font-mono flex justify-between">
        <span>Trace: {jobHealth.traceId}</span>
        <span>Auto-refresh: 15s</span>
      </div>
    </div>
  );
}
