'use client';

import { useState } from 'react';
import { useDashboardStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquare, Sparkles, CheckCircle2, Calendar, Ban, HelpCircle, Clock, ThumbsDown, UserCheck } from 'lucide-react';
import { toast } from 'sonner';

interface ClassifyReplyDialogProps {
  onClassified?: () => any;
}

export function ClassifyReplyDialog({ onClassified }: ClassifyReplyDialogProps) {
  const [open, setOpen] = useState(false);
  const [leadId, setLeadId] = useState('');
  const [messageId, setMessageId] = useState('');
  const [replyText, setReplyText] = useState('');
  const [isClassifying, setIsClassifying] = useState(false);
  const [result, setResult] = useState<any>(null);

  const { leads, messages } = useDashboardStore();

  const handleClassify = async () => {
    if (!replyText.trim()) return;
    setIsClassifying(true);
    try {
      const res = await fetch('/api/inbox/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          replyText: replyText.trim(),
          leadId: leadId || undefined,
          messageId: messageId || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
        toast.success(`Classified as ${data.data.category.replace('_', ' ').toUpperCase()}!`);
        if (onClassified) onClassified();
      } else {
        toast.error(data.error?.message || 'Classification failed');
      }
    } catch {
      toast.error('Error contacting classifier API');
    } finally {
      setIsClassifying(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setReplyText('');
    setLeadId('');
    setMessageId('');
    setOpen(false);
  };

  const renderCategoryIcon = (category: string) => {
    switch (category) {
      case 'meeting_request':
        return <Calendar className="h-4 w-4 text-emerald-400" />;
      case 'interested':
        return <UserCheck className="h-4 w-4 text-blue-400" />;
      case 'question':
      case 'needs_info':
        return <HelpCircle className="h-4 w-4 text-purple-400" />;
      case 'out_of_office':
      case 'ooo':
        return <Clock className="h-4 w-4 text-amber-400" />;
      case 'unsubscribe':
        return <Ban className="h-4 w-4 text-red-400" />;
      case 'not_interested':
      case 'negative':
        return <ThumbsDown className="h-4 w-4 text-slate-400" />;
      default:
        return <Sparkles className="h-4 w-4 text-blue-400" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-blue-600/40 text-blue-400 hover:bg-blue-500/10 h-8 text-xs font-medium">
          <MessageSquare className="w-3.5 h-3.5 mr-1.5" /> Classify Reply
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-700 text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-100">
            <Sparkles className="w-4 h-4 text-blue-400" />
            AI 6-Category Reply Triage & Classifier
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3.5 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-300">Target Lead (Optional)</Label>
              <Select value={leadId} onValueChange={setLeadId}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-8 text-xs mt-1">
                  <SelectValue placeholder="Select lead..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {leads.map(l => (
                    <SelectItem key={l.id} value={l.id} className="text-xs">
                      {l.name} — {l.company || l.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-slate-300">Outreach Message (Optional)</Label>
              <Select value={messageId} onValueChange={setMessageId}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-8 text-xs mt-1">
                  <SelectValue placeholder="Select message..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {messages
                    .filter(m => !leadId || m.lead?.email === leads.find(l => l.id === leadId)?.email)
                    .map(m => (
                      <SelectItem key={m.id} value={m.id} className="text-xs">
                        {m.subject}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs text-slate-300">Prospect Inbound Reply Text</Label>
            <Textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder="Paste the prospect's email response here (e.g. 'Can we do 15 mins on Thursday?', 'Please unsubscribe me', etc.)..."
              className="bg-slate-800 border-slate-700 text-white min-h-[90px] resize-none text-xs mt-1 leading-relaxed"
            />
          </div>

          {result && (
            <div className="rounded-xl border border-blue-900/60 bg-slate-950 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {renderCategoryIcon(result.category)}
                  <span className="font-bold text-sm text-slate-100 uppercase tracking-wide">
                    {result.category.replace('_', ' ')}
                  </span>
                </div>
                <Badge className="bg-blue-950 text-blue-300 border-blue-800 text-[11px]">
                  {Math.round((result.confidence || 0.9) * 100)}% Confidence
                </Badge>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                <strong>Reasoning:</strong> {result.reasoning}
              </p>

              {result.calendarLink && (
                <div className="text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-900 p-2 rounded-lg">
                  📅 Calendar link generated: <span className="font-mono">{result.calendarLink}</span>
                </div>
              )}

              {result.suppressed && (
                <div className="text-xs text-red-400 bg-red-950/30 border border-red-900 p-2 rounded-lg">
                  🛡️ Permanent DNC Blacklist active: 0 future dispatches across workspace.
                </div>
              )}

              {result.suggestedReply && (
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-300">AI SDR Suggested Response:</span>
                  <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg text-xs text-slate-200 whitespace-pre-wrap">
                    {result.suggestedReply}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleReset} className="border-slate-700 text-slate-300 h-8 text-xs">
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result ? (
            <Button
              onClick={handleClassify}
              disabled={isClassifying || !replyText.trim()}
              className="bg-blue-600 hover:bg-blue-500 text-white h-8 text-xs font-semibold"
            >
              {isClassifying ? 'Classifying...' : 'Classify & Route'}
            </Button>
          ) : (
            <Button onClick={handleReset} className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
