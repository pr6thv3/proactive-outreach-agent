'use client';

import { ReviewQueue } from '@/components/dashboard/review-queue';
import { Keyboard, Sparkles } from 'lucide-react';

export default function ReviewPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-blue-400" />
            AI Outreach Review Queue
          </h2>
          <p className="text-slate-400 text-sm mt-0.5">
            High-velocity 5-second review for AI-researched prospects before dispatch, or switch to 100% Autopilot.
          </p>
        </div>

        {/* Visual Keyboard Hint Badge in Header */}
        <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-700/80 px-3.5 py-1.5 rounded-xl shadow-md font-mono text-xs text-slate-300">
          <Keyboard className="h-4 w-4 text-blue-400" />
          <span className="font-semibold text-slate-200">Hotkeys:</span>
          <span className="flex items-center gap-1.5 flex-wrap">
            <span><kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-emerald-400 font-bold text-[10px]">A</kbd> Approve</span>
            <span className="text-slate-600">·</span>
            <span><kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-blue-400 font-bold text-[10px]">E</kbd> Edit</span>
            <span className="text-slate-600">·</span>
            <span><kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-purple-400 font-bold text-[10px]">G</kbd> Regen</span>
            <span className="text-slate-600">·</span>
            <span><kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-red-400 font-bold text-[10px]">R</kbd> Dismiss</span>
            <span className="text-slate-600">·</span>
            <span><kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-200 font-bold text-[10px]">Space</kbd> Skip</span>
          </span>
        </div>
      </div>

      <ReviewQueue />
    </div>
  );
}
