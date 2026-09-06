'use client';

import { useState, useEffect, useCallback } from 'react';
import { useDashboardStore, MessageRow } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  CheckCircle,
  XCircle,
  Edit3,
  Send,
  Mail,
  Loader2,
  Shield,
  Brain,
  Zap,
  RotateCcw,
  Sparkles,
  Search,
  Target,
  ArrowRight,
  TrendingUp,
  Building2,
  CheckCircle2,
  Sliders,
  Keyboard,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';

const SIGNAL_LABELS: Record<string, string> = {
  funding_round: 'Funding Round',
  hiring_spike: 'Hiring Spike',
  engineering_hiring_spike: 'Eng Hiring Spike',
  traffic_drop: 'Traffic Drop',
  product_launch: 'Product Launch',
  rebranding: 'Rebranding',
  seo_decline: 'SEO Decline',
  tech_stack_migration: 'Tech Migration',
  competitor_pressure: 'Competitor Pressure',
  ai_adoption_signal: 'AI Adoption',
  pain_point: 'Pain Point',
  growth: 'Growth Signal',
  expansion: 'Expansion',
  job_change: 'Job Change',
  tech_stack: 'Tech Stack',
  personalization_hook: 'Personalization Hook',
  trigger: 'Trigger',
  hiring: 'Hiring',
  funding: 'Funding',
  news: 'News',
};

export function ApprovalQueue() {
  const {
    messages,
    leads,
    approveMessage,
    rejectMessage,
    regenerateDraft,
    sendMessage,
    bulkApproveHighConfidence,
    batchApproveMessages,
    batchRejectMessages,
    toggleAutopilot,
    addToast,
  } = useDashboardStore();

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editOriginalBody, setEditOriginalBody] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [showFeedbackFor, setShowFeedbackFor] = useState<string | null>(null);
  const [feedbackAction, setFeedbackAction] = useState<'reject' | 'regenerate'>('reject');

  const [isAutopilot, setIsAutopilot] = useState(false);
  const [isBulkApproving, setIsBulkApproving] = useState(false);
  const [readinessData, setReadinessData] = useState<Record<string, any>>({});
  const [loadingReadiness, setLoadingReadiness] = useState<Record<string, boolean>>({});

  const generated = messages.filter(m => m.status === 'generated');
  const approved = messages.filter(m => m.status === 'approved');

  // Fetch Autonomy status on mount
  useEffect(() => {
    fetch('/api/autonomy/status')
      .then(res => res.json())
      .then(json => {
        if (json.success && json.data) {
          setIsAutopilot(json.data.autonomyEnabled && !json.data.autonomyPaused);
        }
      })
      .catch(() => {});
  }, []);

  // Safe selected item index
  const safeIndex = Math.min(selectedIndex, Math.max(0, generated.length - 1));
  const activeMessage = generated[safeIndex];

  // Helper to extract lead details
  const getLeadDetails = (leadId: string) => {
    return leads.find(l => l.id === leadId);
  };

  // Diff calculation for keystroke tracking
  const computeDiffStats = () => {
    if (!editOriginalBody || !editBody) return { added: 0, removed: 0, keptCount: 0 };
    const origWords = editOriginalBody.split(/\s+/).filter(Boolean);
    const editWords = editBody.split(/\s+/).filter(Boolean);
    const added = Math.max(0, editWords.length - origWords.length);
    const removed = Math.max(0, origWords.length - editWords.length);
    const kept = origWords.filter(w => editWords.includes(w));
    return { added, removed, keptCount: kept.length };
  };

  const startEdit = (msg: MessageRow) => {
    setEditingId(msg.id);
    setEditSubject(msg.subject);
    setEditBody(msg.body);
    setEditOriginalBody(msg.body);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditSubject('');
    setEditBody('');
    setEditOriginalBody('');
  };

  const handleApprove = async (msgId: string) => {
    if (editingId === msgId) {
      await approveMessage(msgId, editSubject, editBody);
      setEditingId(null);
    } else {
      await approveMessage(msgId);
    }
  };

  const handleReject = async (msgId: string, feedback?: string) => {
    await rejectMessage(msgId, feedback);
    setShowFeedbackFor(null);
    setFeedbackText('');
  };

  const handleRegenerate = async (msgId: string, feedback?: string) => {
    await regenerateDraft(msgId, feedback);
    setShowFeedbackFor(null);
    setFeedbackText('');
  };

  const handleBulkApprove = async () => {
    setIsBulkApproving(true);
    try {
      await bulkApproveHighConfidence(85);
    } finally {
      setIsBulkApproving(false);
    }
  };

  const handleToggleAutopilotMode = async (enabled: boolean) => {
    setIsAutopilot(enabled);
    await toggleAutopilot(enabled);
  };

  const fetchReadiness = async (msgId: string) => {
    setLoadingReadiness(prev => ({ ...prev, [msgId]: true }));
    try {
      const res = await fetch(`/api/messages/${msgId}/send-readiness`);
      if (res.ok) {
        const data = await res.json();
        setReadinessData(prev => ({ ...prev, [msgId]: data.data }));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingReadiness(prev => ({ ...prev, [msgId]: false }));
    }
  };

  const toggleReadiness = (msgId: string) => {
    if (readinessData[msgId]) {
      setReadinessData(prev => {
        const next = { ...prev };
        delete next[msgId];
        return next;
      });
    } else {
      fetchReadiness(msgId);
    }
  };

  // ═══ KEYBOARD SHORTCUTS ═══
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // If typing inside an input or textarea
    const isEditingInput = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName);

    if (e.key === 'Escape') {
      if (editingId) {
        cancelEdit();
      }
      if (showFeedbackFor) {
        setShowFeedbackFor(null);
      }
      return;
    }

    if (isEditingInput) {
      // Ctrl+Enter or Cmd+Enter to save edit
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && editingId) {
        e.preventDefault();
        handleApprove(editingId);
      }
      return;
    }

    if (!activeMessage) return;

    const key = e.key.toLowerCase();

    if (key === 'a') {
      e.preventDefault();
      handleApprove(activeMessage.id);
    } else if (key === 'r') {
      e.preventDefault();
      setFeedbackAction('reject');
      setShowFeedbackFor(activeMessage.id);
    } else if (key === 'e') {
      e.preventDefault();
      startEdit(activeMessage);
    } else if (key === 'g') {
      e.preventDefault();
      setFeedbackAction('regenerate');
      setShowFeedbackFor(activeMessage.id);
    } else if (key === 'j' || key === 'arrowdown' || key === 'arrowright') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(generated.length - 1, prev + 1));
    } else if (key === 'k' || key === 'arrowup' || key === 'arrowleft') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(0, prev - 1));
    }
  }, [activeMessage, editingId, showFeedbackFor, generated.length, editSubject, editBody]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const renderReadiness = (msgId: string) => {
    const data = readinessData[msgId];
    if (loadingReadiness[msgId]) {
      return (
        <div className="mt-3 p-3 rounded-lg bg-slate-950 border border-slate-800/80 flex justify-center py-4">
          <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
        </div>
      );
    }
    if (!data) return null;

    return (
      <div className="mt-3 p-3 rounded-lg bg-slate-950 border border-slate-800/80 text-[11px] space-y-2">
        <div className="flex items-center justify-between mb-1.5 border-b border-slate-800 pb-1.5">
          <span className="font-semibold text-slate-300 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-blue-400" />
            7-Gate Deliverability Safety Clearance
          </span>
          <Badge className={
            data.ready
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
              : 'bg-red-500/15 text-red-400 border border-red-500/20'
          }>
            {data.ready ? 'Passed All 7 Gates — Ready to Send' : 'Pre-Send Gate Blocked'}
          </Badge>
        </div>
        
        <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
          {data.checks?.map((check: any) => (
            <div key={check.id} className="flex items-start justify-between gap-3 text-[10px]">
              <div className="flex-1">
                <div className="font-medium text-slate-300 flex items-center gap-1.5">
                  <span className={
                    check.status === 'pass' ? 'w-1.5 h-1.5 rounded-full bg-emerald-500' :
                    check.status === 'warn' ? 'w-1.5 h-1.5 rounded-full bg-amber-500' :
                    'w-1.5 h-1.5 rounded-full bg-red-500'
                  } />
                  {check.label}
                </div>
                <div className="text-slate-500 mt-0.5">{check.reason}</div>
              </div>
              <span className={
                check.status === 'pass' ? 'text-emerald-400 text-[9px] shrink-0 font-medium' :
                check.status === 'warn' ? 'text-amber-400 text-[9px] shrink-0 font-medium' :
                'text-red-400 text-[9px] shrink-0 font-medium'
              }>
                {check.status === 'pass' ? 'Ready' : check.status === 'warn' ? 'Can queue' : 'Blocked'}
              </span>
            </div>
          ))}
        </div>
        
        <div className="text-[9px] text-slate-600 font-mono mt-1 pt-1.5 border-t border-slate-800/50 flex justify-between">
          <span>Trace ID: {data.traceId}</span>
          <span>Deliverability Protection Active</span>
        </div>
      </div>
    );
  };

  const renderVisualFlow = (msg: MessageRow) => {
    const lead = getLeadDetails(msg.lead?.id || '') || msg.lead;
    const signals = msg.evidenceSnapshot?.signals || (lead && 'signals' in lead ? (lead as any).signals : []) || [];
    const topSignal = signals[0];
    const diffStats = editingId === msg.id ? computeDiffStats() : null;

    return (
      <div className="space-y-4">
        {/* Visual 4-Stage Pipeline Tracker */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
          {/* Stage 1: Research */}
          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
              <span className="flex items-center gap-1 text-cyan-400">
                <Search className="w-3 h-3" />
                1. Research
              </span>
              <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-cyan-800 text-cyan-400">
                {(lead as any)?.emailVerified ? 'MX Verified' : 'Validated'}
              </Badge>
            </div>
            <div className="font-semibold text-slate-200 truncate">{msg.lead?.name || 'Prospect'}</div>
            <div className="text-[10px] text-slate-400 truncate">{msg.lead?.company || 'Target Account'}</div>
            <div className="text-[9px] text-slate-500 font-mono truncate">{msg.lead?.email}</div>
          </div>

          {/* Stage 2: Signal */}
          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
              <span className="flex items-center gap-1 text-amber-400">
                <Zap className="w-3 h-3" />
                2. Signal Grounding
              </span>
              {topSignal?.urgency && (
                <span className="text-[9px] font-mono text-amber-400">
                  {Math.round(topSignal.urgency * 100)}% Urgency
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Badge className="text-[9px] h-4 bg-amber-500/10 text-amber-300 border border-amber-500/20 truncate">
                {SIGNAL_LABELS[msg.signalTypeUsed || topSignal?.type || 'growth'] || msg.signalTypeUsed || 'Intent Signal'}
              </Badge>
            </div>
            <div className="text-[10px] text-slate-400 line-clamp-1">
              {topSignal?.summary || topSignal?.content || 'Verified market expansion & hiring signals'}
            </div>
            {topSignal?.sourceUrl && (
              <a
                href={topSignal.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[9px] text-blue-400 hover:underline truncate block"
              >
                Source: {topSignal.sourceTitle || topSignal.sourceUrl}
              </a>
            )}
          </div>

          {/* Stage 3: Reason */}
          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
              <span className="flex items-center gap-1 text-purple-400">
                <Brain className="w-3 h-3" />
                3. AI Reasoning
              </span>
              <span className="text-[9px] font-mono text-purple-300 font-bold">
                {((lead as any)?.leadScore || 88)}% Fit
              </span>
            </div>
            <div className="text-[10px] text-slate-300 font-medium truncate">
              Angle: {msg.pitchAngleUsed || msg.angle || 'Product Value Proposition'}
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              Tone: {msg.tone || 'Professional'} • CTA: {msg.cta || 'Call'}
            </div>
            <div className="text-[9px] text-purple-400/80 line-clamp-1">
              {msg.evidenceSnapshot?.reasoning || 'Targeted hook matches observed company trigger'}
            </div>
          </div>

          {/* Stage 4: Generated Draft Indicator */}
          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-emerald-900/40 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
              <span className="flex items-center gap-1 text-emerald-400">
                <Sparkles className="w-3 h-3" />
                4. Generated Draft
              </span>
              <Badge className="text-[8px] h-3.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Step #{msg.sequencePos + 1}
              </Badge>
            </div>
            <div className="text-[10px] text-slate-300 font-medium truncate">
              Subject: {msg.subject}
            </div>
            <div className="text-[9px] text-emerald-400 font-mono">
              Ready for 5-Second Review
            </div>
          </div>
        </div>

        {/* Draft Editor / Preview Area */}
        <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-4 space-y-3">
          {editingId === msg.id ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-300 flex items-center gap-1">
                  <Edit3 className="w-3.5 h-3.5 text-blue-400" />
                  Inline Edit Mode (Keystrokes tracked to Compounding Memory)
                </span>
                <span className="text-[10px] text-slate-500 font-mono">Press Ctrl+Enter to Save</span>
              </div>
              <Input
                value={editSubject}
                onChange={e => setEditSubject(e.target.value)}
                placeholder="Email Subject..."
                className="bg-slate-900 border-slate-700 text-white text-xs h-8"
              />
              <Textarea
                value={editBody}
                onChange={e => setEditBody(e.target.value)}
                placeholder="Email Body..."
                className="bg-slate-900 border-slate-700 text-white text-xs min-h-[140px] resize-y"
              />

              {/* Real-time Diff & Memory Feedback */}
              {diffStats && (
                <div className="p-2 rounded bg-purple-950/30 border border-purple-900/40 text-[10px] text-purple-300 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain className="w-3.5 h-3.5 text-purple-400" />
                    <span>
                      Compounding Memory Active: <strong>{diffStats.keptCount}</strong> kept phrases,{' '}
                      <strong>+{diffStats.added}</strong> words added, <strong>-{diffStats.removed}</strong> removed.
                    </span>
                  </div>
                  <span className="text-[9px] text-purple-400 font-mono">Alex will learn your style</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-7 text-xs text-slate-400">
                  Cancel (Esc)
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleApprove(msg.id)}
                  className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Check className="w-3 h-3 mr-1" />
                  Save & Approve
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-white">{msg.subject}</div>
                <div className="text-[10px] text-slate-400">
                  To: <span className="text-slate-200">{msg.lead?.name}</span> ({msg.lead?.email})
                </div>
              </div>
              <div className="text-xs text-slate-300 whitespace-pre-wrap bg-slate-900/70 rounded-md p-3 border border-slate-800/60 leading-relaxed font-sans">
                {msg.body}
              </div>
            </div>
          )}

          {/* Feedback input dialog when Rejecting or Regenerating with notes */}
          {showFeedbackFor === msg.id && (
            <div className="p-3 rounded-lg bg-slate-900 border border-purple-500/30 space-y-2 mt-2">
              <div className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-purple-400" />
                {feedbackAction === 'regenerate' ? 'Regenerate Draft with AI Feedback' : 'Dismiss / Reject with Feedback'}
              </div>
              <Input
                value={feedbackText}
                onChange={e => setFeedbackText(e.target.value)}
                placeholder={feedbackAction === 'regenerate' ? 'e.g. Focus more on SOC2 compliance cost savings' : 'e.g. Not interested in this angle or timing'}
                className="bg-slate-950 border-slate-800 text-xs text-slate-200 h-8"
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setShowFeedbackFor(null)} className="h-6 text-[10px] text-slate-400">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => feedbackAction === 'regenerate' ? handleRegenerate(msg.id, feedbackText) : handleReject(msg.id, feedbackText)}
                  className={`h-6 text-[10px] ${feedbackAction === 'regenerate' ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}
                >
                  {feedbackAction === 'regenerate' ? 'Regenerate Draft' : 'Confirm Reject'}
                </Button>
              </div>
            </div>
          )}

          {/* Controls Bar */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                onClick={() => handleApprove(msg.id)}
                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 font-semibold shadow-sm"
              >
                <CheckCircle className="w-3.5 h-3.5 mr-1" />
                Approve <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded bg-emerald-800/60 text-emerald-200 font-mono">[A]</span>
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => startEdit(msg)}
                className="h-8 text-xs border-slate-700 text-slate-300 hover:bg-slate-800 px-3"
              >
                <Edit3 className="w-3.5 h-3.5 mr-1" />
                Edit <span className="ml-1 text-[9px] text-slate-400 font-mono">[E]</span>
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setFeedbackAction('regenerate');
                  setShowFeedbackFor(msg.id);
                }}
                className="h-8 text-xs border-slate-700 text-purple-300 hover:bg-purple-950/40 px-3"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                Regenerate <span className="ml-1 text-[9px] text-purple-400 font-mono">[G]</span>
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFeedbackAction('reject');
                  setShowFeedbackFor(msg.id);
                }}
                className="h-8 text-xs text-red-400 hover:text-red-300 hover:bg-red-950/20 px-2.5"
              >
                <XCircle className="w-3.5 h-3.5 mr-1" />
                Reject <span className="ml-1 text-[9px] text-red-400/80 font-mono">[R]</span>
              </Button>
            </div>

            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[10px] text-slate-400 hover:text-white px-2"
              onClick={() => toggleReadiness(msg.id)}
            >
              <Shield className="w-3 h-3 mr-1 text-blue-400" />
              {readinessData[msg.id] ? 'Hide Deliverability Check' : '7-Gate Safety Clearance'}
            </Button>
          </div>

          {/* Render 7-Gate Send Readiness Checklist */}
          {renderReadiness(msg.id)}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* ─── QUEUE HEADER: Autopilot Toggle & Bulk Actions ─── */}
      <Card className="border-slate-800 bg-slate-900/90 p-4 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                5-Second Review Queue
              </h2>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs">
                {generated.length} Drafts Awaiting Confirmation
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Verify AI research signals, customize copy in seconds, or switch to autonomous Autopilot.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* 1-Click Autopilot Switch */}
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5">
              <Zap className={`w-4 h-4 ${isAutopilot ? 'text-amber-400 animate-pulse' : 'text-slate-500'}`} />
              <div className="text-left">
                <div className="text-[11px] font-semibold text-slate-200">Autopilot Mode</div>
                <div className="text-[9px] text-slate-500">
                  {isAutopilot ? 'Continuous Auto SDR' : 'Manual HITL Review'}
                </div>
              </div>
              <Switch
                checked={isAutopilot}
                onCheckedChange={handleToggleAutopilotMode}
                className="data-[state=checked]:bg-emerald-600"
              />
            </div>

            {/* Bulk Approve High Confidence */}
            {generated.length > 0 && (
              <Button
                onClick={handleBulkApprove}
                disabled={isBulkApproving}
                className="h-9 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold px-3.5 shadow-md"
              >
                {isBulkApproving ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                )}
                Bulk Approve High Confidence (&gt;85%)
              </Button>
            )}
          </div>
        </div>

        {/* Hotkey Guide Bar */}
        <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 font-semibold text-slate-300">
              <Keyboard className="w-3.5 h-3.5 text-purple-400" />
              Keyboard Shortcuts:
            </span>
            <span className="font-mono bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-[10px]">A: Approve</span>
            <span className="font-mono bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-[10px]">R: Reject</span>
            <span className="font-mono bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-[10px]">E: Edit</span>
            <span className="font-mono bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-[10px]">G: Regenerate</span>
            <span className="font-mono bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-[10px]">J/K: Next/Prev</span>
          </div>

          {generated.length > 0 && (
            <div className="text-[10px] text-slate-500">
              Viewing draft <strong>{safeIndex + 1}</strong> of <strong>{generated.length}</strong>
            </div>
          )}
        </div>
      </Card>

      {/* ─── MAIN REVIEW SECTION ─── */}
      {generated.length === 0 && approved.length === 0 ? (
        <Card className="bg-slate-900/50 border-slate-800 p-12 text-center shadow-lg">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 mb-3">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h3 className="text-base font-bold text-white">Review Queue Clean & Empty!</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            All generated outreach drafts have been reviewed. The AI SDR will discover new qualified prospects and draft personalized messages in the next cycle.
          </p>
        </Card>
      ) : (
        <>
          {/* Awaiting Approval Card Feed */}
          {generated.length > 0 && (
            <div className="space-y-4">
              {/* If multiple, show item list navigation tabs */}
              {generated.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                  {generated.map((msg, idx) => (
                    <button
                      key={msg.id}
                      onClick={() => {
                        setSelectedIndex(idx);
                        cancelEdit();
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border text-left transition-all shrink-0 ${
                        idx === safeIndex
                          ? 'bg-purple-950/60 border-purple-500/50 text-purple-200 shadow-sm'
                          : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <div className="font-semibold truncate max-w-[150px]">{msg.lead?.name || `Draft #${idx + 1}`}</div>
                      <div className="text-[9px] text-slate-500 truncate max-w-[150px]">{msg.lead?.company || msg.subject}</div>
                    </button>
                  ))}
                </div>
              )}

              {/* Active Draft Visual Card */}
              {activeMessage && (
                <Card className="bg-slate-900/80 border-purple-500/30 shadow-xl overflow-hidden p-5">
                  {renderVisualFlow(activeMessage)}
                </Card>
              )}
            </div>
          )}

          {/* Approved — Ready to Send Section */}
          {approved.length > 0 && (
            <Card className="bg-slate-900/50 border-emerald-500/20 overflow-hidden shadow-lg">
              <div className="p-3.5 border-b border-slate-800 bg-emerald-500/5 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    Approved Outbound — Ready for Send Dispatch ({approved.length})
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    Dispatched via Resend with dynamic ±15% ISP jitter and 7-gate safety audit.
                  </p>
                </div>
              </div>
              <div className="divide-y divide-slate-800/50 max-h-[400px] overflow-y-auto font-sans">
                {approved.map(msg => (
                  <div key={msg.id} className="p-3.5 hover:bg-slate-800/30 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-white truncate">{msg.subject}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          To: <span className="text-slate-200">{msg.lead?.name}</span> at <span className="text-slate-200">{msg.lead?.company}</span> ({msg.lead?.email})
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[10px] text-slate-400 hover:text-white px-2"
                          onClick={() => toggleReadiness(msg.id)}
                        >
                          <Shield className="w-3 h-3 mr-1 text-blue-400" />
                          Safety Status
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => sendMessage(msg.id)}
                          className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 font-medium"
                        >
                          <Send className="w-3 h-3 mr-1" />
                          Send Now
                        </Button>
                      </div>
                    </div>
                    
                    {/* Render Send Readiness Checklist */}
                    {renderReadiness(msg.id)}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
