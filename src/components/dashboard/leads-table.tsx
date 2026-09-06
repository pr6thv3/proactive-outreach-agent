'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckSquare,
  Square,
  ShieldCheck,
  AlertTriangle,
  Zap,
  ExternalLink,
  MailCheck,
  Download,
  Ban,
  CheckCircle2,
  Trash2,
  Filter,
  Play,
  RefreshCw,
  Users,
} from 'lucide-react';
import useSWR from 'swr';
import { EmptyState } from '@/components/dashboard/empty-state';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export type SortField = 'name' | 'company' | 'title' | 'score' | 'status' | 'isVerified';
export type SortOrder = 'asc' | 'desc';

const STATUS_PILLS = [
  { id: 'all', label: 'All Statuses' },
  { id: 'new', label: 'New' },
  { id: 'discovered', label: 'Discovered' },
  { id: 'enriched', label: 'Enriched' },
  { id: 'approved', label: 'Approved' },
  { id: 'sent', label: 'Sent' },
  { id: 'interested', label: 'Interested' },
  { id: 'meeting_booked', label: 'Meetings' },
];

export function LeadsTable() {
  const { data, mutate, isLoading } = useSWR('/api/prospects', fetcher);
  const rawLeads: any[] = data?.data || [];

  // Filter & Search State
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [verificationFilter, setVerificationFilter] = useState<'all' | 'verified' | 'unverified'>('all');
  const [minScoreFilter, setMinScoreFilter] = useState<number>(0);

  // Sorting State
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Bulk Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isActing, setIsActing] = useState(false);

  // Handle Sort Toggle
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'score' ? 'desc' : 'asc');
    }
  };

  // Filter and Sort Processing
  const processedLeads = useMemo(() => {
    let result = [...rawLeads];

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        l =>
          l.name?.toLowerCase().includes(q) ||
          l.company?.toLowerCase().includes(q) ||
          l.email?.toLowerCase().includes(q) ||
          l.title?.toLowerCase().includes(q) ||
          l.industry?.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(l => (l.status || '').toLowerCase() === statusFilter.toLowerCase());
    }

    // Verification filter
    if (verificationFilter === 'verified') {
      result = result.filter(l => l.isVerified || l.mxVerified || l.emailVerified);
    } else if (verificationFilter === 'unverified') {
      result = result.filter(l => !l.isVerified && !l.mxVerified && !l.emailVerified);
    }

    // Score filter
    if (minScoreFilter > 0) {
      result = result.filter(l => (l.score ?? 0) >= minScoreFilter);
    }

    // Sorting
    result.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (sortField === 'score') {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      } else if (sortField === 'isVerified') {
        valA = !!(a.isVerified || a.mxVerified || a.emailVerified);
        valB = !!(b.isVerified || b.mxVerified || b.emailVerified);
      } else {
        valA = String(valA || '').toLowerCase();
        valB = String(valB || '').toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [rawLeads, search, statusFilter, verificationFilter, minScoreFilter, sortField, sortOrder]);

  // Bulk Selection Toggles
  const allSelected = processedLeads.length > 0 && processedLeads.every(l => selectedIds.has(l.id));

  const handleToggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(processedLeads.map(l => l.id)));
    }
  };

  const handleToggleRow = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Bulk Actions
  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    setIsActing(true);
    try {
      const ids = Array.from(selectedIds);
      await fetch('/api/messages/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          messageIds: ids,
        }),
      }).catch(() => null);

      // Also PATCH leads to approved
      await Promise.all(
        ids.map(id =>
          fetch(`/api/leads/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'approved' }),
          }).catch(() => null)
        )
      );

      toast.success(`Bulk approved ${ids.length} leads! Added to outreach send queue.`);
      setSelectedIds(new Set());
      mutate();
    } catch {
      toast.error('Failed to bulk approve leads.');
    } finally {
      setIsActing(false);
    }
  };

  const handleBulkDnc = async () => {
    if (selectedIds.size === 0) return;
    setIsActing(true);
    try {
      const ids = Array.from(selectedIds);
      await Promise.all(
        ids.map(id =>
          fetch(`/api/leads/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ doNotContact: true, isBlacklisted: true }),
          }).catch(() => null)
        )
      );

      toast.warning(`Marked ${ids.length} leads as Do-Not-Contact (DNC). Dispatches permanently suppressed.`);
      setSelectedIds(new Set());
      mutate();
    } catch {
      toast.error('Failed to update DNC status.');
    } finally {
      setIsActing(false);
    }
  };

  const handleExportCsv = () => {
    const selected = processedLeads.filter(l => selectedIds.has(l.id));
    const targetList = selected.length > 0 ? selected : processedLeads;

    const headers = ['Name', 'Email', 'Company', 'Title', 'Score', 'Status', 'MX Verified'];
    const rows = targetList.map(l => [
      `"${l.name || ''}"`,
      `"${l.email || ''}"`,
      `"${l.company || ''}"`,
      `"${l.title || ''}"`,
      l.score || 0,
      `"${l.status || 'new'}"`,
      l.isVerified || l.mxVerified ? 'true' : 'false',
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `leads_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${targetList.length} leads to CSV.`);
  };

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 ml-1 text-slate-600 inline" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="h-3 w-3 ml-1 text-blue-400 inline" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1 text-blue-400 inline" />
    );
  };

  if (isLoading) {
    return (
      <div className="p-16 text-center text-slate-400 space-y-3">
        <RefreshCw className="h-7 w-7 animate-spin mx-auto text-blue-400" />
        <p className="text-sm">Loading leads table and verification statuses...</p>
      </div>
    );
  }

  if (rawLeads.length === 0) {
    return (
      <Card className="border-slate-800 bg-slate-900 text-slate-100">
        <EmptyState
          icon={<Users className="h-8 w-8 text-blue-400" />}
          title="No Leads in Directory Yet"
          description="Import your lead CSV or load sample high-intent accounts to test automated tiered enrichment, sorting, filtering, and bulk outreach dispatch."
          actionLabel="Import Lead CSV"
          actionHref="/dashboard/leads/import"
          onSeedSample={async () => {
            await fetch('/api/seed-sample', { method: 'POST' });
            mutate();
          }}
          seedLabel="Load Sample High-Intent Data"
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── Search and Filter Control Toolbar ─── */}
      <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 space-y-3 shadow-lg">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              placeholder="Search leads, email, company, title..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-slate-950 border-slate-800 text-xs text-slate-100 placeholder:text-slate-500 h-9"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
            {/* MX Verified Filter Button */}
            <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
              <Button
                size="sm"
                variant={verificationFilter === 'all' ? 'default' : 'ghost'}
                onClick={() => setVerificationFilter('all')}
                className={`h-7 px-2 text-[11px] ${verificationFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}
              >
                All
              </Button>
              <Button
                size="sm"
                variant={verificationFilter === 'verified' ? 'default' : 'ghost'}
                onClick={() => setVerificationFilter('verified')}
                className={`h-7 px-2 text-[11px] ${verificationFilter === 'verified' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'text-slate-400'}`}
              >
                <MailCheck className="h-3 w-3 mr-1 text-emerald-400" /> Verified
              </Button>
            </div>

            {/* High Fit Filter Button */}
            <Button
              size="sm"
              variant={minScoreFilter >= 80 ? 'default' : 'outline'}
              onClick={() => setMinScoreFilter(prev => (prev >= 80 ? 0 : 80))}
              className={`h-8 text-xs border-slate-800 ${minScoreFilter >= 80 ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
            >
              <Zap className="h-3 w-3 mr-1 text-blue-400" /> &gt;= 80 Fit
            </Button>

            {/* Export CSV Button */}
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportCsv}
              className="h-8 text-xs border-slate-800 text-slate-300 hover:bg-slate-800"
            >
              <Download className="h-3 w-3 mr-1 text-slate-400" /> Export CSV
            </Button>
          </div>
        </div>

        {/* Status Pill Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 text-xs">
          <span className="text-slate-500 font-mono text-[11px] mr-1">Status:</span>
          {STATUS_PILLS.map(p => (
            <button
              key={p.id}
              onClick={() => setStatusFilter(p.id)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                statusFilter === p.id
                  ? 'bg-blue-600 text-white font-semibold shadow-sm'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Bulk Action Banner (when >=1 lead selected) ─── */}
      {selectedIds.size > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-gradient-to-r from-blue-950/80 via-slate-900 to-indigo-950/80 p-3.5 rounded-xl border border-blue-800 shadow-lg text-xs">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 font-mono font-bold text-white text-[11px]">
              {selectedIds.size}
            </span>
            <span className="font-semibold text-slate-200">
              {selectedIds.size} {selectedIds.size === 1 ? 'lead' : 'leads'} selected for bulk action
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={handleBulkApprove}
              disabled={isActing}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs h-8"
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Bulk Approve
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkDnc}
              disabled={isActing}
              className="border-red-800 text-red-300 hover:bg-red-950/50 text-xs h-8"
            >
              <Ban className="h-3.5 w-3.5 mr-1 text-red-400" /> Suppress (DNC)
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleExportCsv}
              className="border-slate-700 text-slate-200 hover:bg-slate-800 text-xs h-8"
            >
              <Download className="h-3.5 w-3.5 mr-1" /> Export Selected
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
              className="text-slate-400 hover:text-white text-xs h-8"
            >
              Deselect All
            </Button>
          </div>
        </div>
      )}

      {/* ─── Main Leads Table ─── */}
      <Card className="border-slate-800 bg-slate-900 text-slate-100 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-200">
            <thead className="bg-slate-950 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800 select-none">
              <tr>
                {/* Select All Checkbox */}
                <th className="px-4 py-3.5 w-10 text-center">
                  <button onClick={handleToggleSelectAll} className="text-slate-400 hover:text-white">
                    {allSelected ? (
                      <CheckSquare className="h-4 w-4 text-blue-400" />
                    ) : (
                      <Square className="h-4 w-4 text-slate-600" />
                    )}
                  </button>
                </th>

                <th className="px-4 py-3.5 cursor-pointer hover:text-slate-200" onClick={() => handleSort('name')}>
                  Lead Name {renderSortIndicator('name')}
                </th>

                <th className="px-4 py-3.5 cursor-pointer hover:text-slate-200" onClick={() => handleSort('company')}>
                  Company & Title {renderSortIndicator('company')}
                </th>

                <th className="px-4 py-3.5">Trigger Signal</th>

                <th className="px-4 py-3.5 cursor-pointer hover:text-slate-200" onClick={() => handleSort('score')}>
                  ICP Score {renderSortIndicator('score')}
                </th>

                <th className="px-4 py-3.5 cursor-pointer hover:text-slate-200" onClick={() => handleSort('isVerified')}>
                  MX Verification {renderSortIndicator('isVerified')}
                </th>

                <th className="px-4 py-3.5 cursor-pointer hover:text-slate-200" onClick={() => handleSort('status')}>
                  Status {renderSortIndicator('status')}
                </th>

                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/80">
              {processedLeads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-500">
                    No leads match current filter criteria.
                  </td>
                </tr>
              ) : (
                processedLeads.map(lead => {
                  const isSelected = selectedIds.has(lead.id);
                  const isVerified = lead.isVerified || lead.mxVerified || lead.emailVerified;
                  const score = lead.score ?? 80;

                  return (
                    <tr
                      key={lead.id}
                      className={`hover:bg-slate-850/50 transition-colors ${
                        isSelected ? 'bg-blue-950/20' : ''
                      }`}
                    >
                      {/* Row Checkbox */}
                      <td className="px-4 py-3.5 text-center">
                        <button onClick={() => handleToggleRow(lead.id)} className="text-slate-400 hover:text-white">
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-blue-400" />
                          ) : (
                            <Square className="h-4 w-4 text-slate-600" />
                          )}
                        </button>
                      </td>

                      {/* Lead Name & Email */}
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-100">{lead.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{lead.email}</div>
                      </td>

                      {/* Company & Role */}
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-slate-200">{lead.company || 'Enterprise Account'}</div>
                        <div className="text-[11px] text-slate-400">{lead.title || 'Leadership'}</div>
                      </td>

                      {/* Trigger Signal */}
                      <td className="px-4 py-3.5 max-w-xs">
                        <Badge className="text-[9px] bg-blue-950 text-blue-300 border-blue-800 mb-0.5">
                          {lead.triggerSignal?.category || 'Intent Signal'}
                        </Badge>
                        <p className="text-[11px] text-slate-300 truncate">
                          {lead.triggerSignal?.content || lead.whyFound || 'Company growth trajectory detected'}
                        </p>
                      </td>

                      {/* ICP Fit Score */}
                      <td className="px-4 py-3.5 font-mono font-bold">
                        <span
                          className={
                            score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-slate-400'
                          }
                        >
                          {score} / 100
                        </span>
                      </td>

                      {/* MX Verification Gate */}
                      <td className="px-4 py-3.5">
                        {isVerified ? (
                          <Badge className="bg-emerald-950 text-emerald-400 border-emerald-800 text-[10px] gap-1 font-mono">
                            <ShieldCheck className="h-3 w-3" /> MX Verified
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-950 text-amber-400 border-amber-800 text-[10px] gap-1 font-mono">
                            <AlertTriangle className="h-3 w-3" /> Pending MX
                          </Badge>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <Badge
                          variant="outline"
                          className="capitalize text-[10px] border-slate-700 text-slate-300"
                        >
                          {lead.status || 'new'}
                        </Badge>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href={`/dashboard/leads/${lead.id}`}>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-blue-400 hover:text-blue-300 p-1 px-2">
                              Details <ExternalLink className="h-3 w-3 ml-1" />
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer Summary */}
        <div className="p-3 border-t border-slate-800 bg-slate-950 text-[11px] text-slate-400 flex justify-between items-center">
          <span>
            Showing <strong className="text-slate-200">{processedLeads.length}</strong> of{' '}
            <strong className="text-slate-200">{rawLeads.length}</strong> total leads
          </span>
          <span className="font-mono">
            Sorted by {sortField} ({sortOrder})
          </span>
        </div>
      </Card>
    </div>
  );
}
