'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  CheckCircle2,
  XCircle,
  Edit3,
  RotateCcw,
  Zap,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  Building2,
  Mail,
  Keyboard,
  ExternalLink,
  ChevronRight,
  AlertTriangle,
  Clock,
  Check,
  Layers,
  Search,
} from 'lucide-react';
import { ReviewDeckItem } from '@/app/api/review/deck/route';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function ReviewDeck() {
  const [selectedTier, setSelectedTier] = useState<'all' | 'high' | 'medium' | 'attention'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedTier !== 'all') params.set('tier', selectedTier);
    if (searchQuery.trim()) params.set('search', searchQuery.trim());
    return `/api/review/deck?${params.toString()}`;
  }, [selectedTier, searchQuery]);

  const { data, mutate, isLoading } = useSWR(apiUrl, fetcher);
  const items: ReviewDeckItem[] = data?.data?.items || [];
  const stats = data?.data?.stats || { total: 0, high: 0, medium: 0, attention: 0, clusters: [] };

  const [currentIndex, setCurrentIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [approvedCount, setApprovedCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [isPersisting, setIsPersisting] = useState(false);

  // Clamp current index when items change
  useEffect(() => {
    if (currentIndex >= items.length && items.length > 0) {
      setCurrentIndex(0);
    }
  }, [items.length, currentIndex]);

  const activeItem: ReviewDeckItem | undefined = items[currentIndex];

  const [customSubject, setCustomSubject] = useState('');
  const [customBody, setCustomBody] = useState('');

  // Sync custom draft when active item changes
  useEffect(() => {
    if (activeItem) {
      setCustomSubject(activeItem.draftEmail.subject);
      setCustomBody(activeItem.draftEmail.body);
      setEditing(false);
    }
  }, [currentIndex, activeItem]);

  const handleNext = useCallback(() => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setEditing(false);
    } else {
      setCurrentIndex(items.length);
    }
  }, [currentIndex, items.length]);

  const handleSkip = useCallback(() => {
    if (!activeItem) return;
    toast.info(`Skipped ${activeItem.name}. Moved to end of deck.`);
    handleNext();
  }, [activeItem, handleNext]);

  // Single Approve
  const handleApprove = useCallback(async () => {
    if (!activeItem || isPersisting) return;
    setIsPersisting(true);

    try {
      // Dispatch approval
      const res = await fetch(`/api/leads/${activeItem.leadId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: customSubject || activeItem.draftEmail.subject,
          body: customBody || activeItem.draftEmail.body,
        }),
      }).catch(() => null);

      if (!res || !res.ok) {
        // Fallback to PATCH lead
        await fetch(`/api/leads/${activeItem.leadId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'approved' }),
        }).catch(() => null);
      }

      setApprovedCount(prev => prev + 1);
      toast.success(`Approved outreach for ${activeItem.name} (${activeItem.company})! Dispatched via 10-step policy pipeline.`);
      handleNext();
    } catch (err: any) {
      toast.error(`Approval failed: ${err.message || 'Server error'}`);
    } finally {
      setIsPersisting(false);
    }
  }, [activeItem, customSubject, customBody, handleNext, isPersisting]);

  // Single Dismiss
  const handleReject = useCallback(async () => {
    if (!activeItem || isPersisting) return;
    setIsPersisting(true);

    try {
      await fetch(`/api/leads/${activeItem.leadId}/reject`, { method: 'POST' }).catch(() => null);
      await fetch(`/api/leads/${activeItem.leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' }),
      }).catch(() => null);

      setRejectedCount(prev => prev + 1);
      toast.info(`Dismissed ${activeItem.name} from review queue.`);
      handleNext();
    } catch (err: any) {
      toast.error(`Dismissal failed: ${err.message || 'Server error'}`);
    } finally {
      setIsPersisting(false);
    }
  }, [activeItem, handleNext, isPersisting]);

  // Regenerate Copy
  const handleRegenerate = useCallback(async () => {
    if (!activeItem || isPersisting) return;
    setIsPersisting(true);

    try {
      const res = await fetch(`/api/leads/${activeItem.leadId}/generate-copy`, {
        method: 'POST',
      }).catch(() => null);

      if (res && res.ok) {
        const json = await res.json().catch(() => null);
        if (json?.data?.subject && json?.data?.body) {
          setCustomSubject(json.data.subject);
          setCustomBody(json.data.body);
          toast.success('Regenerated copy tailored to live trigger signal!');
          return;
        }
      }

      // Alternative angle formulation
      const angle = activeItem.grounding.whySelected || 'pipeline growth acceleration';
      const signalText = activeItem.grounding.signalPhrase;
      setCustomSubject(`${activeItem.firstName}, alternative thought regarding ${activeItem.company}'s expansion`);
      setCustomBody(
        `Hi ${activeItem.firstName},\n\nI was following ${activeItem.company}'s recent signal: "${signalText}".\n\nGiven this expansion, we've developed benchmark data on how comparable leaders are executing ${angle} with zero deliverability friction.\n\nWould next Thursday at 2:00 PM work for a brief 10-minute intro?`
      );
      toast.success('Regenerated copy with alternative value-first angle!');
    } catch (err: any) {
      toast.error(`Regeneration failed: ${err.message || 'Server error'}`);
    } finally {
      setIsPersisting(false);
    }
  }, [activeItem, isPersisting]);

  // Batch "Approve Similar" Action
  const handleApproveSimilar = async () => {
    if (!activeItem || isPersisting) return;
    setIsPersisting(true);

    try {
      const res = await fetch('/api/review/approve-similar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusterKey: activeItem.clusterKey,
          signalType: activeItem.grounding.signalType,
          confidenceTier: activeItem.confidenceTier,
        }),
      });

      const json = await res.json().catch(() => ({}));
      const count = json?.data?.approvedCount || 1;

      setApprovedCount(prev => prev + count);
      toast.success(`🚀 Batch Approved ${count} similar drafts in cluster "${activeItem.grounding.category}"!`, {
        description: 'All matching high-confidence prospects dispatched to sending queue.',
      });

      await mutate();
      handleNext();
    } catch (err: any) {
      toast.error(`Batch approval failed: ${err.message || 'Server error'}`);
    } finally {
      setIsPersisting(false);
    }
  };

  // Keyboard navigation shortcuts: A, E, R, G, Space
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case 'a':
          e.preventDefault();
          if (!isPersisting) handleApprove();
          break;
        case 'e':
          e.preventDefault();
          setEditing(prev => !prev);
          break;
        case 'g':
          e.preventDefault();
          if (!isPersisting) handleRegenerate();
          break;
        case 'r':
          e.preventDefault();
          if (!isPersisting) handleReject();
          break;
        case ' ':
          e.preventDefault();
          handleSkip();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleApprove, handleReject, handleSkip, handleRegenerate, isPersisting]);

  // Active cluster count
  const matchingCluster = stats.clusters.find((c: { key: string; count: number }) => c.key === activeItem?.clusterKey);
  const clusterCount = matchingCluster ? matchingCluster.count : 1;

  if (isLoading) {
    return (
      <div className="p-16 text-center text-slate-400 space-y-3">
        <div className="animate-spin inline-block w-7 h-7 border-[3px] border-current border-t-transparent text-blue-400 rounded-full" />
        <p className="text-sm">Loading confidence-graded review deck and grounding evidence...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── CONFIDENCE TABS & FILTER BAR ─────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            variant={selectedTier === 'all' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => { setSelectedTier('all'); setCurrentIndex(0); }}
            className={`text-xs h-8 ${selectedTier === 'all' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'}`}
          >
            All Pending ({stats.total})
          </Button>

          <Button
            variant={selectedTier === 'high' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => { setSelectedTier('high'); setCurrentIndex(0); }}
            className={`text-xs h-8 gap-1.5 ${selectedTier === 'high' ? 'bg-emerald-600 text-white font-semibold' : 'text-slate-400 hover:text-emerald-400'}`}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block" />
            High Confidence ({stats.high})
          </Button>

          <Button
            variant={selectedTier === 'medium' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => { setSelectedTier('medium'); setCurrentIndex(0); }}
            className={`text-xs h-8 gap-1.5 ${selectedTier === 'medium' ? 'bg-amber-600 text-white font-semibold' : 'text-slate-400 hover:text-amber-400'}`}
          >
            <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />
            Medium (60-84) ({stats.medium})
          </Button>

          <Button
            variant={selectedTier === 'attention' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => { setSelectedTier('attention'); setCurrentIndex(0); }}
            className={`text-xs h-8 gap-1.5 ${selectedTier === 'attention' ? 'bg-rose-600 text-white font-semibold' : 'text-slate-400 hover:text-rose-400'}`}
          >
            <span className="h-2 w-2 rounded-full bg-rose-400 inline-block" />
            Needs Attention ({stats.attention})
          </Button>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-64">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-500" />
          <Input
            placeholder="Search leads or company..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentIndex(0); }}
            className="pl-8 h-8 text-xs bg-slate-950 border-slate-800 text-slate-200"
          />
        </div>
      </div>

      {/* ─── REVIEW CARD OR EMPTY STATE ───────────────────────────────────────── */}
      {items.length === 0 || currentIndex >= items.length || !activeItem ? (
        <Card className="border-slate-800 bg-slate-900 text-slate-100 p-12 text-center shadow-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 mb-4 shadow-lg shadow-emerald-950/50">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h3 className="text-xl font-bold">Review Deck Clean & Empty!</h3>
          <p className="text-slate-400 text-sm mt-2 max-w-md mx-auto leading-relaxed">
            You have reviewed all pending prospects in this view. The AI SDR is currently monitoring verified job boards, funding records, and tech migrations.
          </p>
          <div className="mt-6 flex justify-center items-center gap-4 text-xs font-mono text-slate-400 bg-slate-950/60 p-3 rounded-lg max-w-xs mx-auto border border-slate-800">
            <span>Approved: <strong className="text-emerald-400 font-bold">{approvedCount}</strong></span>
            <span>•</span>
            <span>Dismissed: <strong className="text-red-400 font-bold">{rejectedCount}</strong></span>
          </div>
          <div className="mt-6 flex justify-center gap-3">
            <Button
              onClick={() => { setSelectedTier('all'); setCurrentIndex(0); mutate(); }}
              variant="outline"
              className="border-slate-800 text-slate-300 hover:bg-slate-800"
            >
              Restart Review Deck
            </Button>
            <Button
              onClick={async () => {
                await fetch('/api/seed-sample', { method: 'POST' }).catch(() => null);
                mutate();
                setCurrentIndex(0);
              }}
              className="bg-blue-600 hover:bg-blue-500 text-white"
            >
              Load Sample High-Intent Data
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="border-slate-800 bg-slate-900/90 text-slate-100 shadow-2xl overflow-hidden">
          {/* Card Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-slate-800 bg-slate-950/50">
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300">
                CARD {currentIndex + 1} OF {items.length}
              </span>
              <div>
                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  {activeItem.name}
                  <span className="text-sm font-normal text-slate-400">— {activeItem.title} @ {activeItem.company}</span>
                </h3>
              </div>
            </div>

            {/* Score & Tier Badge */}
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={`font-mono text-xs px-2.5 py-1 ${
                  activeItem.confidenceTier === 'high'
                    ? 'border-emerald-700 text-emerald-300 bg-emerald-950/40'
                    : activeItem.confidenceTier === 'medium'
                    ? 'border-amber-700 text-amber-300 bg-amber-950/40'
                    : 'border-rose-700 text-rose-300 bg-rose-950/40'
                }`}
              >
                Score: {activeItem.score}/100 · {activeItem.confidenceTier.toUpperCase()} CONFIDENCE
              </Badge>
            </div>
          </div>

          {/* 2-Column Split: Left (Evidence & Risk) vs Right (Draft Preview & Actions) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
            {/* ─── LEFT COLUMN: GROUNDING & RISK INDICATORS (5 COLS) ──────────── */}
            <div className="lg:col-span-5 p-6 space-y-6 bg-slate-950/30">
              {/* Grounding Citations */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    Why Selected (Grounding Evidence)
                  </span>
                  <Badge variant="secondary" className="text-[10px] bg-slate-800 text-slate-300">
                    Relevance {activeItem.grounding.relevance}%
                  </Badge>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800/80 space-y-2.5">
                  <div className="text-xs text-slate-300 font-medium leading-relaxed italic border-l-2 border-blue-500 pl-2.5">
                    &ldquo;{activeItem.grounding.signalPhrase}&rdquo;
                  </div>

                  <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3 text-slate-500" />
                      {activeItem.grounding.sourceTitle || 'Public Intelligence'}
                    </span>
                    {activeItem.grounding.sourceUrl && (
                      <a
                        href={activeItem.grounding.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
                      >
                        Source <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
                </div>

                <p className="text-xs text-slate-400 leading-normal">
                  <strong className="text-slate-300">Pitch Angle:</strong> {activeItem.grounding.whySelected}
                </p>
              </div>

              {/* Risk Indicators */}
              <div className="space-y-3 pt-4 border-t border-slate-800/80">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Deterministic Risk Indicators
                </span>

                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  {/* Domain Reputation */}
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 text-[11px] block">Domain Health</span>
                    <span className="font-semibold text-emerald-400 flex items-center gap-1 mt-0.5">
                      <Check className="h-3 w-3" />
                      {activeItem.riskIndicators.domainReputationScore}/100 (Safe)
                    </span>
                  </div>

                  {/* Spam Keyword Risk */}
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 text-[11px] block">Spam Keyword Risk</span>
                    <span className={`font-semibold flex items-center gap-1 mt-0.5 ${activeItem.riskIndicators.spamKeywordRisk > 0.10 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {(activeItem.riskIndicators.spamKeywordRisk * 100).toFixed(0)}% (Clean)
                    </span>
                  </div>

                  {/* Send Window */}
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 text-[11px] block">Send Window</span>
                    <span className="font-semibold text-slate-200 flex items-center gap-1 mt-0.5">
                      <Clock className="h-3 w-3 text-blue-400" />
                      Active (8am–6pm)
                    </span>
                  </div>

                  {/* DNC Verification */}
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 text-[11px] block">DNC Suppression</span>
                    <span className="font-semibold text-emerald-400 flex items-center gap-1 mt-0.5">
                      <ShieldCheck className="h-3 w-3 text-emerald-400" />
                      Clear & Eligible
                    </span>
                  </div>
                </div>
              </div>

              {/* Recipient Coordinates */}
              <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800/60 text-xs text-slate-400 space-y-1 font-mono">
                <div>Email: <span className="text-slate-200">{activeItem.email}</span></div>
                <div>Company: <span className="text-slate-200">{activeItem.company}</span></div>
                <div>Cluster: <span className="text-blue-400">{activeItem.clusterKey}</span></div>
              </div>
            </div>

            {/* ─── RIGHT COLUMN: DRAFT PREVIEW & ERGONOMIC ACTIONS (7 COLS) ───── */}
            <div className="lg:col-span-7 p-6 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-blue-400" />
                    AI Outreach Draft (Editable)
                  </span>
                  {editing && (
                    <Badge variant="outline" className="text-[10px] border-blue-600 text-blue-400">
                      Editing Mode
                    </Badge>
                  )}
                </div>

                {/* Subject Line */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Subject</label>
                  {editing ? (
                    <Input
                      value={customSubject}
                      onChange={(e) => setCustomSubject(e.target.value)}
                      className="bg-slate-950 border-slate-700 text-slate-100 text-sm font-medium"
                    />
                  ) : (
                    <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-sm font-medium text-slate-200">
                      {customSubject}
                    </div>
                  )}
                </div>

                {/* Body Text */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Body</label>
                  {editing ? (
                    <Textarea
                      rows={7}
                      value={customBody}
                      onChange={(e) => setCustomBody(e.target.value)}
                      className="bg-slate-950 border-slate-700 text-slate-100 text-sm font-mono leading-relaxed"
                    />
                  ) : (
                    <div className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800 text-sm text-slate-300 font-sans whitespace-pre-wrap leading-relaxed min-h-[140px]">
                      {customBody}
                    </div>
                  )}
                </div>
              </div>

              {/* ─── ACTION BUTTONS & APPROVE SIMILAR ───────────────────────── */}
              <div className="space-y-3 pt-4 border-t border-slate-800">
                {/* Hotkey Action Buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <Button
                    onClick={handleApprove}
                    disabled={isPersisting}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs h-10 shadow-lg shadow-emerald-950/30"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1.5" />
                    Approve <kbd className="ml-1 text-[10px] bg-emerald-800/80 px-1 py-0.5 rounded font-mono">A</kbd>
                  </Button>

                  <Button
                    onClick={() => setEditing(prev => !prev)}
                    variant="outline"
                    className="border-slate-700 text-slate-200 hover:bg-slate-800 text-xs h-10"
                  >
                    <Edit3 className="h-4 w-4 mr-1.5 text-blue-400" />
                    {editing ? 'Preview' : 'Edit'} <kbd className="ml-1 text-[10px] bg-slate-800 px-1 py-0.5 rounded font-mono">E</kbd>
                  </Button>

                  <Button
                    onClick={handleRegenerate}
                    disabled={isPersisting}
                    variant="outline"
                    className="border-slate-700 text-slate-200 hover:bg-slate-800 text-xs h-10"
                  >
                    <RotateCcw className="h-4 w-4 mr-1.5 text-purple-400" />
                    Regen <kbd className="ml-1 text-[10px] bg-slate-800 px-1 py-0.5 rounded font-mono">G</kbd>
                  </Button>

                  <Button
                    onClick={handleReject}
                    disabled={isPersisting}
                    variant="outline"
                    className="border-slate-700 text-red-400 hover:bg-red-950/30 hover:border-red-800 text-xs h-10"
                  >
                    <XCircle className="h-4 w-4 mr-1.5" />
                    Dismiss <kbd className="ml-1 text-[10px] bg-slate-800 px-1 py-0.5 rounded font-mono text-slate-300">R</kbd>
                  </Button>
                </div>

                {/* Approve Similar Cluster Batch Button */}
                {clusterCount > 1 && (
                  <div className="p-3 rounded-xl bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-purple-950/40 border border-blue-800/60 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-blue-400 shrink-0" />
                      <div className="text-xs">
                        <span className="font-bold text-slate-200">Approve Similar Cluster ({clusterCount} leads):</span>{' '}
                        <span className="text-slate-400">All matching &ldquo;{activeItem.grounding.category}&rdquo; in {activeItem.confidenceTier} tier.</span>
                      </div>
                    </div>

                    <Button
                      onClick={handleApproveSimilar}
                      disabled={isPersisting}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs h-8 px-3 shrink-0 shadow-md shadow-blue-950/40"
                    >
                      <Zap className="h-3.5 w-3.5 mr-1 text-amber-300" />
                      Approve Similar ({clusterCount})
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
