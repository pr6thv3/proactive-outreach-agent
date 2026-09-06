'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Mail, CheckCircle, AlertTriangle } from 'lucide-react';

interface EmailPreviewProps {
  subject: string;
  body: string;
  fromName?: string;
  fromEmail?: string;
  toEmail?: string;
  verified?: boolean;
}

export function EmailPreview({
  subject,
  body,
  fromName = 'Alex',
  fromEmail = 'alex@outreach.acmesaas.com',
  toEmail = 'prospect@techcorp.io',
  verified = true,
}: EmailPreviewProps) {
  return (
    <Card className="border-slate-800 bg-slate-950 text-slate-100 shadow-lg">
      <CardHeader className="border-b border-slate-800 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-blue-400" />
            <CardTitle className="text-sm font-semibold">Email Preview</CardTitle>
          </div>

          <Badge
            variant={verified ? 'default' : 'destructive'}
            className={verified ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-amber-950 text-amber-400 border-amber-800'}
          >
            {verified ? (
              <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3" /> MX Verified Gate</span>
            ) : (
              <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Verification Gate Blocked</span>
            )}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-3 font-sans text-sm">
        <div className="space-y-1 text-xs text-slate-400 border-b border-slate-900 pb-2">
          <div><span className="font-semibold text-slate-300">From:</span> {fromName} &lt;{fromEmail}&gt;</div>
          <div><span className="font-semibold text-slate-300">To:</span> {toEmail}</div>
          <div><span className="font-semibold text-slate-300">Subject:</span> <span className="font-medium text-slate-100">{subject}</span></div>
        </div>

        <div className="whitespace-pre-wrap text-slate-200 leading-relaxed font-mono text-xs bg-slate-900/50 p-4 rounded border border-slate-850">
          {body}
        </div>
      </CardContent>
    </Card>
  );
}
