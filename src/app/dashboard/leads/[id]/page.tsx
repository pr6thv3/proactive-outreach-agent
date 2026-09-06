'use client';

import { useParams } from 'next/navigation';
import { LeadScoreBreakdown } from '@/components/dashboard/lead-score-breakdown';
import { WhyQualifiedCard } from '@/components/dashboard/why-qualified-card';
import { EmailPreview } from '@/components/dashboard/email-preview';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, ArrowLeft, MailCheck, ShieldCheck, TrendingUp, Building2, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function LeadDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { data: leadData } = useSWR(id ? `/api/leads/${id}` : null, fetcher);
  const { data: whyQualData } = useSWR(id ? `/api/leads/${id}/why-qualified` : null, fetcher);

  const lead = leadData?.data;
  const whyQual = whyQualData?.data;

  if (!lead) {
    return <div className="p-6 text-slate-400">Loading lead details and intelligence...</div>;
  }

  const isVerified = lead.emailVerified || (lead.enrichmentQueues && lead.enrichmentQueues.some((q: any) => q.status === 'MX_VERIFIED' || q.status === 'ENRICHED' || q.mxValid));
  const latestEmail = lead.outreachEmails?.[0];

  const enrichedProspect = {
    ...lead,
    score: whyQual?.icpMatchBreakdown?.totalScore ?? lead.score ?? 85,
    confidenceScore: whyQual?.aiConfidence ?? 90,
    isVerified,
    mxVerified: isVerified,
    whyFound: whyQual?.triggerSignal?.content ?? lead.signals?.[0]?.content ?? 'Matched ICP criteria',
    outreachAngle: whyQual?.outreachAngle ?? 'Direct value proposition focused on expansion',
    triggerSignal: whyQual?.triggerSignal ?? (lead.signals?.[0] ? {
      type: lead.signals[0].type,
      category: lead.signals[0].type,
      content: lead.signals[0].content,
      sourceUrl: lead.signals[0].sourceUrl,
      sourceTitle: lead.signals[0].sourceTitle,
      detectedAt: lead.signals[0].detectedAt || lead.signals[0].observedAt,
      urgency: Math.round((lead.signals[0].urgency || 0.8) * 100),
      confidence: Math.round((lead.signals[0].confidence || 0.85) * 100),
      citationQuality: 'strong',
    } : undefined),
    icpMatchBreakdown: whyQual?.icpMatchBreakdown,
  };

  return (
    <div className="space-y-6">
      {/* Back button & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <Link href="/dashboard/leads" className="text-xs text-blue-400 hover:underline inline-flex items-center gap-1 mb-1">
            <ArrowLeft className="h-3 w-3" /> Back to Leads Directory
          </Link>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            {lead.name}
          </h2>
          <p className="text-slate-400 text-sm font-mono flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5 text-slate-500" />
            {lead.title || 'Executive'} at <span className="text-slate-200 font-semibold">{lead.company}</span> • {lead.email}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isVerified ? (
            <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-xs gap-1.5 py-1 px-3">
              <MailCheck className="h-3.5 w-3.5 text-emerald-400" /> MX Gate Passed
            </Badge>
          ) : (
            <Badge className="bg-amber-950 text-amber-300 border-amber-800 text-xs gap-1.5 py-1 px-3">
              Lookup Pending
            </Badge>
          )}

          <Badge className="bg-blue-950 text-blue-300 border-blue-800 font-mono text-xs py-1 px-3">
            AI Score: {enrichedProspect.score}/100
          </Badge>
        </div>
      </div>

      {/* Main Grid: Why Qualified Research Card & Email Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          <WhyQualifiedCard prospect={enrichedProspect} />

          <LeadScoreBreakdown
            score={enrichedProspect.score}
            company={lead.company}
            title={lead.title}
            emailVerified={isVerified}
            signalCount={(lead.signals || []).length}
            breakdown={whyQual?.icpMatchBreakdown}
          />
        </div>

        <div className="lg:col-span-5 space-y-6">
          {/* Generated Email Preview */}
          <EmailPreview
            subject={latestEmail?.subject || `Quick question regarding ${lead.company}`}
            body={latestEmail?.body || `Hi ${lead.firstName || lead.name.split(' ')[0]},\n\nI noticed ${lead.company} recently ${enrichedProspect.whyFound.toLowerCase()}.\n\nGiven your focus, we'd love to share our technical benchmark on automated outbound.\n\nWould 10 minutes next Tuesday work for a quick review?`}
            toEmail={lead.email}
            verified={isVerified}
          />

          {/* Signals List */}
          <Card className="border-slate-800 bg-slate-900 text-slate-100 shadow-xl">
            <CardHeader className="pb-3 border-b border-slate-800/80">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-400" /> All Grounded Signals ({(lead.signals || []).length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {(!lead.signals || lead.signals.length === 0) ? (
                <p className="text-xs text-slate-500">No signals registered for this lead yet.</p>
              ) : (
                lead.signals.map((sig: any) => (
                  <div key={sig.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-blue-400 uppercase text-[10px]">{sig.type}</span>
                      <span className="font-mono text-amber-400 text-[11px]">
                        Urgency: {Math.round((sig.urgency || 0.8) * 100)}%
                      </span>
                    </div>
                    <p className="text-slate-300">{sig.content}</p>
                    {sig.sourceUrl && (
                      <a
                        href={sig.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-blue-400 hover:underline inline-flex items-center gap-1 mt-1"
                      >
                        {sig.sourceTitle || sig.sourceUrl} <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
