'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Globe,
  Target,
  Users,
  Rocket,
  CheckCircle2,
  Circle,
  ArrowRight,
  Sparkles,
  X,
} from 'lucide-react';

const STEPS = [
  {
    id: 1,
    title: 'Set Up Outreach Identity',
    description: 'Create an instant sandbox domain or connect your custom sending domain.',
    href: '/dashboard/domains',
    cta: 'Set Up Domain',
    icon: Globe,
    color: 'blue',
  },
  {
    id: 2,
    title: 'Define Your Outreach Goal',
    description: 'Describe your target market in plain English and the AI generates your ICP & sequence.',
    href: '/dashboard/icp',
    cta: 'Define ICP',
    icon: Target,
    color: 'purple',
  },
  {
    id: 3,
    title: 'Discover Your First Prospects',
    description: 'The AI SDR finds and researches high-intent prospects matching your ICP criteria.',
    href: '/dashboard/prospects',
    cta: 'Discover Prospects',
    icon: Users,
    color: 'emerald',
  },
  {
    id: 4,
    title: 'Review & Launch Campaign',
    description: 'Approve AI-drafted outreach in 5 seconds, or switch to full Autopilot.',
    href: '/dashboard/review',
    cta: 'Review & Launch',
    icon: Rocket,
    color: 'amber',
  },
];

export function QuickStartChecklist() {
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const allComplete = completedSteps.length >= 4;

  const handleMarkComplete = (stepId: number) => {
    if (!completedSteps.includes(stepId)) {
      setCompletedSteps(prev => [...prev, stepId]);
      if (completedSteps.length + 1 >= 4) {
        toast.success('🎉 Setup complete! Your AI SDR is ready to start autonomous prospecting.');
      }
    }
  };

  const progress = Math.round((completedSteps.length / 4) * 100);

  return (
    <div className="rounded-xl border border-blue-900/60 bg-gradient-to-r from-blue-950/30 via-slate-900 to-indigo-950/30 p-5 space-y-4 shadow-xl relative">
      {/* Dismiss Button */}
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 text-slate-500 hover:text-slate-300 transition-colors"
        aria-label="Dismiss checklist"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Header */}
      <div className="flex items-center justify-between pr-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 shadow-md shadow-blue-900/50">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">Quick-Start Setup</h3>
            <p className="text-[11px] text-slate-400">Get your AI SDR running in under 60 seconds</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-slate-400">{progress}%</span>
        </div>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {STEPS.map((step) => {
          const Icon = step.icon;
          const isComplete = completedSteps.includes(step.id);
          const isNext = !isComplete && (step.id === 1 || completedSteps.includes(step.id - 1));

          return (
            <div
              key={step.id}
              className={`rounded-lg border p-3 transition-all ${
                isComplete
                  ? 'border-emerald-800/60 bg-emerald-950/20'
                  : isNext
                  ? 'border-blue-800/60 bg-blue-950/20 ring-1 ring-blue-500/30'
                  : 'border-slate-800/60 bg-slate-950/40'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className={`flex h-6 w-6 items-center justify-center rounded-md ${
                  isComplete ? 'bg-emerald-900 text-emerald-400' : isNext ? 'bg-blue-900 text-blue-400' : 'bg-slate-800 text-slate-500'
                }`}>
                  {isComplete ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                </div>
                <Badge className={`text-[9px] px-1.5 py-0 ${
                  isComplete
                    ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                    : isNext
                    ? 'bg-blue-950 text-blue-400 border-blue-800'
                    : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}>
                  {isComplete ? 'Done' : isNext ? 'Next' : `Step ${step.id}`}
                </Badge>
              </div>

              <h4 className={`text-xs font-semibold mb-1 ${isComplete ? 'text-emerald-300 line-through' : 'text-slate-200'}`}>
                {step.title}
              </h4>
              <p className="text-[10px] text-slate-400 leading-relaxed mb-2.5">
                {step.description}
              </p>

              {isComplete ? (
                <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Completed
                </span>
              ) : (
                <Link href={step.href}>
                  <Button
                    size="sm"
                    onClick={() => handleMarkComplete(step.id)}
                    className={`w-full h-7 text-[11px] font-semibold ${
                      isNext
                        ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-900/40'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    {step.cta} <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {allComplete && (
        <div className="text-center pt-2">
          <p className="text-xs text-emerald-400 font-semibold">🎉 All set! Your AI SDR is running autonomously.</p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDismissed(true)}
            className="text-slate-400 text-xs mt-1 hover:text-slate-200"
          >
            Dismiss checklist
          </Button>
        </div>
      )}
    </div>
  );
}
