'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Sparkles,
  ArrowRight,
  Database,
  RefreshCw,
} from 'lucide-react';

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onSeedSample?: () => void | Promise<void>;
  seedLabel?: string;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onSeedSample,
  seedLabel = 'Load Sample High-Intent Data',
  className = '',
}: EmptyStateProps) {
  const [seeding, setSeeding] = useState(false);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      if (onSeedSample) {
        await onSeedSample();
      } else {
        const res = await fetch('/api/seed-sample', { method: 'POST' });
        const json = await res.json().catch(() => null);
        if (res.ok) {
          toast.success(json?.data?.message || 'Sample high-intent data loaded successfully!');
          window.location.reload();
        } else {
          toast.error(json?.error?.message || 'Failed to load sample data.');
        }
      }
    } catch (err: any) {
      toast.error('Failed to load sample data: ' + (err?.message || 'Network error'));
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className={`flex flex-col items-center justify-center py-16 px-4 text-center ${className}`}>
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800/80 border border-slate-700/80 mb-5 text-slate-300 shadow-inner">
        {icon}
      </div>

      <h3 className="text-lg font-bold text-slate-100">{title}</h3>
      <p className="text-sm text-slate-400 max-w-md mt-2 leading-relaxed">
        {description}
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-3 mt-6">
        {actionHref && actionLabel && (
          <Link href={actionHref}>
            <Button className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md shadow-blue-900/40 h-9">
              {actionLabel} <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </Link>
        )}

        <Button
          variant="outline"
          onClick={handleSeed}
          disabled={seeding}
          className="border-purple-700/80 bg-purple-950/30 text-purple-200 hover:bg-purple-900/50 hover:text-white text-xs font-semibold h-9 shadow-sm"
        >
          {seeding ? (
            <>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin text-purple-400" />
              Loading High-Intent Data...
            </>
          ) : (
            <>
              <Database className="mr-1.5 h-3.5 w-3.5 text-purple-400" />
              {seedLabel}
            </>
          )}
        </Button>
      </div>

      <div className="flex items-center gap-1.5 mt-6 text-[11px] text-slate-500">
        <Sparkles className="h-3 w-3 text-blue-400" />
        <span>1-Click sandbox testing enabled · No manual setup required</span>
      </div>
    </div>
  );
}
