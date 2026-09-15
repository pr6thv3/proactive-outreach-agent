'use client';

import React from 'react';
import { RoiDashboardCard } from '@/components/dashboard/roi-dashboard';

export default function RoiPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Client ROI & Time Savings</h1>
        <p className="text-muted-foreground text-sm">
          Verified business efficiency metrics measuring manual hours avoided vs platform operating costs.
        </p>
      </div>

      <RoiDashboardCard />
    </div>
  );
}
