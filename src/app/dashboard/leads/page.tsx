'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Upload,
  LayoutGrid,
  List,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import useSWR from 'swr';
import { WhyQualifiedCard } from '@/components/dashboard/why-qualified-card';
import { LeadsTable } from '@/components/dashboard/leads-table';
import { CsvImportDialog } from '@/components/dashboard/csv-import-dialog';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function LeadsPage() {
  const { data, isLoading } = useSWR('/api/prospects', fetcher);
  const leads: any[] = data?.data || [];

  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-blue-400" />
            Prospects & Leads Directory
          </h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Continuous directory of AI-qualified prospects with sorting, filtering, bulk actions, and deliverability verification.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center rounded-lg border border-slate-800 bg-slate-900 p-1">
            <Button
              size="sm"
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              onClick={() => setViewMode('table')}
              className={viewMode === 'table' ? 'bg-blue-600 text-white h-7 px-2.5 text-xs' : 'text-slate-400 h-7 px-2.5 text-xs'}
            >
              <List className="h-3.5 w-3.5 mr-1" /> Table & Bulk Actions
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'cards' ? 'default' : 'ghost'}
              onClick={() => setViewMode('cards')}
              className={viewMode === 'cards' ? 'bg-blue-600 text-white h-7 px-2.5 text-xs' : 'text-slate-400 h-7 px-2.5 text-xs'}
            >
              <LayoutGrid className="h-3.5 w-3.5 mr-1" /> Research Cards
            </Button>
          </div>

          <CsvImportDialog />
        </div>
      </div>

      {/* View Content */}
      {viewMode === 'table' ? (
        <LeadsTable />
      ) : isLoading ? (
        <div className="p-12 text-center text-slate-400">Loading prospects and intelligence cards...</div>
      ) : leads.length === 0 ? (
        <Card className="border-slate-800 bg-slate-900 p-12 text-center">
          <p className="text-slate-400">No prospects available.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {leads.map((lead: any) => (
            <div key={lead.id} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-200">{lead.name}</span>
                  <span className="text-xs text-slate-400 font-mono">({lead.company})</span>
                </div>
                <Link href={`/dashboard/leads/${lead.id}`}>
                  <span className="text-xs text-blue-400 hover:underline inline-flex items-center gap-1 font-medium">
                    View Lead Details <ExternalLink className="h-3 w-3" />
                  </span>
                </Link>
              </div>
              <WhyQualifiedCard prospect={lead} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
