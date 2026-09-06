'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Check,
  Copy,
  RefreshCw,
  ShieldCheck,
  Plus,
  Globe,
  Mail,
  User,
  AlertTriangle,
  Info,
  ShieldAlert,
  Trash2,
  ExternalLink,
  HelpCircle,
} from 'lucide-react';
import useSWR from 'swr';
import { EmptyState } from '@/components/dashboard/empty-state';

const fetcher = (url: string) => fetch(url).then(r => r.json());

// Helper to determine the unified domain status
export function getDomainStatusInfo(domain: any): {
  status: 'active' | 'pending' | 'suspended';
  label: string;
  badgeClass: string;
  dotClass: string;
} {
  const statusLower = (domain?.status || '').toLowerCase();
  
  if (statusLower === 'suspended' || domain?.isSuspended) {
    return {
      status: 'suspended',
      label: 'Suspended',
      badgeClass: 'bg-red-950 text-red-400 border-red-800',
      dotClass: 'bg-red-400',
    };
  }

  const spfOk = !!(domain?.spfVerified || domain?.dns?.spf?.verified || statusLower === 'active' || statusLower === 'verified');
  const dkimOk = !!(domain?.dkimVerified || domain?.dns?.dkim?.verified || statusLower === 'active' || statusLower === 'verified');
  const dmarcOk = !!(domain?.dmarcVerified || domain?.dns?.dmarc?.verified || statusLower === 'active' || statusLower === 'verified');
  const isVerified = statusLower === 'active' || statusLower === 'verified' || (spfOk && dkimOk && dmarcOk);

  if (isVerified) {
    return {
      status: 'active',
      label: 'ACTIVE / Verified',
      badgeClass: 'bg-emerald-950 text-emerald-400 border-emerald-800',
      dotClass: 'bg-emerald-400',
    };
  }

  return {
    status: 'pending',
    label: 'Verification Pending',
    badgeClass: 'bg-amber-950 text-amber-400 border-amber-800',
    dotClass: 'bg-amber-400',
  };
}

export function DomainVerifier() {
  const { data, mutate, isLoading } = useSWR('/api/domains', fetcher);
  const domains: any[] = data?.data || [];

  const [newDomain, setNewDomain] = useState('');
  const [newFromEmail, setNewFromEmail] = useState('');
  const [newFromName, setNewFromName] = useState('');
  const [adding, setAdding] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDomain = newDomain.trim().toLowerCase().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    const cleanEmail = newFromEmail.trim().toLowerCase();

    if (!cleanDomain || !cleanEmail) {
      toast.error('Please enter both domain name and sender email');
      return;
    }

    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(cleanDomain)) {
      toast.error('Invalid domain name format (e.g. outreach.acme.com)');
      return;
    }

    if (!cleanEmail.includes('@') || !cleanEmail.endsWith(cleanDomain)) {
      toast.error(`Sender email must belong to the domain (e.g. alex@${cleanDomain})`);
      return;
    }

    setAdding(true);
    try {
      const res = await fetch('/api/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: cleanDomain,
          fromEmail: cleanEmail,
          fromName: newFromName.trim() || 'Alex',
        }),
      });

      const json = await res.json();
      if (res.ok) {
        toast.success(`Domain ${cleanDomain} added successfully! Copy DNS records below to verify.`);
        setNewDomain('');
        setNewFromEmail('');
        setNewFromName('');
        mutate();
      } else {
        toast.error(json.error?.message || 'Failed to add domain');
      }
    } catch {
      toast.error('Network error adding domain');
    } finally {
      setAdding(false);
    }
  };

  const handleVerify = async (domainId: string, domainName: string) => {
    setVerifyingId(domainId);
    try {
      const res = await fetch(`/api/sending-domains/${domainId}/verify`);
      const json = await res.json();
      if (res.ok) {
        toast.success(`DNS verified for ${domainName}! Domain status is now ACTIVE.`);
        mutate();
      } else {
        toast.error(json.error?.message || 'DNS records pending propagation. Please check registrar settings.');
      }
    } catch {
      toast.error('Network error verifying DNS records');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDelete = async (domainId: string, domainName: string) => {
    if (!confirm(`Are you sure you want to suspend/remove ${domainName}? Queued messages from this domain will pause.`)) {
      return;
    }

    setDeletingId(domainId);
    try {
      const res = await fetch('/api/domains', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainId }),
      });

      if (res.ok) {
        toast.success(`Domain ${domainName} suspended successfully.`);
        mutate();
      } else {
        toast.error('Failed to suspend domain');
      }
    } catch {
      toast.error('Network error suspending domain');
    } finally {
      setDeletingId(null);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    toast.success(`Copied ${label} to clipboard`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* ─── Clear Conceptual Architecture Explanation ─── */}
      <Card className="border-slate-800 bg-slate-900/90 text-slate-100 shadow-xl overflow-hidden">
        <CardHeader className="pb-3 border-b border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-400" />
            <CardTitle className="text-base font-bold text-slate-100">
              Secondary Sending Domain Strategy & Architecture
            </CardTitle>
          </div>
          <CardDescription className="text-slate-400 text-xs mt-1">
            Understanding the difference between Domain Name, Sender Email Address, and Display Name:
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* 1. Domain Name */}
            <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/70 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-400">
                <Globe className="h-4 w-4" />
                1. Domain Name
              </div>
              <div className="font-mono text-xs font-bold text-slate-200">
                e.g. outreach.acmesaas.com
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                A dedicated secondary domain or subdomain specifically for outbound SDR messaging. This completely protects your primary corporate domain (<code className="text-slate-300">acmesaas.com</code>) from reputation degradation.
              </p>
            </div>

            {/* 2. Sender Email Address */}
            <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/70 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-indigo-400">
                <Mail className="h-4 w-4" />
                2. Sender Email Address
              </div>
              <div className="font-mono text-xs font-bold text-slate-200">
                e.g. alex@outreach.acmesaas.com
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                The exact mailbox that sends the messages and receives incoming prospect replies. Responses route directly to the AI Smart Inbox for automatic intent classification.
              </p>
            </div>

            {/* 3. Sender Display Name */}
            <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/70 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-purple-400">
                <User className="h-4 w-4" />
                3. Sender Display Name
              </div>
              <div className="font-mono text-xs font-bold text-slate-200">
                e.g. Alex Rivera from Acme
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                The human-friendly sender identity shown in the prospect&apos;s email client inbox list. Professional display names increase open rates by up to 28%.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Add New Sending Domain Form ─── */}
      <Card className="border-slate-800 bg-slate-900 text-slate-100 shadow-xl">
        <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Plus className="h-5 w-5 text-blue-400" />
              Connect New Sending Domain
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">
              Add a dedicated outreach domain. SPF, DKIM, and DMARC records will be generated automatically.
            </CardDescription>
          </div>

          <Button
            type="button"
            size="sm"
            onClick={() => {
              const randomSuffix = Math.floor(100 + Math.random() * 900);
              const autoDomain = `outreach-team${randomSuffix}.io`;
              setNewDomain(autoDomain);
              setNewFromEmail(`alex@${autoDomain}`);
              setNewFromName('Alex from Growth Team');
              toast.info(`Generated instant sandbox domain: ${autoDomain}. Click "Connect Domain" to activate.`);
            }}
            variant="outline"
            className="bg-purple-950/40 border-purple-800 text-purple-300 hover:bg-purple-900/60 hover:text-white text-xs shrink-0 h-8"
          >
            ⚡ 1-Click Instant Sandbox Domain
          </Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddDomain} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Domain Name <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Globe className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <Input
                    placeholder="outreach.acmesaas.com"
                    value={newDomain}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewDomain(val);
                      if (!newFromEmail || newFromEmail.startsWith('alex@')) {
                        setNewFromEmail(`alex@${val}`);
                      }
                    }}
                    className="pl-9 bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-600 h-9 text-xs"
                  />
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Dedicated outreach subdomain or domain</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Sender Email Address <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <Input
                    placeholder="alex@outreach.acmesaas.com"
                    value={newFromEmail}
                    onChange={(e) => setNewFromEmail(e.target.value)}
                    className="pl-9 bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-600 h-9 text-xs"
                  />
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">The From: address prospects reply to</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Sender Display Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <Input
                    placeholder="Alex Rivera"
                    value={newFromName}
                    onChange={(e) => setNewFromName(e.target.value)}
                    className="pl-9 bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-600 h-9 text-xs"
                  />
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Shown as the human sender in inbox client</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-2 border-t border-slate-800/80">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>Automatic 2048-bit DKIM keypair & SPF record generated on creation.</span>
              </div>

              <Button type="submit" disabled={adding} className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-8 px-4">
                {adding ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
                Add Domain
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ─── Sending Domains List with Synchronized Badges & Copyable DNS Helpers ─── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Globe className="h-5 w-5 text-emerald-400" />
            Configured Sending Domains ({domains.length})
          </h3>
          <span className="text-xs text-slate-400">
            {domains.filter(d => getDomainStatusInfo(d).status === 'active').length} of {domains.length} Active
          </span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-400 bg-slate-900 rounded-lg border border-slate-800">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-400" />
            Loading sending domains...
          </div>
        ) : domains.length === 0 ? (
          <Card className="border-slate-800 bg-slate-900 text-slate-100">
            <EmptyState
              icon={<Globe className="h-8 w-8 text-blue-400" />}
              title="No Sending Domains Configured Yet"
              description="Connect your dedicated secondary outreach domain to generate SPF, DKIM, and DMARC DNS deliverability records, or load sample high-intent data."
              onSeedSample={async () => {
                await fetch('/api/seed-sample', { method: 'POST' });
                mutate();
              }}
              seedLabel="Load Sample High-Intent Data"
            />
          </Card>
        ) : (
          domains.map((dom: any) => {
            const statusInfo = getDomainStatusInfo(dom);
            const isVerified = statusInfo.status === 'active';
            const isSuspended = statusInfo.status === 'suspended';
            const domainName = dom.domain || dom.name || 'outreach.acmesaas.com';
            const fromEmail = dom.fromEmail || `alex@${domainName}`;
            const fromName = dom.fromName || 'Alex';
            const isVerifying = verifyingId === dom.id;
            const isDeleting = deletingId === dom.id;

            const spfOk = !!(dom.spfVerified || dom.dns?.spf?.verified || isVerified);
            const dkimOk = !!(dom.dkimVerified || dom.dns?.dkim?.verified || isVerified);
            const dmarcOk = !!(dom.dmarcVerified || dom.dns?.dmarc?.verified || isVerified);

            // DNS Records with clear plain-English explanations
            const dnsRecords = [
              {
                type: 'CNAME',
                name: 'DKIM (DomainKeys Identified Mail)',
                host: `resend._domainkey.${domainName}`,
                value: 'resend.com',
                ttl: '3600 (1 hour)',
                verified: dkimOk,
                explanation: 'Attaches a tamper-proof cryptographic digital signature to every email header, proving the message genuinely originated from your server and was not altered in transit.',
              },
              {
                type: 'TXT',
                name: 'SPF (Sender Policy Framework)',
                host: domainName,
                value: 'v=spf1 include:resend.com ~all',
                ttl: '3600 (1 hour)',
                verified: spfOk,
                explanation: 'Authorizes our dedicated mail delivery servers to send emails on behalf of this domain, preventing receiving mailboxes from flagging your outreach as unauthenticated spoofing.',
              },
              {
                type: 'TXT',
                name: 'DMARC (Message Authentication & Reporting)',
                host: `_dmarc.${domainName}`,
                value: 'v=DMARC1; p=none; rua=mailto:dmarc@resend.com',
                ttl: '3600 (1 hour)',
                verified: dmarcOk,
                explanation: 'Provides policy instructions to recipient mail systems (Google Workspace, Microsoft 365) on handling unauthenticated messages and protects your company from domain impersonation.',
              },
            ];

            return (
              <Card key={dom.id} className="border-slate-800 bg-slate-900 text-slate-100 shadow-xl overflow-hidden">
                {/* Domain Header Card */}
                <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 bg-slate-950/40 gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <CardTitle className="text-lg font-bold flex items-center gap-2 text-white">
                        <Globe className="h-5 w-5 text-blue-400" />
                        {domainName}
                      </CardTitle>

                      {/* Synchronized, Unambiguous Status Badge */}
                      <Badge className={`text-xs px-2.5 py-0.5 font-bold flex items-center gap-1.5 ${statusInfo.badgeClass}`}>
                        <span className={`h-2 w-2 rounded-full ${statusInfo.dotClass} ${statusInfo.status === 'pending' ? 'animate-pulse' : ''}`} />
                        {statusInfo.label}
                      </Badge>

                      <Badge variant="outline" className="border-slate-700 text-slate-300 font-mono text-[11px]">
                        Reputation: {dom.reputationScore ?? 98}/100
                      </Badge>

                      {dom.warmupDay !== undefined && (
                        <Badge variant="outline" className="border-slate-700 text-slate-300 text-[11px]">
                          Warmup: Day {dom.warmupDay ?? 1}/30
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 mt-1.5">
                      <span>Sender: <strong className="text-slate-300 font-mono">{fromEmail}</strong></span>
                      <span>Display Name: <strong className="text-slate-300">{fromName}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      onClick={() => handleVerify(dom.id, domainName)}
                      disabled={isVerifying || isSuspended}
                      variant="outline"
                      size="sm"
                      className="border-slate-700 text-slate-200 hover:bg-slate-800 h-8 text-xs px-3"
                    >
                      <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
                      {isVerified ? 'Re-Check DNS' : 'Verify DNS Records'}
                    </Button>

                    <Button
                      onClick={() => handleDelete(dom.id, domainName)}
                      disabled={isDeleting}
                      variant="ghost"
                      size="sm"
                      className="text-slate-500 hover:text-red-400 hover:bg-red-950/30 h-8 w-8 p-0"
                      title="Suspend / Remove Domain"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="p-4 space-y-4">
                  {/* Status Banner when Pending */}
                  {!isVerified && !isSuspended && (
                    <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-800/40 flex items-start gap-2.5 text-xs text-amber-200/90">
                      <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <strong>DNS Records Pending Verification:</strong> Add the 3 DNS records below at your domain registrar (Cloudflare, GoDaddy, Namecheap, Google Domains, AWS Route 53). Propagation usually takes 1–5 minutes.
                      </div>
                    </div>
                  )}

                  {/* Clean DNS Records Inspection Cards */}
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
                      DNS Authentication Records (DKIM, SPF, DMARC)
                    </div>

                    <div className="space-y-3">
                      {dnsRecords.map((rec, i) => (
                        <div key={i} className="rounded-lg border border-slate-800 bg-slate-950/80 p-3.5 space-y-2.5">
                          {/* Record Header */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-850 pb-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-bold font-mono bg-slate-800 text-blue-300 border-blue-900/50">
                                {rec.type}
                              </Badge>
                              <span className="font-semibold text-xs text-slate-200">{rec.name}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-500 font-mono">TTL: {rec.ttl}</span>
                              <Badge className={`text-[10px] px-2 py-0 font-medium ${
                                rec.verified
                                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                                  : 'bg-amber-950 text-amber-400 border-amber-800'
                              }`}>
                                {rec.verified ? 'Verified' : 'Pending DNS'}
                              </Badge>
                            </div>
                          </div>

                          {/* Plain-English Explanation */}
                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            {rec.explanation}
                          </p>

                          {/* Host & Value Copy Helper Fields */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                            {/* Host / Name Field */}
                            <div className="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <span className="text-[10px] text-slate-500 block uppercase font-mono">Host / Record Name</span>
                                <code className="text-xs text-emerald-400 font-mono truncate block" title={rec.host}>
                                  {rec.host}
                                </code>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => copyToClipboard(rec.host, `${rec.type} Host`)}
                                className="h-7 px-2 text-slate-400 hover:text-white shrink-0 text-[11px]"
                              >
                                {copiedField === `${rec.type} Host` ? (
                                  <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                                    <Check className="h-3.5 w-3.5" /> Copied
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1">
                                    <Copy className="h-3.5 w-3.5" /> Copy Host
                                  </span>
                                )}
                              </Button>
                            </div>

                            {/* Value / Target Field */}
                            <div className="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <span className="text-[10px] text-slate-500 block uppercase font-mono">Value / Target Content</span>
                                <code className="text-xs text-amber-300 font-mono truncate block" title={rec.value}>
                                  {rec.value}
                                </code>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => copyToClipboard(rec.value, `${rec.type} Value`)}
                                className="h-7 px-2 text-slate-400 hover:text-white shrink-0 text-[11px]"
                              >
                                {copiedField === `${rec.type} Value` ? (
                                  <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                                    <Check className="h-3.5 w-3.5" /> Copied
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1">
                                    <Copy className="h-3.5 w-3.5" /> Copy Value
                                  </span>
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Verification CTA Footer */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => handleVerify(dom.id, domainName)}
                        disabled={isVerifying || isSuspended}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8 px-4"
                      >
                        {isVerifying ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />}
                        {isVerified ? 'Re-Verify DNS' : 'Verify DNS Records Now'}
                      </Button>

                      {isVerified && (
                        <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                          <Check className="h-4 w-4" />
                          Domain 100% verified — ready for autonomous outreach dispatches!
                        </span>
                      )}
                    </div>

                    <span className="text-[11px] text-slate-500">
                      Need help? Works with Cloudflare, Namecheap, GoDaddy, Route 53, and Google Domains.
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}


