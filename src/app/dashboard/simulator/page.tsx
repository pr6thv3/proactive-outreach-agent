'use client';

import { MailboxSimulator } from '@/components/dashboard/mailbox-simulator';
import { Smartphone, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function SimulatorPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-100 flex items-center gap-2">
              <Smartphone className="h-6 w-6 text-blue-400" />
              Interactive Mailbox & Reply Simulator
            </h1>
            <Badge className="bg-purple-950 text-purple-300 border-purple-800 text-xs px-2 py-0.5">
              Live Demo Sandbox
            </Badge>
          </div>
          <p className="text-slate-400 text-xs mt-1.5 max-w-2xl leading-relaxed">
            Experience outreach directly through the eyes of your prospects. Simulate opening emails, sending replies, booking calendar demos, or testing opt-out suppression without needing your own sending domain.
          </p>
        </div>
      </div>

      {/* Main Mailbox Simulator */}
      <MailboxSimulator />
    </div>
  );
}
