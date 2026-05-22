'use client';

import { useDashboardStore, CampaignRow } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Megaphone, Plus, Settings, Play } from 'lucide-react';
import { useState } from 'react';

export function CampaignPanel() {
  const { campaigns, createCampaign } = useDashboardStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: '', goal: '', targetAudience: '', offer: '', senderName: 'Alex Chen', senderEmail: 'alex@outreachai.com',
    tone: 'professional', cta: 'Book a 15-min discovery call', maxDailySends: 50, followUpSchedule: [3, 7, 14],
    productDescription: '',
  });

  const handleCreate = async () => {
    if (!form.name) return;
    await createCampaign(form);
    setCreateOpen(false);
    setForm({ ...form, name: '' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">Campaigns</h3>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs"><Plus className="w-3.5 h-3.5 mr-1" />New Campaign</Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-700 text-white sm:max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Create Campaign</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div><Label className="text-xs text-slate-300">Campaign Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="bg-slate-800 border-slate-700 h-8 text-xs" placeholder="Q1 SaaS Outreach" /></div>
              <div><Label className="text-xs text-slate-300">Goal</Label><Input value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))} className="bg-slate-800 border-slate-700 h-8 text-xs" placeholder="Book 20 demo calls" /></div>
              <div><Label className="text-xs text-slate-300">Target Audience</Label><Input value={form.targetAudience} onChange={e => setForm(f => ({ ...f, targetAudience: e.target.value }))} className="bg-slate-800 border-slate-700 h-8 text-xs" placeholder="VP Engineering at B2B SaaS" /></div>
              <div><Label className="text-xs text-slate-300">Offer</Label><Input value={form.offer} onChange={e => setForm(f => ({ ...f, offer: e.target.value }))} className="bg-slate-800 border-slate-700 h-8 text-xs" placeholder="Free 14-day trial" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs text-slate-300">Sender Name</Label><Input value={form.senderName} onChange={e => setForm(f => ({ ...f, senderName: e.target.value }))} className="bg-slate-800 border-slate-700 h-8 text-xs" /></div>
                <div><Label className="text-xs text-slate-300">Sender Email</Label><Input value={form.senderEmail} onChange={e => setForm(f => ({ ...f, senderEmail: e.target.value }))} className="bg-slate-800 border-slate-700 h-8 text-xs" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs text-slate-300">Tone</Label><Input value={form.tone} onChange={e => setForm(f => ({ ...f, tone: e.target.value }))} className="bg-slate-800 border-slate-700 h-8 text-xs" /></div>
                <div><Label className="text-xs text-slate-300">Max Daily Sends</Label><Input type="number" value={form.maxDailySends} onChange={e => setForm(f => ({ ...f, maxDailySends: parseInt(e.target.value) || 50 }))} className="bg-slate-800 border-slate-700 h-8 text-xs" /></div>
              </div>
              <div><Label className="text-xs text-slate-300">CTA</Label><Input value={form.cta} onChange={e => setForm(f => ({ ...f, cta: e.target.value }))} className="bg-slate-800 border-slate-700 h-8 text-xs" /></div>
              <div><Label className="text-xs text-slate-300">Product Description</Label><Textarea value={form.productDescription} onChange={e => setForm(f => ({ ...f, productDescription: e.target.value }))} className="bg-slate-800 border-slate-700 text-xs min-h-[60px] resize-none" placeholder="What does your product do?" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)} className="border-slate-700 text-slate-300">Cancel</Button>
              <Button onClick={handleCreate} disabled={!form.name} className="bg-emerald-600 hover:bg-emerald-700 text-white">Create Campaign</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {campaigns.length === 0 ? (
        <Card className="bg-slate-900/50 border-slate-700/50 p-8 text-center">
          <Megaphone className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No campaigns yet</p>
        </Card>
      ) : campaigns.map(c => (
        <Card key={c.id} className="bg-slate-900/50 border-slate-700/50 p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h4 className="text-sm font-medium text-white">{c.name}</h4>
              <p className="text-[10px] text-slate-400 mt-0.5">{c.goal || 'No goal set'}</p>
            </div>
            <Badge variant="outline" className={`text-[9px] h-4 ${c.status === 'running' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-slate-500/15 text-slate-400 border-slate-500/30'}`}>{c.status}</Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
            <div><span className="text-slate-500">Target:</span> <span className="text-slate-300">{c.targetAudience || '—'}</span></div>
            <div><span className="text-slate-500">Tone:</span> <span className="text-slate-300">{c.tone}</span></div>
            <div><span className="text-slate-500">CTA:</span> <span className="text-slate-300">{c.cta || '—'}</span></div>
            <div><span className="text-slate-500">Daily Limit:</span> <span className="text-slate-300">{c.maxDailySends}</span></div>
            <div><span className="text-slate-500">Sender:</span> <span className="text-slate-300">{c.senderName} ({c.senderEmail})</span></div>
            <div><span className="text-slate-500">Follow-ups:</span> <span className="text-slate-300">{c.followUpSchedule}</span></div>
            <div><span className="text-slate-500">Messages:</span> <span className="text-slate-300">{c._count?.messages ?? 0}</span></div>
          </div>
          {c.productDescription && <div className="mt-2 text-[10px] text-slate-500 bg-slate-800/30 rounded p-2">{c.productDescription}</div>}
        </Card>
      ))}
    </div>
  );
}
