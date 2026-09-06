'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sparkles,
  DollarSign,
  TrendingUp,
  Cpu,
  UserPlus,
  ExternalLink,
  Search,
  Zap,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { EmptyState } from '@/components/dashboard/empty-state';

export function SignalFeed() {
  const [signals, setSignals] = useState<any[]>([]);
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchSignals = () => {
    setLoading(true);
    fetch(`/api/signals${filterType !== 'all' ? `?type=${filterType}` : ''}`)
      .then(res => res.json())
      .then(data => {
        if (data?.data?.signals && Array.isArray(data.data.signals)) {
          setSignals(data.data.signals);
        } else {
          setSignals([]);
        }
      })
      .catch(() => {
        setSignals([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSignals();
  }, [filterType]);

  const filteredSignals = signals.filter(sig => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      sig.company?.toLowerCase().includes(q) ||
      sig.content?.toLowerCase().includes(q) ||
      sig.industry?.toLowerCase().includes(q) ||
      sig.type?.toLowerCase().includes(q)
    );
  });

  const getSignalBadge = (type: string) => {
    switch (type) {
      case 'funding':
      case 'funding_round':
        return (
          <Badge className="bg-emerald-950 text-emerald-300 border border-emerald-800 text-xs flex items-center gap-1">
            <DollarSign className="h-3 w-3 text-emerald-400" /> Funding Round
          </Badge>
        );
      case 'hiring_spike':
      case 'hiring':
        return (
          <Badge className="bg-blue-950 text-blue-300 border border-blue-800 text-xs flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-blue-400" /> Hiring Surge
          </Badge>
        );
      case 'tech_stack':
      case 'tech_stack_migration':
        return (
          <Badge className="bg-purple-950 text-purple-300 border border-purple-800 text-xs flex items-center gap-1">
            <Cpu className="h-3 w-3 text-purple-400" /> Tech Migration
          </Badge>
        );
      case 'job_change':
      case 'executive_hire':
        return (
          <Badge className="bg-amber-950 text-amber-300 border border-amber-800 text-xs flex items-center gap-1">
            <UserPlus className="h-3 w-3 text-amber-400" /> Executive Hire
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-800 text-slate-300 border border-slate-700 text-xs">
            {type}
          </Badge>
        );
    }
  };

  return (
    <Card className="border-slate-800 bg-slate-900 text-slate-100 shadow-xl">
      <CardHeader className="flex flex-col md:flex-row md:items-center justify-between pb-4 gap-4 border-b border-slate-800">
        <div>
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-400" />
            Live Buying Signal Surveillance Stream
          </CardTitle>
          <CardDescription className="text-slate-400 text-xs mt-1">
            Autonomous crawlers continuously monitoring funding announcements, hiring spikes, and tech stack changes.
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="relative w-48">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search signals, companies..."
              className="pl-8 h-8 bg-slate-950 border-slate-800 text-xs text-slate-200"
            />
          </div>

          <button
            onClick={() => setFilterType('all')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
              filterType === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            All Signals
          </button>
          <button
            onClick={() => setFilterType('funding')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
              filterType === 'funding' ? 'bg-blue-600 text-white' : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Funding
          </button>
          <button
            onClick={() => setFilterType('hiring_spike')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
              filterType === 'hiring_spike' ? 'bg-blue-600 text-white' : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Hiring
          </button>
          <button
            onClick={() => setFilterType('tech_stack')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
              filterType === 'tech_stack' ? 'bg-blue-600 text-white' : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Tech Stack
          </button>

          <Button
            size="sm"
            variant="ghost"
            onClick={fetchSignals}
            className="h-8 w-8 p-0 text-slate-400 hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {loading ? (
          <div className="text-center py-12 text-sm text-slate-500">
            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-400" />
            Streaming live buying signals...
          </div>
        ) : signals.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-8 w-8 text-blue-400" />}
            title="No Intent Signals Detected Yet"
            description="Live buying signals (funding rounds, hiring spikes, tech migrations) will populate automatically. Load sample high-intent data now to explore signal-grounded intelligence."
            onSeedSample={async () => {
              await fetch('/api/seed-sample', { method: 'POST' });
              fetchSignals();
            }}
            seedLabel="Load Sample High-Intent Data"
          />
        ) : filteredSignals.length === 0 ? (
          <div className="text-center py-12 text-sm text-slate-500 border border-dashed border-slate-800 rounded-xl">
            No buying signals matching your filter.
          </div>
        ) : (
          filteredSignals.map(sig => (
            <div
              key={sig.id}
              className="rounded-xl border border-slate-800/80 bg-slate-950/80 p-4 space-y-3 hover:border-slate-700 transition-all shadow-md"
            >
              {/* Header: Company, Signal Badge, Score */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-bold text-sm text-slate-100">{sig.company || 'Target Company'}</span>
                  {sig.industry && (
                    <span className="text-xs text-slate-400 font-medium">({sig.industry})</span>
                  )}
                  {getSignalBadge(sig.type)}
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-400">
                    Intent Score:{' '}
                    <span className="font-bold font-mono text-emerald-400">{sig.score || 92}/100</span>
                  </span>
                  <span className="text-slate-500 text-[11px] font-mono">
                    {new Date(sig.detectedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* Signal Content & Citation */}
              <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/60 space-y-2">
                <p className="text-xs text-slate-200 leading-relaxed font-medium">
                  "{sig.content}"
                </p>
                {sig.sourceUrl && (
                  <div className="flex items-center gap-1.5 text-[11px] text-blue-400 font-mono">
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <a
                      href={sig.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline truncate max-w-lg"
                    >
                      {sig.sourceTitle || sig.sourceUrl}
                    </a>
                  </div>
                )}
              </div>

              {/* Strategic Outreach Angle & 1-Click Launch */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-slate-800/60 text-xs">
                <div className="text-slate-400 flex items-center gap-1.5">
                  <span className="font-semibold text-slate-300">Outreach Angle:</span>
                  <span className="text-slate-300 italic">{sig.suggestedAngle || 'Reference expansion milestone in subject and opening hook.'}</span>
                </div>

                <Link
                  href={`/dashboard/campaigns/new?signal=${encodeURIComponent(sig.content)}&company=${encodeURIComponent(sig.company || '')}&offer=${encodeURIComponent(sig.suggestedAngle || '')}`}
                >
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-950/40 h-7 shrink-0"
                  >
                    <Zap className="mr-1 h-3 w-3" /> Launch Campaign from Signal
                  </Button>
                </Link>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
