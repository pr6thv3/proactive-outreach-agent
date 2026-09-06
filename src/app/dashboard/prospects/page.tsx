'use client';

import { ProspectDiscoveryFeed } from '@/components/dashboard/prospect-discovery-feed';

export default function ProspectsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-100">AI Prospect Discovery</h2>
        <p className="text-slate-400 text-sm">
          Continuously identified high-intent prospects based on live hiring, funding, and technology signals.
        </p>
      </div>

      <ProspectDiscoveryFeed />
    </div>
  );
}
