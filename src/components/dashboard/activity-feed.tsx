'use client';

import { useDashboardStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Eye, Brain, Send, RotateCcw, CheckCircle, XCircle, UserPlus, ShieldAlert, Mail, FileCheck, Zap, Star } from 'lucide-react';
import { useState } from 'react';

const TYPE_ICONS: Record<string, typeof Zap> = {
  lead_created: UserPlus, enriched: Eye, email_generated: FileCheck, email_approved: CheckCircle,
  email_sent: Send, reply_received: Mail, reply_classified: Star, lead_unsubscribed: ShieldAlert,
  lead_blacklisted: XCircle, followup_scheduled: Clock, email_blocked: ShieldAlert,
};
const PHASE_COLORS: Record<string, string> = { observe: 'text-emerald-400', think: 'text-purple-400', act: 'text-orange-400', reeval: 'text-amber-400', system: 'text-slate-400' };

import { Clock } from 'lucide-react';

export function ActivityTimeline() {
  const { stats } = useDashboardStore();
  const activities = stats?.recentActivities || [];

  return (
    <Card className="bg-slate-900/50 border-slate-700/50 overflow-hidden">
      <div className="p-3 border-b border-slate-800">
        <h3 className="text-sm font-medium text-white">Activity Timeline</h3>
        <p className="text-[10px] text-slate-400 mt-0.5">{activities.length} recent events</p>
      </div>
      <div className="max-h-[500px] overflow-y-auto divide-y divide-slate-800/50">
        {activities.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">No activity yet</div>
        ) : activities.map(a => {
          const Icon = TYPE_ICONS[a.type] || Zap;
          const color = PHASE_COLORS[a.phase || 'system'] || 'text-slate-400';
          return (
            <div key={a.id} className="p-3 hover:bg-slate-800/20 transition-colors flex items-start gap-3">
              <div className={`w-6 h-6 rounded flex items-center justify-center bg-slate-800 flex-shrink-0 mt-0.5`}>
                <Icon className={`w-3 h-3 ${color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-white">{a.description}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className="text-[8px] h-3 border-slate-700 text-slate-500">{a.type}</Badge>
                  {a.phase && <Badge variant="outline" className="text-[8px] h-3 border-slate-700 text-slate-500">{a.phase}</Badge>}
                  <span className="text-[9px] text-slate-600">{new Date(a.createdAt).toLocaleTimeString()}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
