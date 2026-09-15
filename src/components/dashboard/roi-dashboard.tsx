'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Clock, TrendingUp, Sparkles, Server } from 'lucide-react';

export function RoiDashboardCard() {
  const [rate, setRate] = useState<number>(45);
  const [data, setData] = useState<{
    leadsProcessed: number;
    manualHoursAvoided: number;
    netHoursSaved: number;
    grossLaborSavingsUsd: number;
    totalAutomationCostUsd: number;
    netSavingsUsd: number;
    roiPercentage: number;
    paybackDays: number;
  } | null>(null);

  useEffect(() => {
    fetch(`/api/admin/roi?rate=${rate}`)
      .then((res) => res.json())
      .then((json) => setData(json.data || json))
      .catch(() => {});
  }, [rate]);

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Top Headline Metric Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Net Value Created</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">${data.netSavingsUsd.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Net savings after all platform & AI token costs</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Manual Hours Saved</CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.netHoursSaved} hrs</div>
            <p className="text-xs text-muted-foreground mt-1">Across {data.leadsProcessed} prospects & follow-ups</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Automation ROI</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+{data.roiPercentage}%</div>
            <p className="text-xs text-muted-foreground mt-1">Measured payback in ~{data.paybackDays} days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Platform Operating Cost</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${data.totalAutomationCostUsd}</div>
            <p className="text-xs text-muted-foreground mt-1">Includes tokens, Redis, and infrastructure</p>
          </CardContent>
        </Card>
      </div>

      {/* Assumptions & Custom Tuning */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Labor Baseline Assumptions</CardTitle>
          <CardDescription>
            Adjust your organization&apos;s baseline costs to see empirical net savings tailored to your team.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs space-y-2">
            <Label htmlFor="hourlyRate">Rep / SDR Hourly Rate ($/hr)</Label>
            <div className="flex items-center gap-3">
              <Input
                id="hourlyRate"
                type="number"
                value={rate}
                onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">USD per hour</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
