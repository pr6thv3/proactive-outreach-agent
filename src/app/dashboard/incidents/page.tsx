'use client';

import React, { useEffect, useState } from 'react';
import { IncidentCenterCard } from '@/components/dashboard/incident-center-card';
import { ShieldCheck, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function IncidentsPage() {
  const [data, setData] = useState<{ hasIncidents: boolean; incidentCount: number; incidents: any[] }>({
    hasIncidents: false,
    incidentCount: 0,
    incidents: [],
  });
  const [loading, setLoading] = useState(true);

  const fetchIncidents = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/incidents');
      if (res.ok) {
        const json = await res.json();
        setData(json.data || json);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, []);

  const handleRemediate = async (endpoint: string, method: string) => {
    try {
      await fetch(endpoint, { method });
      await fetchIncidents();
    } catch (err) {
      console.error('Failed to execute remediation', err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Incident Center</h1>
          <p className="text-muted-foreground text-sm">
            Live operational diagnostics answering &quot;What is broken right now?&quot; with 1-click guided remediation.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchIncidents} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <IncidentCenterCard incidents={data.incidents} onRemediate={handleRemediate} />
    </div>
  );
}
