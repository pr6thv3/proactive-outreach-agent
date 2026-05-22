'use client';

import { useState } from 'react';
import { useDashboardStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';

export function AddLeadDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const { addLead } = useDashboardStore();

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim()) return;
    await addLead({ name: name.trim(), email: email.trim(), company: company.trim() || undefined, title: title.trim() || undefined, url: url.trim() || undefined, linkedinUrl: linkedinUrl.trim() || undefined });
    setName(''); setEmail(''); setCompany(''); setTitle(''); setUrl(''); setLinkedinUrl('');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs"><Plus className="w-3.5 h-3.5 mr-1" />Add Lead</Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-700 text-white sm:max-w-md">
        <DialogHeader><DialogTitle>Add New Lead</DialogTitle></DialogHeader>
        <div className="space-y-2.5 py-2">
          <div className="grid grid-cols-2 gap-2.5">
            <div><Label className="text-xs text-slate-300">Name *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" className="bg-slate-800 border-slate-700 text-white h-8 text-xs" /></div>
            <div><Label className="text-xs text-slate-300">Email *</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@company.com" className="bg-slate-800 border-slate-700 text-white h-8 text-xs" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div><Label className="text-xs text-slate-300">Company</Label><Input value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Corp" className="bg-slate-800 border-slate-700 text-white h-8 text-xs" /></div>
            <div><Label className="text-xs text-slate-300">Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="VP Engineering" className="bg-slate-800 border-slate-700 text-white h-8 text-xs" /></div>
          </div>
          <div><Label className="text-xs text-slate-300">Website URL</Label><Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://acme.com" className="bg-slate-800 border-slate-700 text-white h-8 text-xs" /></div>
          <div><Label className="text-xs text-slate-300">LinkedIn URL</Label><Input value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/jane" className="bg-slate-800 border-slate-700 text-white h-8 text-xs" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="border-slate-700 text-slate-300">Cancel</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || !email.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white">Add Lead</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
