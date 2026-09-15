'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, ShieldAlert, RefreshCw } from 'lucide-react';

export interface IncidentUIProps {
  incidents: Array<{
    id: string;
    severity: string;
    category: string;
    title: string;
    whatHappened: string;
    whyItHappened: string;
    whatSystemTried: string;
    whatIsBlocked: string;
    remediationAction: {
      label: string;
      actionEndpoint: string;
      method: string;
    };
    detectedAt: string;
  }>;
  onRemediate?: (endpoint: string, method: string) => Promise<void>;
}

export function IncidentCenterCard({ incidents, onRemediate }: IncidentUIProps) {
  if (!incidents || incidents.length === 0) {
    return (
      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="flex items-center gap-3 pt-6">
          <CheckCircle2 className="h-6 w-6 text-emerald-500" />
          <div>
            <h4 className="font-semibold text-emerald-500">All Systems Operational</h4>
            <p className="text-sm text-muted-foreground">
              Zero active delivery, domain, or queue incidents detected across your workspace.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {incidents.map((inc) => (
        <Card key={inc.id} className="border-destructive/30 bg-destructive/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              <CardTitle className="text-base text-destructive">{inc.title}</CardTitle>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline">{inc.category}</Badge>
              <Badge variant={inc.severity === 'CRITICAL' ? 'destructive' : 'secondary'}>
                {inc.severity}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div className="rounded border bg-background/50 p-2.5">
                <span className="font-medium text-xs text-muted-foreground uppercase">What Happened</span>
                <p className="mt-0.5">{inc.whatHappened}</p>
              </div>
              <div className="rounded border bg-background/50 p-2.5">
                <span className="font-medium text-xs text-muted-foreground uppercase">Why It Happened</span>
                <p className="mt-0.5">{inc.whyItHappened}</p>
              </div>
              <div className="rounded border bg-background/50 p-2.5">
                <span className="font-medium text-xs text-muted-foreground uppercase">What System Tried</span>
                <p className="mt-0.5">{inc.whatSystemTried}</p>
              </div>
              <div className="rounded border bg-background/50 p-2.5">
                <span className="font-medium text-xs text-muted-foreground uppercase">What Is Blocked</span>
                <p className="mt-0.5 text-destructive font-medium">{inc.whatIsBlocked}</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                Detected: {new Date(inc.detectedAt).toLocaleTimeString()}
              </span>
              <Button
                size="sm"
                variant="default"
                onClick={() => onRemediate?.(inc.remediationAction.actionEndpoint, inc.remediationAction.method)}
              >
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                {inc.remediationAction.label}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
