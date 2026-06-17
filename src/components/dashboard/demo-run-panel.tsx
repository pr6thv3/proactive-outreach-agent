'use client';

import { useState } from 'react';
import { useDashboardStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowRight,
  CheckCircle,
  Circle,
  Eye,
  FileText,
  Loader2,
  Mail,
  Rocket,
  Send,
  Shield,
  Sparkles,
  Target,
  Upload,
  Zap,
} from 'lucide-react';

type StepStatus = 'pending' | 'running' | 'done' | 'error';

interface DemoStep {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  status: StepStatus;
  result?: string;
}

const INITIAL_STEPS: DemoStep[] = [
  { id: 'sample', label: '1. Load Sample Leads', description: 'Import 3 sample leads with signals', icon: Upload, status: 'pending' },
  { id: 'observe', label: '2. Run Signal Intelligence', description: 'Scrape & detect buying signals for each lead', icon: Eye, status: 'pending' },
  { id: 'rank', label: '3. View Ranked Leads', description: 'See leads ranked by signal score & urgency', icon: Target, status: 'pending' },
  { id: 'draft', label: '4. Generate AI Drafts', description: 'Create evidence-backed email drafts for top leads', icon: Sparkles, status: 'pending' },
  { id: 'review', label: '5. Review Citations', description: 'Check evidence snapshots & citation quality', icon: FileText, status: 'pending' },
  { id: 'approve', label: '6. Approve Drafts', description: 'Human-in-the-loop approval gate', icon: CheckCircle, status: 'pending' },
  { id: 'readiness', label: '7. Run Readiness Checks', description: 'Evaluate send-readiness (safe/warn/block)', icon: Shield, status: 'pending' },
  { id: 'send', label: '8. Send or View Blocked', description: 'Safe sends proceed, blocked sends show why', icon: Send, status: 'pending' },
  { id: 'results', label: '9. Watch Results Loop', description: 'Monitor jobs, webhooks, and result metrics', icon: Zap, status: 'pending' },
];

export function DemoRunPanel() {
  const {
    stats,
    leads,
    messages,
    addSampleData,
    runObserve,
    batchGenerate,
    approveMessage,
    sendMessage,
    refreshAll,
    setActiveTab,
    addToast,
  } = useDashboardStore();

  const [steps, setSteps] = useState<DemoStep[]>(INITIAL_STEPS);
  const [activeStep, setActiveStep] = useState<string | null>(null);

  const updateStep = (id: string, updates: Partial<DemoStep>) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const completedSteps = steps.filter(s => s.status === 'done').length;
  const progressPercent = Math.round((completedSteps / steps.length) * 100);

  // Step Handlers
  const runStep = async (stepId: string) => {
    setActiveStep(stepId);
    updateStep(stepId, { status: 'running' });

    try {
      switch (stepId) {
        case 'sample': {
          await addSampleData();
          await refreshAll();
          updateStep(stepId, { status: 'done', result: 'Sample leads loaded with signals' });
          break;
        }
        case 'observe': {
          const targetLeads = leads.filter(l => l.status === 'new').slice(0, 5);
          if (targetLeads.length === 0) {
            updateStep(stepId, { status: 'done', result: 'No new leads to observe (already enriched)' });
            break;
          }
          for (const lead of targetLeads) {
            await runObserve(lead.id);
          }
          await refreshAll();
          updateStep(stepId, { status: 'done', result: `Observed ${targetLeads.length} leads` });
          break;
        }
        case 'rank': {
          await refreshAll();
          const ranked = [...leads].sort((a, b) => b.leadScore - a.leadScore);
          const top = ranked.slice(0, 5);
          const summary = top.map(l => `${l.name} (${l.leadScore.toFixed(0)})`).join(', ');
          updateStep(stepId, { status: 'done', result: summary || 'View leads in the Leads tab' });
          break;
        }
        case 'draft': {
          const topLeads = [...leads].sort((a, b) => b.leadScore - a.leadScore).slice(0, 5);
          const draftableIds = topLeads.filter(l => !messages.some(m => m.lead.id === l.id)).map(l => l.id);
          if (draftableIds.length > 0) {
            await batchGenerate(draftableIds);
          }
          await refreshAll();
          updateStep(stepId, { status: 'done', result: `Generated drafts for ${draftableIds.length} leads` });
          break;
        }
        case 'review': {
          await refreshAll();
          const withEvidence = messages.filter(m => m.evidenceSnapshot?.signals?.length);
          updateStep(stepId, {
            status: 'done',
            result: `${withEvidence.length} messages have cited evidence. Review in Approval Queue tab.`,
          });
          break;
        }
        case 'approve': {
          const generated = messages.filter(m => m.status === 'generated');
          for (const msg of generated.slice(0, 5)) {
            await approveMessage(msg.id);
          }
          await refreshAll();
          updateStep(stepId, { status: 'done', result: `Approved ${Math.min(generated.length, 5)} messages` });
          break;
        }
        case 'readiness': {
          await refreshAll();
          const approved = messages.filter(m => m.status === 'approved');
          const checks: string[] = [];
          for (const msg of approved.slice(0, 3)) {
            try {
              const res = await fetch(`/api/messages/${msg.id}/send-readiness`);
              if (res.ok) {
                const data = await res.json();
                const status = data.data?.ready ? '✅' : '🚫';
                checks.push(`${msg.lead?.name}: ${status}`);
              }
            } catch { /* continue */ }
          }
          updateStep(stepId, { status: 'done', result: checks.join(', ') || 'No approved messages to check' });
          break;
        }
        case 'send': {
          const approved = messages.filter(m => m.status === 'approved');
          let sentCount = 0;
          let blockedCount = 0;
          for (const msg of approved.slice(0, 3)) {
            try {
              await sendMessage(msg.id);
              sentCount++;
            } catch {
              blockedCount++;
            }
          }
          await refreshAll();
          updateStep(stepId, {
            status: 'done',
            result: `${sentCount} sent, ${blockedCount} blocked. Check Job Health tab.`,
          });
          break;
        }
        case 'results': {
          await refreshAll();
          const loop = stats?.resultsLoop;
          updateStep(stepId, {
            status: 'done',
            result: loop
              ? `Signals: ${loop.signalsFound}, Emails: ${loop.generatedEmails}, Sent: ${loop.sentEmails}, Replies: ${loop.replies}`
              : 'View Results tab for metrics',
          });
          break;
        }
      }
    } catch (error) {
      updateStep(stepId, { status: 'error', result: `Error: ${error instanceof Error ? error.message : 'Unknown'}` });
    }
    setActiveStep(null);
  };

  const resetDemo = () => {
    setSteps(INITIAL_STEPS);
    setActiveStep(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="bg-gradient-to-r from-emerald-500/10 via-slate-900/50 to-purple-500/10 border-emerald-500/20 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Rocket className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">20-Lead Beta Demo Run</h2>
              <p className="text-[11px] text-slate-400">
                Guided walkthrough of the full loop: signals → rank → draft → approve → send → results
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-lg font-bold text-emerald-400">{progressPercent}%</div>
              <div className="text-[9px] text-slate-500">{completedSteps}/{steps.length} steps</div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={resetDemo}
              className="h-7 text-[10px] text-slate-400 hover:text-white"
            >
              Reset
            </Button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-3 h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </Card>

      {/* Steps */}
      <div className="space-y-2">
        {steps.map((step, idx) => {
          const isActive = activeStep === step.id;
          const isPastActive = step.status === 'done';
          const isNext = step.status === 'pending' && (idx === 0 || steps[idx - 1].status === 'done');

          return (
            <Card
              key={step.id}
              className={`p-3 border transition-all ${
                isActive
                  ? 'bg-blue-500/10 border-blue-500/30'
                  : isPastActive
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : step.status === 'error'
                      ? 'bg-red-500/5 border-red-500/20'
                      : isNext
                        ? 'bg-slate-800/50 border-slate-600/50'
                        : 'bg-slate-900/30 border-slate-800/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isPastActive
                      ? 'bg-emerald-500/20'
                      : isActive
                        ? 'bg-blue-500/20'
                        : 'bg-slate-800'
                  }`}>
                    {isActive ? (
                      <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                    ) : isPastActive ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <step.icon className={`w-4 h-4 ${isNext ? 'text-slate-300' : 'text-slate-600'}`} />
                    )}
                  </div>
                  <div>
                    <div className={`text-sm font-medium ${
                      isPastActive ? 'text-emerald-300' : isActive ? 'text-blue-300' : isNext ? 'text-white' : 'text-slate-500'
                    }`}>
                      {step.label}
                    </div>
                    <div className="text-[10px] text-slate-500">{step.description}</div>
                    {step.result && (
                      <div className={`text-[10px] mt-0.5 ${
                        step.status === 'error' ? 'text-red-400' : 'text-emerald-400/80'
                      }`}>
                        {step.result}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isPastActive && (
                    <Badge className="text-[8px] h-4 bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                      Done
                    </Badge>
                  )}
                  {(isNext || step.status === 'error') && !isActive && (
                    <Button
                      size="sm"
                      onClick={() => runStep(step.id)}
                      className="h-7 text-[10px] bg-slate-700 hover:bg-slate-600 text-white"
                    >
                      {step.status === 'error' ? 'Retry' : 'Run'}
                      <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  )}
                  {!isNext && step.status === 'pending' && !isActive && (
                    <Circle className="w-3 h-3 text-slate-700" />
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Quick Navigation */}
      {completedSteps > 0 && (
        <Card className="bg-slate-900/30 border-slate-700/50 p-3">
          <div className="text-[10px] text-slate-400 mb-2">Quick Navigation</div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: 'Results', tab: 'results', icon: Mail },
              { label: 'Leads', tab: 'leads', icon: Target },
              { label: 'Approval Queue', tab: 'approval', icon: CheckCircle },
              { label: 'Messages', tab: 'messages', icon: Mail },
              { label: 'Job Health', tab: 'jobs', icon: Zap },
              { label: 'Deliverability', tab: 'deliverability', icon: Shield },
            ].map(nav => (
              <Button
                key={nav.tab}
                size="sm"
                variant="ghost"
                onClick={() => { setActiveTab(nav.tab); addToast(`Switched to ${nav.label}`, 'info'); }}
                className="h-6 text-[9px] text-slate-400 hover:text-white px-2"
              >
                <nav.icon className="w-2.5 h-2.5 mr-1" />
                {nav.label}
              </Button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
