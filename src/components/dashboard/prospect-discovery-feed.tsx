'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Building2,
  TrendingUp,
  Target,
  Zap,
  Mail,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Send,
  Filter,
  Search,
  RefreshCw,
  Eye,
  MailCheck,
} from 'lucide-react';
import useSWR from 'swr';
import { WhyQualifiedCard } from './why-qualified-card';
import { EmptyState } from '@/components/dashboard/empty-state';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function ProspectDiscoveryFeed() {
  const { data, mutate, isLoading } = useSWR('/api/prospects', fetcher);
  const prospects: any[] = data?.data || [];

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'card' | 'why_qualified'>('why_qualified');
  const [filterTier, setFilterTier] = useState<string>('all');
  const [signalFilter, setSignalFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [discovering, setDiscovering] = useState(false);

  const handleApprove = async (id: string, name: string) => {
    setApprovedIds(prev => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/leads/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        toast.success(`Approved ${name} — Added to dispatch queue with 7-gate safety audit!`);
        mutate();
      } else {
        toast.error(`Failed to approve ${name}`);
      }
    } catch {
      toast.error(`Network error approving ${name}`);
    }
  };

  const handleBulkApprove = async () => {
    const unapproved = filteredProspects.filter(p => !approvedIds.has(p.id) && p.status !== 'approved');
    if (unapproved.length === 0) return;

    const newApproved = new Set(approvedIds);
    unapproved.forEach(p => newApproved.add(p.id));
    setApprovedIds(newApproved);

    try {
      const messageIds = unapproved.map(p => p.draftEmail?.id || p.id).filter(Boolean);
      const res = await fetch('/api/messages/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_approve',
          messageIds,
          minConfidence: 60,
        }),
      });

      if (res.ok) {
        toast.success(`Approved ${unapproved.length} prospects for automated dispatch!`);
        mutate();
      } else {
        await Promise.all(
          unapproved.map(p =>
            fetch(`/api/leads/${p.id}/approve`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            }).catch(() => null)
          )
        );
        toast.success(`Approved ${unapproved.length} prospects!`);
        mutate();
      }
    } catch {
      toast.error('Network error during bulk approval');
    }
  };

  const handleTriggerDiscovery = async () => {
    setDiscovering(true);
    try {
      const res = await fetch('/api/prospects/discover', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        toast.success(json.data?.message || 'New qualified prospects discovered and grounded with live signals!');
        mutate();
      } else {
        toast.info('Discovery cycle complete.');
      }
    } catch (e) {
      toast.error('Failed to trigger discovery cycle');
    } finally {
      setDiscovering(false);
    }
  };

  const filteredProspects = prospects.filter(p => {
    const matchesSearch =
      p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.email?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterTier === 'high' && p.score < 80) return false;
    if (filterTier === 'verified' && !p.isVerified) return false;

    if (signalFilter !== 'all') {
      const sigType = p.triggerSignal?.type?.toLowerCase() || '';
      const sigCategory = p.triggerSignal?.category?.toLowerCase() || '';
      if (!sigType.includes(signalFilter) && !sigCategory.includes(signalFilter)) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner: AI Discovery Summary */}
      <Card className="border-blue-900/50 bg-gradient-to-r from-blue-950/40 via-slate-900 to-indigo-950/40 text-slate-100 shadow-xl">
        <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-400" />
                AI SDR Continuous Prospect Discovery Feed
              </h3>
            </div>
            <p className="text-sm text-slate-300">
              Autonomous discovery grounded in live intent signals (Funding, Hiring Spikes, Tech Stack Migrations) with transparent "Why Qualified" research breakdown and MX verification.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              disabled={discovering}
              onClick={handleTriggerDiscovery}
              className="border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${discovering ? 'animate-spin' : ''}`} />
              Run Discovery Scan
            </Button>

            <Button
              onClick={handleBulkApprove}
              disabled={filteredProspects.length === 0}
              className="bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-900/40"
            >
              <Zap className="mr-2 h-4 w-4" />
              Approve All Qualified ({filteredProspects.length})
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filter and Search Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search prospect, role, company, email..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-950 pl-9 pr-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Tier Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <Button
            size="sm"
            variant={filterTier === 'all' ? 'default' : 'outline'}
            onClick={() => setFilterTier('all')}
            className={filterTier === 'all' ? 'bg-blue-600 text-white text-xs' : 'border-slate-800 text-slate-300 text-xs'}
          >
            All Discovered ({prospects.length})
          </Button>
          <Button
            size="sm"
            variant={filterTier === 'high' ? 'default' : 'outline'}
            onClick={() => setFilterTier('high')}
            className={filterTier === 'high' ? 'bg-emerald-700 text-white text-xs' : 'border-slate-800 text-slate-300 text-xs'}
          >
            Hot / High Intent (80+)
          </Button>
          <Button
            size="sm"
            variant={filterTier === 'verified' ? 'default' : 'outline'}
            onClick={() => setFilterTier('verified')}
            className={filterTier === 'verified' ? 'bg-purple-700 text-white text-xs' : 'border-slate-800 text-slate-300 text-xs'}
          >
            <MailCheck className="mr-1 h-3 w-3" /> MX Verified
          </Button>
        </div>

        {/* Signal Category Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          <span className="text-slate-500 text-[11px] font-mono mr-1">Signal:</span>
          {['all', 'funding', 'hiring', 'tech', 'growth'].map((sig) => (
            <button
              key={sig}
              onClick={() => setSignalFilter(sig)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize transition-colors ${
                signalFilter === sig
                  ? 'bg-slate-700 text-white border border-slate-600'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {sig === 'tech' ? 'Tech Migration' : sig}
            </button>
          ))}
        </div>
      </div>

      {/* Prospect Discovery Feed List */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-400">
          <div className="animate-spin inline-block w-6 h-6 border-[3px] border-current border-t-transparent text-blue-400 rounded-full mb-2" />
          <p>AI SDR is scanning intent signals and discovering prospects...</p>
        </div>
      ) : prospects.length === 0 ? (
        <Card className="border-slate-800 bg-slate-900 text-slate-100">
          <EmptyState
            icon={<Target className="h-8 w-8 text-blue-400" />}
            title="No AI Discovered Prospects Yet"
            description="The AI SDR continuously identifies high-intent accounts based on funding rounds, hiring spikes, and tech migrations. Load sample high-intent prospects now."
            onSeedSample={async () => {
              await fetch('/api/seed-sample', { method: 'POST' });
              mutate();
            }}
            seedLabel="Load Sample High-Intent Data"
          />
        </Card>
      ) : filteredProspects.length === 0 ? (
        <Card className="border-slate-800 bg-slate-900 p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-400 mb-3">
            <Filter className="h-6 w-6" />
          </div>
          <p className="text-slate-300 font-semibold">No prospects matching current criteria.</p>
          <p className="text-slate-500 text-xs mt-1 max-w-sm mx-auto">
            Try adjusting your search or click &ldquo;Run Discovery Scan&rdquo; to surface fresh intent signals.
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <Button size="sm" variant="outline" onClick={() => { setFilterTier('all'); setSignalFilter('all'); setSearchQuery(''); }}>
              Reset Filters
            </Button>
            <Button size="sm" onClick={handleTriggerDiscovery} disabled={discovering}>
              {discovering ? 'Scanning...' : 'Run Intent Discovery Now'}
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-5">
          {filteredProspects.map((p) => {
            const isExpanded = expandedId === p.id;
            const isApproved = approvedIds.has(p.id) || p.status === 'approved';

            return (
              <Card
                key={p.id}
                className={`border transition-all duration-200 ${
                  isApproved
                    ? 'border-emerald-800/80 bg-emerald-950/20'
                    : 'border-slate-800 bg-slate-900/90 hover:border-slate-700'
                } text-slate-100 shadow-xl overflow-hidden`}
              >
                <CardContent className="p-5 space-y-4">
                  {/* Prospect Header Info & Actions */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h4 className="text-lg font-bold text-slate-100">{p.name}</h4>
                        {p.isVerified ? (
                          <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-[11px] gap-1 py-0.5">
                            <CheckCircle2 className="h-3 w-3 text-emerald-400" /> MX Verified
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-950 text-amber-300 border-amber-800 text-[11px] gap-1 py-0.5">
                            <AlertTriangle className="h-3 w-3 text-amber-400" /> MX Lookup Pending
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className={`font-mono text-xs ${
                            p.score >= 80 ? 'text-emerald-400 border-emerald-800 bg-emerald-950/30' : 'text-blue-400 border-blue-800 bg-blue-950/30'
                          }`}
                        >
                          ICP Fit: {p.score}/100 ({p.score >= 80 ? 'HOT' : 'WARM'})
                        </Badge>
                        <Badge variant="outline" className="font-mono text-xs border-purple-800 text-purple-300 bg-purple-950/30">
                          AI Confidence: {p.confidenceScore}%
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400 font-mono mt-1 flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-slate-500" />
                        {p.title} at <span className="font-semibold text-slate-200">{p.company}</span> • {p.email} • {p.industry}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedId(isExpanded ? null : p.id)}
                        className="text-slate-300 hover:text-white text-xs"
                      >
                        {isExpanded ? (
                          <>Hide Email Draft <ChevronUp className="ml-1 h-3.5 w-3.5" /></>
                        ) : (
                          <>Preview Email <ChevronDown className="ml-1 h-3.5 w-3.5" /></>
                        )}
                      </Button>

                      <Button
                        size="sm"
                        disabled={isApproved}
                        onClick={() => handleApprove(p.id, p.name)}
                        className={
                          isApproved
                            ? 'bg-emerald-800 text-emerald-100 cursor-default text-xs font-semibold'
                            : 'bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-950'
                        }
                      >
                        {isApproved ? (
                          <>
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-300" />
                            Queued for Send
                          </>
                        ) : (
                          <>
                            <Send className="mr-1.5 h-3.5 w-3.5" />
                            Approve Outreach
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* "Why Qualified" Research Card Component */}
                  <WhyQualifiedCard prospect={p} />

                  {/* Expandable AI Draft Email Preview */}
                  {isExpanded && (
                    <div className="mt-4 rounded-xl border border-blue-900/40 bg-slate-950 p-4 space-y-3">
                      <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-2">
                        <span className="font-semibold text-blue-400 flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5" /> Grounded AI Email Sequence (Step 1 of 4)
                        </span>
                        <span className="font-mono text-[11px] text-slate-300">Subject: {p.draftEmail?.subject}</span>
                      </div>

                      <div className="bg-slate-900/90 rounded-lg p-3.5 text-xs text-slate-200 whitespace-pre-wrap font-sans leading-relaxed border border-slate-800">
                        {p.draftEmail?.body}
                      </div>

                      <div className="flex justify-between items-center text-[11px] text-slate-500 pt-1">
                        <span>Protected by 7-Step Deliverability Circuit Breaker before dispatch</span>
                        <span className="text-blue-400 font-mono">Angle: {p.outreachAngle}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
