'use client';

import { useEffect, useState, useCallback } from 'react';
import { useDashboardStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  CheckCircle,
  XCircle,
  Plus,
  Copy,
  Check,
  Shield,
  Mail,
  AlertTriangle,
  Send,
  Eye,
  MousePointerClick,
  Ban,
  RefreshCw,
  Globe,
  Loader2,
} from 'lucide-react';

// ─── Helpers ────────────────────────────────────────
function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function getUnifiedStatus(domain: { status?: string; spfVerified?: boolean; dkimVerified?: boolean; dmarcVerified?: boolean }) {
  const statusLower = (domain?.status || '').toLowerCase();
  if (statusLower === 'suspended') {
    return { label: 'Suspended', color: 'bg-red-950 text-red-400 border-red-800' };
  }
  const isVerified = statusLower === 'verified' || statusLower === 'active' || (domain.spfVerified && domain.dkimVerified && domain.dmarcVerified);
  if (isVerified) {
    return { label: 'ACTIVE / Verified', color: 'bg-emerald-950 text-emerald-400 border-emerald-800' };
  }
  return { label: 'Verification Pending', color: 'bg-amber-950 text-amber-400 border-amber-800' };
}

function statusColor(status?: string): string {
  return getUnifiedStatus({ status }).color;
}

function repColor(score: number): string {
  if (score >= 85) return 'text-emerald-400';
  if (score >= 70) return 'text-amber-400';
  return 'text-red-400';
}

function repBg(score: number): string {
  if (score >= 85) return 'bg-emerald-500/10 border-emerald-500/20';
  if (score >= 70) return 'bg-amber-500/10 border-amber-500/20';
  return 'bg-red-500/10 border-red-500/20';
}

function rateColor(rate: number, inverse = false): string {
  const good = inverse ? rate < 3 : rate >= 20;
  const mid = inverse ? rate < 8 : rate >= 10;
  if (good) return 'text-emerald-400';
  if (mid) return 'text-amber-400';
  return 'text-red-400';
}

// ─── DNS Record Data ────────────────────────────────
interface DnsRecord {
  type: string;
  name: string;
  host: string;
  value: string;
  explanation: string;
}

function getDnsRecords(domain: string): DnsRecord[] {
  return [
    {
      type: 'CNAME',
      name: 'DKIM (DomainKeys Identified Mail)',
      host: `resend._domainkey.${domain}`,
      value: 'resend.com',
      explanation: 'Attaches a tamper-proof cryptographic signature proving authenticity.',
    },
    {
      type: 'TXT',
      name: 'SPF (Sender Policy Framework)',
      host: domain,
      value: 'v=spf1 include:resend.com ~all',
      explanation: 'Authorizes mail servers to send outreach emails on behalf of this domain.',
    },
    {
      type: 'TXT',
      name: 'DMARC (Authentication & Reporting)',
      host: `_dmarc.${domain}`,
      value: 'v=DMARC1; p=none; rua=mailto:dmarc@resend.com',
      explanation: 'Protects company brand reputation against spoofing and phishing.',
    },
  ];
}

// ─── Copy Button ────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className="h-6 w-6 p-0 text-slate-400 hover:text-white"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
    </Button>
  );
}

// ─── Add Domain Dialog ──────────────────────────────
function AddDomainDialog() {
  const [open, setOpen] = useState(false);
  const [domain, setDomain] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const { addDomain } = useDashboardStore();

  const handleSubmit = async () => {
    if (!domain.trim()) return;
    await addDomain({ domain: domain.trim(), fromEmail: fromEmail.trim() || undefined, fromName: fromName.trim() || undefined });
    setDomain('');
    setFromEmail('');
    setFromName('');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs">
          <Plus className="w-3.5 h-3.5 mr-1" />Add Domain
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-700 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Add Sending Domain</DialogTitle>
          <DialogDescription className="text-slate-400">
            Add a custom sending domain. You&apos;ll need to configure DNS records after adding.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Domain</label>
            <Input
              placeholder="mail.yourcompany.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-9 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">From Email</label>
            <Input
              placeholder="outreach@yourcompany.com"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-9 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">From Name (optional)</label>
            <Input
              placeholder="Your Name"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-9 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="border-slate-700 text-slate-300 hover:bg-slate-800 h-8">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!domain.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8">
            Add Domain
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ─────────────────────────────────
export function DeliverabilityPanel() {
  const { stats, domains, fetchDomains, verifyDomain } = useDashboardStore();
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);

  useEffect(() => { fetchDomains(); }, [fetchDomains]);

  const deliverability = stats?.deliverability;
  const selectedDomain = domains.find(d => d.id === selectedDomainId) || domains[0] || null;

  const [pollCount, setPollCount] = useState(0);

  // ─── Auto-polling Effect (every 60s for pending domains, max 30 polls) ───
  useEffect(() => {
    if (!selectedDomain || selectedDomain.status === 'verified' || pollCount >= 30) return;
    const timer = setInterval(() => {
      verifyDomain(selectedDomain.id);
      setPollCount(c => c + 1);
    }, 60000);
    return () => clearInterval(timer);
  }, [selectedDomain, verifyDomain, pollCount]);

  const handleVerify = async (domainId: string) => {
    setVerifying(domainId);
    await verifyDomain(domainId);
    setVerifying(null);
  };

  // ─── Sending Domains Section ───
  const domainCards = (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Globe className="w-4 h-4 text-emerald-400" />
          Sending Domains
        </h3>
        <AddDomainDialog />
      </div>

      {domains.length === 0 ? (
        <Card className="p-6 bg-slate-900/50 border-slate-700/50 text-center">
          <Globe className="w-8 h-8 text-slate-500 mx-auto mb-2" />
          <p className="text-sm text-slate-400 mb-3">No sending domains configured</p>
          <p className="text-xs text-slate-500 mb-4">Add a domain to start sending emails with proper deliverability</p>
          <AddDomainDialog />
        </Card>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1 scrollbar-thin">
          {domains.map(d => {
            const warmupPct = d.warmupDay > 0 ? Math.min((d.warmupDay / 30) * 100, 100) : 0;
            const isSelected = selectedDomain?.id === d.id;
            return (
              <Card
                key={d.id}
                onClick={() => setSelectedDomainId(d.id)}
                className={`p-4 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-slate-800/80 border-emerald-500/30'
                    : 'bg-slate-900/50 border-slate-700/50 hover:border-slate-600/50'
                }`}
              >
                {/* Domain header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{d.domain}</span>
                    {(() => {
                      const statusInfo = getUnifiedStatus(d);
                      return (
                        <Badge variant="outline" className={`text-[10px] px-2 py-0.5 font-bold ${statusInfo.color}`}>
                          {statusInfo.label}
                        </Badge>
                      );
                    })()}
                  </div>
                  {d.fromEmail && (
                    <span className="text-[11px] text-slate-500">{d.fromEmail}</span>
                  )}
                </div>

                {/* SPF / DKIM / DMARC */}
                <div className="flex items-center gap-4 mb-3">
                  <div className="flex items-center gap-1 text-xs">
                    {d.spfVerified ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-amber-400" />
                    )}
                    <span className={d.spfVerified ? 'text-emerald-400' : 'text-amber-400'}>SPF</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    {d.dkimVerified ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-amber-400" />
                    )}
                    <span className={d.dkimVerified ? 'text-emerald-400' : 'text-amber-400'}>DKIM</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    {d.dmarcVerified ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-amber-400" />
                    )}
                    <span className={d.dmarcVerified ? 'text-emerald-400' : 'text-amber-400'}>DMARC</span>
                  </div>
                </div>

                {/* Warmup + Reputation + Daily Sends row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Warmup */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                      <span>Warmup Day {d.warmupDay}/30</span>
                      <span>{d.warmupDailyLimit} emails/day</span>
                    </div>
                    <Progress value={warmupPct} className="h-1.5 bg-slate-700 [&>[data-slot=progress-indicator]]:bg-emerald-500" />
                  </div>

                  {/* Reputation */}
                  <div className={`p-2 rounded border ${repBg(d.reputationScore)}`}>
                    <div className="text-[10px] text-slate-400">Reputation</div>
                    <div className={`text-lg font-bold ${repColor(d.reputationScore)}`}>{d.reputationScore}</div>
                  </div>

                  {/* Daily Sends */}
                  <div className="p-2 rounded border bg-slate-800/50 border-slate-700/50">
                    <div className="text-[10px] text-slate-400">Daily Sends</div>
                    <div className="text-lg font-bold text-white">
                      {d.dailySendsCount}<span className="text-xs text-slate-500">/{d.warmupDailyLimit}</span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );

  // ─── DNS Setup Section ───
  const dnsRecords = selectedDomain ? getDnsRecords(selectedDomain.domain) : [];
  const needsDns = selectedDomain && (!selectedDomain.spfVerified || !selectedDomain.dkimVerified || !selectedDomain.dmarcVerified);
  const noVerifiedDomain = domains.length > 0 && !domains.some(d => d.status === 'verified' || d.status === 'active' || (d.spfVerified && d.dkimVerified && d.dmarcVerified));

  const dnsSection = (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Shield className="w-4 h-4 text-amber-400" />
          Domain DNS Setup
        </h3>
        {selectedDomain && selectedDomain.status !== 'verified' && selectedDomain.status !== 'active' && (
          <span className="text-[11px] text-amber-400/80 flex items-center gap-1.5 animate-pulse">
            <RefreshCw className="w-3 h-3 animate-spin" />
            Auto-polling Resend status every 60s...
          </span>
        )}
      </div>

      {!selectedDomain ? (
        <Card className="p-4 bg-slate-900/50 border-slate-700/50 text-center">
          <Shield className="w-6 h-6 text-slate-500 mx-auto mb-2" />
          <p className="text-xs text-slate-400">Add a domain to see DNS setup instructions</p>
        </Card>
      ) : (
        <Card className="p-4 bg-slate-900/50 border-slate-700/50 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-white font-semibold">{selectedDomain.domain}</span>
              <p className="text-xs text-slate-400 mt-0.5">
                Add the following DNS records at your registrar (Cloudflare, GoDaddy, Namecheap, AWS Route 53):
              </p>
            </div>
            {(needsDns || noVerifiedDomain) ? (
              <Badge variant="outline" className="text-[10px] px-2.5 py-0.5 bg-amber-950 text-amber-400 border-amber-800 shrink-0 font-semibold">
                <AlertTriangle className="w-3 h-3 mr-1" />Verification Pending
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] px-2.5 py-0.5 bg-emerald-950 text-emerald-400 border-emerald-800 shrink-0 font-semibold">
                <CheckCircle className="w-3 h-3 mr-1" />ACTIVE / Verified
              </Badge>
            )}
          </div>

          <div className="space-y-3">
            {dnsRecords.map((rec, i) => (
              <div key={i} className="rounded-lg border border-slate-700/60 bg-slate-800/40 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-semibold bg-slate-700 text-slate-200 border-slate-600 font-mono">
                      {rec.type}
                    </Badge>
                    <span className="text-xs text-slate-300 font-medium">{rec.name}</span>
                  </div>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                    i === 0 ? (selectedDomain.spfVerified ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-amber-950 text-amber-400 border-amber-800') :
                    i === 1 ? (selectedDomain.dkimVerified ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-amber-950 text-amber-400 border-amber-800') :
                    (selectedDomain.dmarcVerified ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-amber-950 text-amber-400 border-amber-800')
                  }`}>
                    {(i === 0 ? selectedDomain.spfVerified : i === 1 ? selectedDomain.dkimVerified : selectedDomain.dmarcVerified) ? 'Verified' : 'Pending'}
                  </Badge>
                </div>

                <p className="text-[11px] text-slate-400 font-normal">
                  {rec.explanation}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-700/30">
                  <div className="flex items-center justify-between gap-1.5 bg-slate-900/90 rounded px-2.5 py-1.5 border border-slate-800">
                    <div className="min-w-0 flex-1">
                      <span className="text-[9px] text-slate-500 uppercase block font-mono">Host</span>
                      <code className="text-xs text-emerald-400 font-mono truncate block" title={rec.host}>{rec.host}</code>
                    </div>
                    <CopyButton text={rec.host} />
                  </div>

                  <div className="flex items-center justify-between gap-1.5 bg-slate-900/90 rounded px-2.5 py-1.5 border border-slate-800">
                    <div className="min-w-0 flex-1">
                      <span className="text-[9px] text-slate-500 uppercase block font-mono">Value</span>
                      <code className="text-[11px] text-amber-300 font-mono truncate block" title={rec.value}>{rec.value}</code>
                    </div>
                    <CopyButton text={rec.value} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                onClick={() => handleVerify(selectedDomain.id)}
                disabled={verifying === selectedDomain.id}
                className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs px-4"
              >
                {verifying === selectedDomain.id ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                )}
                Verify DNS Now
              </Button>
              {(selectedDomain.status === 'verified' || selectedDomain.status === 'active' || (selectedDomain.spfVerified && selectedDomain.dkimVerified && selectedDomain.dmarcVerified)) && (
                <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" />Domain verified — Ready to start campaign!
                </span>
              )}
            </div>
            {selectedDomain.status !== 'verified' && (
              <p className="text-[11px] text-slate-400 hidden sm:block">
                DNS propagation usually takes 1-5 minutes (up to 24h at some registrars).
              </p>
            )}
          </div>
        </Card>
      )}
    </div>
  );

  // ─── Delivery Metrics Section ───
  const metrics = deliverability;
  const metricCards = [
    { label: 'Total Sent', value: metrics?.totalSent ?? 0, icon: Send, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    { label: 'Delivered', value: metrics?.totalDelivered ?? 0, icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    { label: 'Bounced', value: metrics?.totalBounced ?? 0, icon: Ban, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
    { label: 'Opened', value: metrics?.totalOpened ?? 0, icon: Eye, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    { label: 'Clicked', value: metrics?.totalClicked ?? 0, icon: MousePointerClick, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
    { label: 'Complained', value: metrics?.totalComplained ?? 0, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  ];

  const rateCards = [
    { label: 'Delivery Rate', value: metrics?.deliveryRate ?? 0, inverse: false },
    { label: 'Bounce Rate', value: metrics?.bounceRate ?? 0, inverse: true },
    { label: 'Open Rate', value: metrics?.openRate ?? 0, inverse: false },
    { label: 'Click Rate', value: metrics?.clickRate ?? 0, inverse: false },
    { label: 'Complaint Rate', value: metrics?.complaintRate ?? 0, inverse: true },
  ];

  const metricsSection = (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
        <Mail className="w-4 h-4 text-blue-400" />
        Delivery Metrics
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {metricCards.map(c => (
          <Card key={c.label} className={`p-3 ${c.bg} border backdrop-blur-sm`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-400 font-medium">{c.label}</span>
              <c.icon className={`w-3.5 h-3.5 ${c.color}`} />
            </div>
            <div className="text-xl font-bold text-white">{fmt(c.value)}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {rateCards.map(c => (
          <Card key={c.label} className="p-3 bg-slate-900/50 border-slate-700/50">
            <div className="text-[10px] text-slate-400 font-medium mb-1">{c.label}</div>
            <div className={`text-lg font-bold ${rateColor(c.value, c.inverse)}`}>
              {c.value.toFixed(1)}%
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {domainCards}
      {dnsSection}
      {metricsSection}
    </div>
  );
}
