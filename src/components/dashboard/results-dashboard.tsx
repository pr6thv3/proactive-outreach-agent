'use client';

import { useDashboardStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import {
  Search,
  Mail,
  Send,
  MessageSquare,
  Calendar,
  DollarSign,
  ArrowRight,
  Target,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';

// ─── Helpers ────────────────────────────────────────
function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function positiveRateColor(rate: number): { text: string; bg: string } {
  if (rate >= 20) return { text: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' };
  if (rate >= 10) return { text: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' };
  return { text: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' };
}

function bounceRateColor(rate: number): { text: string; bg: string } {
  if (rate < 3) return { text: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' };
  if (rate < 8) return { text: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' };
  return { text: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' };
}

// ─── Funnel Step ────────────────────────────────────
interface FunnelStep {
  icon: React.ElementType;
  label: string;
  value: number;
  sub?: string;
  color: string;
  iconBg: string;
}

function FunnelStepCard({ step, isLast }: { step: FunnelStep; isLast: boolean }) {
  return (
    <div className="flex items-center gap-1 min-w-0 flex-1">
      <Card className={`p-3 ${step.iconBg} border backdrop-blur-sm flex-1 min-w-0`}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-slate-400 font-medium truncate">{step.label}</span>
          <step.icon className={`w-4 h-4 ${step.color} shrink-0`} />
        </div>
        <div className="text-xl font-bold text-white">{fmt(step.value)}</div>
        {step.sub && <div className="text-[10px] text-slate-500 mt-0.5 truncate">{step.sub}</div>}
      </Card>
      {!isLast && (
        <ArrowRight className="w-4 h-4 text-slate-600 shrink-0 hidden sm:block" />
      )}
    </div>
  );
}

// ─── Key Metric Card ────────────────────────────────
interface KeyMetric {
  label: string;
  value: number;
  isInverse: boolean; // true = lower is better (e.g. bounce rate)
  description: string;
}

function KeyMetricCard({ metric }: { metric: KeyMetric }) {
  const colors = metric.isInverse ? bounceRateColor(metric.value) : positiveRateColor(metric.value);
  return (
    <Card className={`p-4 ${colors.bg} border`}>
      <div className="text-xs text-slate-400 font-medium mb-2">{metric.label}</div>
      <div className={`text-3xl font-bold ${colors.text}`}>
        {metric.value.toFixed(1)}%
      </div>
      <div className="text-[10px] text-slate-500 mt-1">{metric.description}</div>
    </Card>
  );
}

// ─── Main Component ─────────────────────────────────
export function ResultsDashboard() {
  const { stats } = useDashboardStore();
  const r = stats?.resultsLoop;
  const d = stats?.deliverability;

  // ─── Funnel Steps ───
  const funnelSteps: FunnelStep[] = [
    { icon: Search, label: 'Signals Found', value: r?.signalsFound ?? 0, color: 'text-amber-400', iconBg: 'bg-amber-500/10 border-amber-500/20' },
    { icon: Mail, label: 'Emails Generated', value: r?.emailsGenerated ?? 0, color: 'text-blue-400', iconBg: 'bg-blue-500/10 border-blue-500/20' },
    { icon: Send, label: 'Emails Sent', value: r?.emailsSent ?? 0, sub: r?.deliveryRate ? `${r.deliveryRate.toFixed(0)}% delivered` : undefined, color: 'text-purple-400', iconBg: 'bg-purple-500/10 border-purple-500/20' },
    { icon: MessageSquare, label: 'Replies', value: r?.repliesReceived ?? 0, sub: r?.replyRate ? `${r.replyRate.toFixed(0)}% reply rate` : undefined, color: 'text-emerald-400', iconBg: 'bg-emerald-500/10 border-emerald-500/20' },
    { icon: Calendar, label: 'Meetings', value: r?.meetingsBooked ?? 0, color: 'text-teal-400', iconBg: 'bg-teal-500/10 border-teal-500/20' },
    { icon: DollarSign, label: 'Revenue', value: 0, color: 'text-emerald-400', iconBg: 'bg-emerald-500/10 border-emerald-500/20' },
  ];

  // ─── Key Metrics ───
  const keyMetrics: KeyMetric[] = [
    { label: 'Open Rate', value: d?.openRate ?? r?.openRate ?? 0, isInverse: false, description: 'Emails opened vs delivered' },
    { label: 'Reply Rate', value: r?.replyRate ?? 0, isInverse: false, description: 'Replies received vs emails sent' },
    { label: 'Positive Reply Rate', value: r?.positiveReplyRate ?? 0, isInverse: false, description: 'THE metric that proves it works' },
    { label: 'Conversion Rate', value: r?.positiveReplyRate ?? 0, isInverse: false, description: 'Meetings from positive replies' },
    { label: 'Bounce Rate', value: d?.bounceRate ?? r?.bounceRate ?? 0, isInverse: true, description: 'Lower is better' },
  ];

  const positiveReplyRate = r?.positiveReplyRate ?? 0;
  const prColor = positiveRateColor(positiveReplyRate);

  return (
    <div className="space-y-5">
      {/* ─── Results Loop Funnel ─── */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          Results Loop
        </h3>
        <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin">
          {funnelSteps.map((step, i) => (
            <FunnelStepCard key={step.label} step={step} isLast={i === funnelSteps.length - 1} />
          ))}
        </div>
      </div>

      {/* ─── Key Metrics ─── */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Target className="w-4 h-4 text-amber-400" />
          Key Metrics
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {keyMetrics.map(m => (
            <KeyMetricCard key={m.label} metric={m} />
          ))}
        </div>
      </div>

      {/* ─── What Matters ─── */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          What Matters
        </h3>
        <Card className="p-6 bg-slate-900/50 border-amber-500/20">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <div className="text-sm text-slate-300 mb-1">The metric that matters:</div>
              <div className="text-lg font-bold text-amber-400 flex items-center gap-2">
                Positive Reply Rate
                <CheckCircle className="w-5 h-5 text-amber-400" />
              </div>
              <p className="text-xs text-slate-400 mt-2 max-w-lg">
                This is the number that proves the entire system works. It means your signals found the right people,
                your emails reached their inbox, your copy resonated, and they want to talk. Every other metric
                is just a proxy for this one.
              </p>
            </div>
            <div className={`p-4 rounded-lg border ${prColor.bg} text-center shrink-0`}>
              <div className={`text-4xl font-bold ${prColor.text}`}>
                {positiveReplyRate.toFixed(1)}%
              </div>
              <div className="text-[10px] text-slate-400 mt-1">Positive Reply Rate</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
