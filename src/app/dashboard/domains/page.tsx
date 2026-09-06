'use client';

import { DomainVerifier } from '@/components/dashboard/domain-verifier';
import { ShieldCheck, Sparkles, Globe, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function DomainsPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-100 flex items-center gap-2">
              <Globe className="h-6 w-6 text-blue-400" />
              Sending Domains & DNS Deliverability
            </h1>
            <Badge className="bg-emerald-950 text-emerald-400 border-emerald-800 text-xs px-2 py-0.5">
              Multi-Domain Shield
            </Badge>
          </div>
          <p className="text-slate-400 text-xs mt-1.5 max-w-2xl leading-relaxed">
            Configure dedicated secondary sending domains (e.g. <span className="font-mono text-slate-300">outreach.acme.com</span>) to protect your primary domain reputation, prevent spam classification, and guarantee maximum inbox placement.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="rounded-lg bg-slate-900 border border-slate-800 p-2.5 flex items-center gap-2 text-xs text-slate-300">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>2048-Bit DKIM + SPF + DMARC Enforcement</span>
          </div>
        </div>
      </div>

      {/* Main Domain Setup & Verification Interface */}
      <DomainVerifier />
    </div>
  );
}

