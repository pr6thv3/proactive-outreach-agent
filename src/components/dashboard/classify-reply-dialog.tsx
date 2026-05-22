'use client';

import { useState } from 'react';
import { useDashboardStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquare } from 'lucide-react';

export function ClassifyReplyDialog() {
  const [open, setOpen] = useState(false);
  const [leadId, setLeadId] = useState('');
  const [messageId, setMessageId] = useState('');
  const [replyText, setReplyText] = useState('');
  const { leads, messages, classifyReply } = useDashboardStore();

  const handleSubmit = async () => {
    if (!leadId || !messageId || !replyText.trim()) return;
    await classifyReply(leadId, messageId, replyText.trim());
    setLeadId(''); setMessageId(''); setReplyText('');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-amber-600/40 text-amber-400 hover:bg-amber-500/10 h-8 text-xs">
          <MessageSquare className="w-3.5 h-3.5 mr-1" />Classify Reply
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-700 text-white sm:max-w-md">
        <DialogHeader><DialogTitle>Classify Prospect Reply</DialogTitle></DialogHeader>
        <div className="space-y-2.5 py-2">
          <div><Label className="text-xs text-slate-300">Lead</Label>
            <Select value={leadId} onValueChange={setLeadId}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-8 text-xs"><SelectValue placeholder="Select lead..." /></SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">{leads.map(l => <SelectItem key={l.id} value={l.id}>{l.name} — {l.company || l.email}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs text-slate-300">Message</Label>
            <Select value={messageId} onValueChange={setMessageId}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-8 text-xs"><SelectValue placeholder="Select message..." /></SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">{messages.filter(m => !leadId || m.lead?.email === leads.find(l => l.id === leadId)?.email).map(m => <SelectItem key={m.id} value={m.id}>{m.subject}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs text-slate-300">Reply Text</Label><Textarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Paste the prospect's reply..." className="bg-slate-800 border-slate-700 text-white min-h-[80px] resize-none text-xs" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="border-slate-700 text-slate-300">Cancel</Button>
          <Button onClick={handleSubmit} disabled={!leadId || !messageId || !replyText.trim()} className="bg-amber-600 hover:bg-amber-700 text-white">Classify</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
