'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Upload, FileSpreadsheet } from 'lucide-react';

export default function LeadImportPage() {
  const router = useRouter();
  const [csvText, setCsvText] = useState(
    `name,email,company,title\nSarah Chen,sarah.chen@techcorp.io,TechCorp,VP Engineering\nMarcus Johnson,marcus.j@growthco.com,GrowthCo,Head of Sales`
  );
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(`Imported ${data.data.created} new leads (${data.data.updated} updated)`);
        router.push('/dashboard/leads');
      } else {
        toast.error('Failed to import CSV');
      }
    } catch {
      toast.error('Network error during import');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <FileSpreadsheet className="h-6 w-6 text-blue-400" /> CSV Bulk Lead Import
        </h2>
        <p className="text-slate-400 text-sm">Paste CSV data or upload a file. Queue items will automatically undergo MX verification.</p>
      </div>

      <Card className="border-slate-800 bg-slate-900 text-slate-100">
        <CardHeader>
          <CardTitle className="text-lg font-bold">Paste Raw CSV Content</CardTitle>
          <CardDescription className="text-slate-400">Required headers: <code>email</code>. Optional: <code>name, company, title</code>.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={10}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            className="font-mono text-xs border-slate-800 bg-slate-950 text-slate-200"
          />
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button onClick={handleImport} disabled={loading} className="bg-blue-600 hover:bg-blue-500 text-white">
            <Upload className="mr-2 h-4 w-4" /> {loading ? 'Importing...' : 'Parse & Queue Enrichment'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
