'use client';

import { SmartInbox } from '@/components/dashboard/smart-inbox';
import { Card, CardContent } from '@/components/ui/card';
import { Mail, CalendarCheck, ShieldAlert, Sparkles } from 'lucide-react';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function InboxPage() {
  const { data } = useSWR('/api/inbox', fetcher);
  const counts = data?.data?.counts || {
    all: 6,
    meeting_request: 1,
    interested: 1,
    question: 1,
    out_of_office: 1,
    unsubscribe: 1,
    not_interested: 1,
  };

  return (
    <div className="space-y-6">
      {/* Header & Quick Stat Banners */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-blue-400" />
            AI Smart Inbox & Reply Intelligence
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Real-time 6-category classification (Meetings, Interested, Questions, OOO, Not Interested, Opt-Outs) with automated calendar escalation and permanent DNC suppression.
          </p>
        </div>
      </div>

      {/* Quick Status Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-slate-800 bg-slate-900/60 p-3 rounded-xl">
          <CardContent className="p-0 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 font-medium">Total Inbound</span>
              <p className="text-xl font-bold text-slate-100">{counts.all}</p>
            </div>
            <div className="p-2 rounded-lg bg-blue-950/40 text-blue-400 border border-blue-900/30">
              <Mail className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60 p-3 rounded-xl">
          <CardContent className="p-0 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-emerald-400 font-medium">Meetings & Warm Leads</span>
              <p className="text-xl font-bold text-emerald-300">{(counts.meeting_request || 0) + (counts.interested || 0)}</p>
            </div>
            <div className="p-2 rounded-lg bg-emerald-950/40 text-emerald-400 border border-emerald-900/30">
              <CalendarCheck className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60 p-3 rounded-xl">
          <CardContent className="p-0 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-purple-400 font-medium">Questions & Inquiries</span>
              <p className="text-xl font-bold text-purple-300">{counts.question || 0}</p>
            </div>
            <div className="p-2 rounded-lg bg-purple-950/40 text-purple-400 border border-purple-900/30">
              <Sparkles className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60 p-3 rounded-xl">
          <CardContent className="p-0 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-red-400 font-medium">DNC Suppressed</span>
              <p className="text-xl font-bold text-red-300">{counts.unsubscribe || 0}</p>
            </div>
            <div className="p-2 rounded-lg bg-red-950/40 text-red-400 border border-red-900/30">
              <ShieldAlert className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>
      </div>

      <SmartInbox />
    </div>
  );
}
