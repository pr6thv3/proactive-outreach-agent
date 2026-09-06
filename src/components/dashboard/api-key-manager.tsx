'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Key, Copy, Trash2, Check, AlertTriangle } from 'lucide-react';

export function ApiKeyManager() {
  const [keys, setKeys] = useState<any[]>([]);
  const [keyName, setKeyName] = useState('');
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchKeys = async () => {
    try {
      const res = await fetch('/api/api-keys');
      if (res.ok) {
        const data = await res.json();
        if (data.data) setKeys(data.data);
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName) return;
    setCreating(true);

    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: keyName, scopes: ['read', 'write'] }),
      });

      if (res.ok) {
        const data = await res.json();
        setNewRawKey(data.data.rawKey);
        setKeyName('');
        toast.success('API Key generated');
        fetchKeys();
      } else {
        toast.error('Failed to generate API Key');
      }
    } catch {
      toast.error('Network error generating key');
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeKey = async (id: string) => {
    try {
      const res = await fetch(`/api/api-keys/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('API Key revoked');
        fetchKeys();
      }
    } catch {
      toast.error('Failed to revoke key');
    }
  };

  const copyRawKey = () => {
    if (newRawKey) {
      navigator.clipboard.writeText(newRawKey);
      setCopied(true);
      toast.success('Raw key copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card className="border-slate-800 bg-slate-900 text-slate-100 shadow-xl">
      <CardHeader>
        <CardTitle className="text-xl font-bold flex items-center gap-2">
          <Key className="h-5 w-5 text-amber-400" /> API Keys & Headless Service Auth
        </CardTitle>
        <CardDescription className="text-slate-400">
          Authenticate requests via <code>X-API-Key</code> header. Keys are hashed with SHA-256 in storage.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Raw Key Display Modal/Alert when generated */}
        {newRawKey && (
          <div className="rounded-lg border border-amber-800 bg-amber-950/40 p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
              <AlertTriangle className="h-4 w-4" /> Save your API Key now!
            </div>
            <p className="text-xs text-slate-300">
              This raw key will <strong>never be displayed again</strong>. It is hashed with SHA-256 in the database.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-slate-950 px-3 py-2 font-mono text-xs text-amber-300 border border-slate-800">
                {newRawKey}
              </code>
              <Button size="sm" onClick={copyRawKey} className="bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        {/* Generate Form */}
        <form onSubmit={handleCreateKey} className="flex gap-3">
          <Input
            placeholder="Key Description (e.g., Zapier Integration)"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            className="border-slate-800 bg-slate-950 text-slate-100"
          />
          <Button type="submit" disabled={creating} className="bg-blue-600 hover:bg-blue-500 text-white shrink-0">
            {creating ? 'Generating...' : 'Generate New Key'}
          </Button>
        </form>

        {/* Keys List */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-300">Active API Keys ({keys.length})</h4>
          {keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-200">{k.name}</span>
                  <Badge className="bg-slate-800 text-slate-400 font-mono text-[10px]">
                    SHA256 Protected
                  </Badge>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Created {new Date(k.createdAt).toLocaleDateString()} • {k.lastUsedAt ? `Last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : 'Never used'}
                </div>
              </div>

              <Button size="sm" variant="ghost" onClick={() => handleRevokeKey(k.id)} className="text-red-400 hover:text-red-300">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
