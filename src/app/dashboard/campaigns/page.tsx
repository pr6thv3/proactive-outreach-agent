'use client';

import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Send } from 'lucide-react';
import useSWR from 'swr';
import { EmptyState } from '@/components/dashboard/empty-state';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function CampaignsPage() {
  const { data, mutate } = useSWR('/api/campaigns', fetcher);
  const campaigns: any[] = data?.data || [];

  const handleSeedSample = async () => {
    await fetch('/api/seed-sample', { method: 'POST' });
    mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Outreach Campaigns</h2>
          <p className="text-slate-400 text-sm">Automated multi-step cold email sequences with personalized AI variables.</p>
        </div>

        <Link href="/dashboard/campaigns/new">
          <Button className="bg-blue-600 hover:bg-blue-500 text-white">
            <Plus className="mr-2 h-4 w-4" /> Create Campaign
          </Button>
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <Card className="border-slate-800 bg-slate-900 text-slate-100">
          <EmptyState
            icon={<Send className="h-8 w-8" />}
            title="No Campaigns Yet"
            description="Create your first multi-channel outreach campaign, or load sample data to explore the system instantly."
            actionLabel="Create Your First Campaign"
            actionHref="/dashboard/campaigns/new"
            onSeedSample={handleSeedSample}
            seedLabel="Load Sample High-Intent Data"
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {campaigns.map((camp) => (
            <Card key={camp.id} className="border-slate-800 bg-slate-900 text-slate-100">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-lg font-bold">{camp.name}</CardTitle>
                <Badge
                  className={
                    camp.status === 'ACTIVE' || camp.status === 'active'
                      ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                      : 'bg-amber-950 text-amber-400 border-amber-800'
                  }
                >
                  {camp.status}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="rounded bg-slate-950 p-3 border border-slate-800">
                    <span className="text-slate-400">Enrolled Leads</span>
                    <div className="text-xl font-bold text-slate-100 mt-1">{camp._count?.campaignLeads ?? 0}</div>
                  </div>
                  <div className="rounded bg-slate-950 p-3 border border-slate-800">
                    <span className="text-slate-400">Emails Generated</span>
                    <div className="text-xl font-bold text-slate-100 mt-1">{camp._count?.outreachEmails ?? 0}</div>
                  </div>
                </div>

                <div className="text-xs text-slate-400 font-mono">
                  From: {camp.fromName || 'Alex'} &lt;{camp.fromEmail || 'outreach@acmesaas.com'}&gt;
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
