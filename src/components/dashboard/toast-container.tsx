'use client';

import { useDashboardStore } from '@/lib/store';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

export function ToastContainer() {
  const { toasts, removeToast } = useDashboardStore();
  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
      {toasts.map(t => {
        const Icon = t.type === 'success' ? CheckCircle : t.type === 'error' ? AlertCircle : Info;
        const colors = t.type === 'success' ? 'bg-emerald-900/90 border-emerald-700/50 text-emerald-200' : t.type === 'error' ? 'bg-red-900/90 border-red-700/50 text-red-200' : 'bg-slate-800/90 border-slate-700/50 text-slate-200';
        const iconC = t.type === 'success' ? 'text-emerald-400' : t.type === 'error' ? 'text-red-400' : 'text-blue-400';
        return (
          <div key={t.id} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border shadow-lg backdrop-blur-sm ${colors} animate-in slide-in-from-right-full duration-200`}>
            <Icon className={`w-3.5 h-3.5 ${iconC} flex-shrink-0`} />
            <span className="text-xs flex-1">{t.message}</span>
            <button onClick={() => removeToast(t.id)} className="text-slate-400 hover:text-white ml-1"><X className="w-3 h-3" /></button>
          </div>
        );
      })}
    </div>
  );
}
