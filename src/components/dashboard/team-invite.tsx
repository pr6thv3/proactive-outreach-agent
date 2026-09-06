'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export function TeamInvite() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [loading, setLoading] = useState(false);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/org/members/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });

      if (res.ok) {
        toast.success(`Invite sent to ${email}`);
        setEmail('');
      } else {
        const data = await res.json();
        toast.error(data.error?.message || 'Failed to send invite');
      }
    } catch {
      toast.error('Network error sending invite');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleInvite}>
      <Card className="border-slate-800 bg-slate-900 text-slate-100">
        <CardHeader>
          <CardTitle className="text-lg font-bold">Invite Team Member</CardTitle>
          <CardDescription className="text-slate-400">
            Grant workspace access with role-based permissions (ADMIN, MEMBER, VIEWER).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2 space-y-2">
              <Label htmlFor="email">Work Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="colleague@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border-slate-800 bg-slate-950 text-slate-100"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full h-10 rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100"
              >
                <option value="ADMIN">ADMIN</option>
                <option value="MEMBER">MEMBER</option>
                <option value="VIEWER">VIEWER</option>
              </select>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-500 text-white">
            {loading ? 'Sending...' : 'Send Invitation'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
