'use client';

import { useState } from 'react';
import { useDashboardStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, FileText, Loader2 } from 'lucide-react';

export function CsvImportDialog() {
  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { importCsv } = useDashboardStore();

  const handleImport = async () => {
    if (!csvText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await importCsv(csvText);
      setCsvText('');
      setOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
    };
    reader.readAsText(file);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800 h-8 text-xs">
          <Upload className="w-3.5 h-3.5 mr-1" />CSV Import
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-700 text-white sm:max-w-md">
        <DialogHeader><DialogTitle>Import Leads from CSV</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs text-slate-300">Upload CSV File</Label>
            <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="w-full text-xs text-slate-400 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-emerald-600 file:text-white hover:file:bg-emerald-700 mt-1" />
          </div>
          <div>
            <Label className="text-xs text-slate-300">Or paste CSV text</Label>
            <p className="text-[10px] text-slate-500 mb-1">Required columns: email, name. Optional: company, title, url, linkedin</p>
            <textarea
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-xs text-white font-mono min-h-[120px] resize-none"
              placeholder={`email,name,company,title\njohn@acme.com,John Smith,Acme Inc,CTO\njane@growth.io,Jane Doe,GrowthIO,VP Sales`}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="border-slate-700 text-slate-300">Cancel</Button>
          <Button onClick={handleImport} disabled={!csvText.trim() || isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Importing...
              </>
            ) : (
              <>
                <FileText className="w-3.5 h-3.5 mr-1" />Import
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
