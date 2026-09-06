'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

export function IcpEditor() {
  const [industries, setIndustries] = useState('B2B SaaS, Fintech, Developer Tools');
  const [companySizeMin, setCompanySizeMin] = useState(20);
  const [companySizeMax, setCompanySizeMax] = useState(500);
  const [techStack, setTechStack] = useState('React, Node.js, PostgreSQL, AWS');
  const [valueProp, setValueProp] = useState('Accelerate outbound pipeline with autonomous AI agents.');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/icp')
      .then(res => res.json())
      .then(data => {
        if (data.data) {
          const icp = data.data;
          if (icp.industries) setIndustries(Array.isArray(icp.industries) ? icp.industries.join(', ') : JSON.parse(icp.industries || '[]').join(', '));
          if (icp.companySizeMin) setCompanySizeMin(icp.companySizeMin);
          if (icp.companySizeMax) setCompanySizeMax(icp.companySizeMax);
          if (icp.techStack) setTechStack(Array.isArray(icp.techStack) ? icp.techStack.join(', ') : JSON.parse(icp.techStack || '[]').join(', '));
          if (icp.valueProp) setValueProp(icp.valueProp);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch('/api/icp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          industries: industries.split(',').map(s => s.trim()).filter(Boolean),
          companySizeMin: Number(companySizeMin),
          companySizeMax: Number(companySizeMax),
          techStack: techStack.split(',').map(s => s.trim()).filter(Boolean),
          valueProp,
        }),
      });

      if (res.ok) {
        toast.success('ICP Criteria updated successfully');
      } else {
        toast.error('Failed to save ICP Criteria');
      }
    } catch {
      toast.error('Network error saving ICP');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave}>
      <Card className="border-slate-800 bg-slate-900 text-slate-100">
        <CardHeader>
          <CardTitle className="text-xl font-bold">Ideal Customer Profile (ICP) Criteria</CardTitle>
          <CardDescription className="text-slate-400">
            Define firmographic ranges and tech stack requirements for AI lead scoring.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="industries">Target Industries</Label>
            <Input
              id="industries"
              value={industries}
              onChange={(e) => setIndustries(e.target.value)}
              className="border-slate-800 bg-slate-950 text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="minEmployees">Min Employee Count</Label>
              <Input
                id="minEmployees"
                type="number"
                value={companySizeMin}
                onChange={(e) => setCompanySizeMin(Number(e.target.value))}
                className="border-slate-800 bg-slate-950 text-slate-100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxEmployees">Max Employee Count</Label>
              <Input
                id="maxEmployees"
                type="number"
                value={companySizeMax}
                onChange={(e) => setCompanySizeMax(Number(e.target.value))}
                className="border-slate-800 bg-slate-950 text-slate-100"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="techStack">Required Tech Stack (comma-separated)</Label>
            <Input
              id="techStack"
              value={techStack}
              onChange={(e) => setTechStack(e.target.value)}
              className="border-slate-800 bg-slate-950 text-slate-100"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="valueProp">Core Value Proposition</Label>
            <Textarea
              id="valueProp"
              rows={3}
              value={valueProp}
              onChange={(e) => setValueProp(e.target.value)}
              className="border-slate-800 bg-slate-950 text-slate-100"
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button type="submit" disabled={saving || loading} className="bg-blue-600 hover:bg-blue-500 text-white">
            {saving ? 'Saving...' : 'Save ICP Profile'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
