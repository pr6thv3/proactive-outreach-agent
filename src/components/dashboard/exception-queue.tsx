'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  AlertOctagon,
  RefreshCw,
  ArrowRight,
  ExternalLink,
  Info,
  Check,
  UserCheck,
  FileText,
  MailWarning,
  Sparkles,
} from 'lucide-react';
import {
  ActionBadgeType,
  ExceptionItem,
  ExceptionSeverity,
  generateActionBadge,
  getGuidedResolutionSteps,
} from '@/lib/policy/exception-service';

interface ExceptionQueueProps {
  initialExceptions?: ExceptionItem[];
  organizationId?: string;
  onResolved?: (exceptionId: string) => void;
}

export function ExceptionQueue({
  initialExceptions,
  organizationId,
  onResolved,
}: ExceptionQueueProps) {
  const [exceptions, setExceptions] = useState<ExceptionItem[]>(initialExceptions || []);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string>('ALL');

  useEffect(() => {
    if (initialExceptions) {
      setExceptions(initialExceptions);
    }
  }, [initialExceptions]);

  const criticalCount = exceptions.filter((e) => e.severity === 'CRITICAL').length;
  const highCount = exceptions.filter((e) => e.severity === 'HIGH').length;
  const mediumCount = exceptions.filter((e) => e.severity === 'MEDIUM').length;

  const filteredExceptions = exceptions.filter((item) => {
    if (filterSeverity === 'ALL') return true;
    return item.severity === filterSeverity;
  });

  const handleResolve = async (item: ExceptionItem) => {
    setResolvingId(item.id);
    try {
      if (item.remediationAction.endpoint && item.remediationAction.method !== 'GET') {
        await fetch(item.remediationAction.endpoint, {
          method: item.remediationAction.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.remediationAction.payload || {}),
        }).catch(() => {});
      }

      setExceptions((prev) => prev.filter((e) => e.id !== item.id));
      toast.success(`Resolved exception: "${item.title}"`);
      if (onResolved) onResolved(item.id);
    } catch {
      toast.error('Failed to resolve exception.');
    } finally {
      setResolvingId(null);
    }
  };

  const renderBadgeIcon = (type: ActionBadgeType) => {
    switch (type) {
      case 'CIRCUIT_BREAKER_TRIPPED':
      case 'EMERGENCY_STOP_ACTIVE':
        return <AlertOctagon className="h-4 w-4 text-red-400" />;
      case 'LEGAL_ESCALATION':
        return <ShieldAlert className="h-4 w-4 text-red-400" />;
      case 'UNVERIFIED_SENDER_DOMAIN':
        return <MailWarning className="h-4 w-4 text-red-400" />;
      case 'RISK_GATE_HOLD':
      case 'SPAM_RISK_ELEVATED':
        return <AlertTriangle className="h-4 w-4 text-amber-400" />;
      case 'LOW_CONFIDENCE_REVIEW':
        return <FileText className="h-4 w-4 text-amber-400" />;
      case 'SECONDARY_INTENT_REFERRAL':
        return <UserCheck className="h-4 w-4 text-blue-400" />;
      case 'RATE_LIMIT_NEAR_CEILING':
        return <Info className="h-4 w-4 text-blue-400" />;
    }
  };

  const getSeverityBadgeClass = (severity: ExceptionSeverity) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-red-950 text-red-300 border-red-800 font-bold';
      case 'HIGH':
        return 'bg-amber-950 text-amber-300 border-amber-800 font-semibold';
      case 'MEDIUM':
        return 'bg-blue-950 text-blue-300 border-blue-800';
      case 'INFO':
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── Header & Exception Counter Badges ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-400" />
            Exception Handling Queue
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Operator routine transforms from monitoring machine counters to resolving high-priority exceptions.
          </p>
        </div>

        {/* Severity Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setFilterSeverity('ALL')}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
              filterSeverity === 'ALL'
                ? 'bg-slate-800 border-slate-600 text-white'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-300'
            }`}
          >
            All ({exceptions.length})
          </button>
          {criticalCount > 0 && (
            <button
              type="button"
              onClick={() => setFilterSeverity('CRITICAL')}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                filterSeverity === 'CRITICAL'
                  ? 'bg-red-950 border-red-700 text-red-200 ring-1 ring-red-600'
                  : 'bg-slate-950 border-slate-800 text-red-400 hover:text-red-300'
              }`}
            >
              Critical ({criticalCount})
            </button>
          )}
          {highCount > 0 && (
            <button
              type="button"
              onClick={() => setFilterSeverity('HIGH')}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                filterSeverity === 'HIGH'
                  ? 'bg-amber-950 border-amber-700 text-amber-200 ring-1 ring-amber-600'
                  : 'bg-slate-950 border-slate-800 text-amber-400 hover:text-amber-300'
              }`}
            >
              High ({highCount})
            </button>
          )}
          {mediumCount > 0 && (
            <button
              type="button"
              onClick={() => setFilterSeverity('MEDIUM')}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                filterSeverity === 'MEDIUM'
                  ? 'bg-blue-950 border-blue-700 text-blue-200 ring-1 ring-blue-600'
                  : 'bg-slate-950 border-slate-800 text-blue-400 hover:text-blue-300'
              }`}
            >
              Medium ({mediumCount})
            </button>
          )}
        </div>
      </div>

      {/* ─── Zero State: All Policy Gates Passing ─── */}
      {exceptions.length === 0 ? (
        <Card className="border-emerald-800/80 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-emerald-950/20 text-slate-100 shadow-xl">
          <CardContent className="p-8 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-950 border border-emerald-700 text-emerald-400 shadow-lg">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-lg font-bold text-emerald-300">
                All 7 Policy Gates Passing — Agent Operating Smoothly
              </h3>
              <p className="text-xs text-slate-300">
                0 exceptions require operator intervention. The Autonomous AI SDR is actively researching, qualifying, and dispatching outreach within your configured guardrails.
              </p>
            </div>
            <div className="flex items-center justify-center gap-4 text-[11px] text-slate-400 pt-2">
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <Check className="h-3.5 w-3.5" /> Domain Reputation Healthy
              </span>
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <Check className="h-3.5 w-3.5" /> Quota In Bounds
              </span>
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <Check className="h-3.5 w-3.5" /> Zero Compliance Holds
              </span>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* ─── Exception Cards Deck ─── */
        <div className="space-y-4">
          {filteredExceptions.map((item) => (
            <Card
              key={item.id}
              className={`border transition-all duration-200 ${
                item.severity === 'CRITICAL'
                  ? 'border-red-800/90 bg-slate-950 shadow-red-950/20'
                  : item.severity === 'HIGH'
                  ? 'border-amber-800/80 bg-slate-950 shadow-amber-950/20'
                  : 'border-slate-800 bg-slate-950'
              } text-slate-100 shadow-lg`}
            >
              <CardHeader className="pb-3 border-b border-slate-900">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                      {renderBadgeIcon(item.type)}
                    </div>
                    <div>
                      <CardTitle className="text-base font-bold text-slate-100 flex items-center gap-2">
                        {item.title}
                      </CardTitle>
                      <CardDescription className="text-xs text-slate-400 mt-0.5">
                        Entity: <span className="font-mono text-slate-300">{item.entityType.toUpperCase()}</span>
                        {item.entityId ? ` (${item.entityId})` : ''}
                      </CardDescription>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge className={getSeverityBadgeClass(item.severity)}>
                      {item.badge.label}
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-4 pb-4 space-y-4">
                <p className="text-xs text-slate-300 leading-relaxed">
                  {item.summary}
                </p>

                {/* Guided Resolution Steps */}
                <div className="rounded-xl border border-slate-900 bg-slate-900/60 p-3.5 space-y-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                    Guided Step-by-Step Resolution:
                  </span>
                  <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-300">
                    {item.guidedSteps.map((step, idx) => (
                      <li key={idx} className="leading-relaxed">
                        <span className="text-slate-200">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </CardContent>

              <CardFooter className="pt-3 pb-3 border-t border-slate-900 flex justify-end gap-3 bg-slate-950/60">
                <Button
                  size="sm"
                  onClick={() => handleResolve(item)}
                  disabled={resolvingId === item.id}
                  className={
                    item.severity === 'CRITICAL'
                      ? 'bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-md'
                      : item.severity === 'HIGH'
                      ? 'bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md'
                      : 'bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md'
                  }
                >
                  {resolvingId === item.id ? (
                    <>
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Resolving...
                    </>
                  ) : (
                    <>
                      {item.remediationAction.label}
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
