'use client';

import { AutonomyPanel } from '@/components/dashboard/autonomy-panel';

export default function AutonomyPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-100">Autonomous Pipeline Control Center</h2>
        <p className="text-slate-400 text-sm font-mono">Observe → Think → Act → Re-Evaluate loop parameters</p>
      </div>

      <AutonomyPanel />
    </div>
  );
}
