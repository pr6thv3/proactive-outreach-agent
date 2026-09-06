// ─── INFRASTRUCTURE: Observability ─────────────────────
// Structured logs, distributed traces, pipeline metrics
// Makes agent systems debuggable

import { db } from '@/lib/db';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface StructuredLog {
  timestamp: string;
  level: LogLevel;
  message: string;
  agent?: string;
  phase?: string;
  leadId?: string;
  campaignId?: string;
  traceId?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface PipelineMetrics {
  phase: string;
  agentName: string;
  successRate: number;   // 0-1
  avgDurationMs: number;
  p50DurationMs: number;
  p99DurationMs: number;
  totalRuns: number;
  failureCount: number;
  lastRunAt: Date | null;
}

class Logger {
  private traceId: string | null = null;

  setTraceId(traceId: string): void {
    this.traceId = traceId;
  }

  getTraceId(): string | null {
    return this.traceId;
  }

  debug(message: string, data?: Omit<StructuredLog, 'timestamp' | 'level' | 'message'>): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: Omit<StructuredLog, 'timestamp' | 'level' | 'message'>): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: Omit<StructuredLog, 'timestamp' | 'level' | 'message'>): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: Omit<StructuredLog, 'timestamp' | 'level' | 'message'>): void {
    this.log('error', message, data);
  }

  fatal(message: string, data?: Omit<StructuredLog, 'timestamp' | 'level' | 'message'>): void {
    this.log('fatal', message, data);
  }

  private log(level: LogLevel, message: string, data?: Omit<StructuredLog, 'timestamp' | 'level' | 'message'>): void {
    const entry: StructuredLog = {
      timestamp: new Date().toISOString(),
      level,
      message,
      traceId: this.traceId || data?.traceId || undefined,
      ...data,
    };

    // Console output (structured JSON) — suppress debug/info in production
    const isProd = process.env.NODE_ENV === 'production';
    const shouldLog = isProd ? (level === 'error' || level === 'fatal' || level === 'warn') : true;
    const consoleLevel = level === 'debug' ? 'log' : level === 'fatal' ? 'error' : level;
    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]${entry.agent ? ` [${entry.agent}]` : ''}${entry.traceId ? ` [trace:${entry.traceId.slice(0, 8)}]` : ''}`;

    if (shouldLog) {
      if (level === 'error' || level === 'fatal') {
        console.error(`${prefix} ${message}`, data?.error || '', data?.metadata || '');
      } else if (level === 'warn') {
        console.warn(`${prefix} ${message}`, data?.metadata || '');
      } else {
        console.log(`${prefix} ${message}`, data?.metadata || '');
      }
    }

    // Store critical logs in pipeline run (if traceId is set)
    // This allows debugging specific pipeline runs later
    if (this.traceId && (level === 'error' || level === 'fatal' || level === 'warn')) {
      this.persistLog(entry).catch(() => {
        // Don't let logging failures break the pipeline
      });
    }
  }

  private async persistLog(entry: StructuredLog): Promise<void> {
    try {
      // Find the pipeline run with this trace ID and append the log
      const run = await db.pipelineRun.findFirst({
        where: { traceId: entry.traceId },
        orderBy: { createdAt: 'desc' },
      });

      if (run) {
        const existingLogs = run.logs ? JSON.parse(run.logs) : [];
        existingLogs.push(entry);
        await db.pipelineRun.update({
          where: { id: run.id },
          data: { logs: JSON.stringify(existingLogs.slice(-50)) }, // Keep last 50 logs
        });
      }
    } catch {
      // Silently fail — observability shouldn't break the system
    }
  }
}

// ─── Singleton Logger ──────────────────────────────────
export const logger = new Logger();

// ─── Pipeline Metrics ──────────────────────────────────
export async function getPipelineMetrics(hours = 24): Promise<PipelineMetrics[]> {
  const since = new Date(Date.now() - hours * 3600000);

  const runs = await db.pipelineRun.findMany({
    where: { createdAt: { gte: since } },
  });

  // Group by phase + agent
  const groups = new Map<string, Array<{ success: boolean; durationMs: number | null; createdAt: Date }>>();

  for (const run of runs) {
    const key = `${run.phase}:${run.agentName || 'unknown'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({
      success: run.status === 'completed',
      durationMs: run.durationMs,
      createdAt: run.createdAt,
    });
  }

  const metrics: PipelineMetrics[] = [];

  for (const [key, groupRuns] of groups) {
    const [phase, agentName] = key.split(':');
    const successCount = groupRuns.filter(r => r.success).length;
    const durations = groupRuns.map(r => r.durationMs || 0).filter(d => d > 0).sort((a, b) => a - b);

    metrics.push({
      phase,
      agentName,
      successRate: groupRuns.length > 0 ? successCount / groupRuns.length : 0,
      avgDurationMs: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
      p50DurationMs: durations.length > 0 ? durations[Math.floor(durations.length * 0.5)] : 0,
      p99DurationMs: durations.length > 0 ? durations[Math.floor(durations.length * 0.99)] : 0,
      totalRuns: groupRuns.length,
      failureCount: groupRuns.length - successCount,
      lastRunAt: groupRuns.length > 0 ? groupRuns[groupRuns.length - 1].createdAt : null,
    });
  }

  return metrics;
}

// ─── Generate Trace ID ─────────────────────────────────
export function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Atomic AgentEvent Persistence ─────────────────────
export interface AgentEventRecordParams {
  organizationId?: string;
  pipelineRunId?: string;
  leadId?: string;
  campaignId?: string;
  agentName: string;
  stepName?: string;
  phase?: string;
  level?: LogLevel;
  message?: string;
  inputData?: unknown;
  outputData?: unknown;
  status?: string;
  traceId?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  error?: string;
}

export async function recordAgentEvent(params: AgentEventRecordParams): Promise<any> {
  try {
    const sanitizeJson = (val: unknown) => {
      if (val === undefined || val === null) return undefined;
      if (typeof val === 'string') {
        try {
          return JSON.parse(val);
        } catch {
          return val;
        }
      }
      return val;
    };

    return await db.agentEvent.create({
      data: {
        organizationId: params.organizationId,
        pipelineRunId: params.pipelineRunId,
        leadId: params.leadId,
        campaignId: params.campaignId,
        agentName: params.agentName,
        stepName: params.stepName || params.agentName,
        phase: params.phase,
        level: params.level || 'info',
        message: params.message || `${params.agentName} ${params.stepName || ''}`.trim(),
        inputData: sanitizeJson(params.inputData),
        outputData: sanitizeJson(params.outputData),
        status: params.status || 'completed',
        traceId: params.traceId || logger.getTraceId() || undefined,
        durationMs: params.durationMs,
        metadata: params.metadata,
        error: params.error,
      },
    });
  } catch {
    // Silently fail so logging failures never break agent execution
    return null;
  }
}
