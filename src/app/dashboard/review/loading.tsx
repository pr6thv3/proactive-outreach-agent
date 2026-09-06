import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function ReviewLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-72 bg-slate-800" />
        <Skeleton className="h-4 w-96 bg-slate-850" />
      </div>

      {/* Autopilot Banner Skeleton */}
      <Card className="border-slate-800 bg-slate-900/80 p-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg bg-slate-800" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-60 bg-slate-800" />
              <Skeleton className="h-3 w-80 bg-slate-850" />
            </div>
          </div>
          <Skeleton className="h-9 w-40 bg-slate-800 rounded-lg" />
        </div>
      </Card>

      {/* 4 Pipeline Funnel Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 flex items-center justify-between">
            <div className="space-y-1">
              <Skeleton className="h-2.5 w-20 bg-slate-800" />
              <Skeleton className="h-5 w-16 bg-slate-800" />
            </div>
            <Skeleton className="h-5 w-14 bg-slate-800 rounded" />
          </div>
        ))}
      </div>

      {/* Main Review Card Skeleton */}
      <Card className="border-slate-800 bg-slate-900 text-slate-100">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 w-7 rounded-full bg-slate-800" />
            <div className="space-y-1">
              <Skeleton className="h-5 w-64 bg-slate-800" />
              <Skeleton className="h-3 w-40 bg-slate-850" />
            </div>
          </div>
          <Skeleton className="h-8 w-36 bg-slate-800 rounded-md" />
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Col: Context (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              <Skeleton className="h-4 w-44 bg-slate-800" />
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
                <Skeleton className="h-5 w-36 bg-slate-800" />
                <Skeleton className="h-3.5 w-48 bg-slate-850" />
                <Skeleton className="h-3 w-32 bg-slate-850" />
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2">
                <Skeleton className="h-4 w-40 bg-slate-800" />
                <Skeleton className="h-3.5 w-full bg-slate-850" />
                <Skeleton className="h-3.5 w-3/4 bg-slate-850" />
              </div>
            </div>

            {/* Right Col: Sequence & Actions (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              <Skeleton className="h-4 w-52 bg-slate-800" />
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 space-y-4">
                <Skeleton className="h-4 w-28 bg-slate-800" />
                <Skeleton className="h-7 w-full bg-slate-900 rounded" />
                <Skeleton className="h-4 w-24 bg-slate-800" />
                <Skeleton className="h-32 w-full bg-slate-900 rounded" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Skeleton className="h-10 w-full bg-slate-800 rounded-lg" />
                <Skeleton className="h-10 w-full bg-slate-800 rounded-lg" />
                <Skeleton className="h-10 w-full bg-slate-800 rounded-lg" />
                <Skeleton className="h-10 w-full bg-slate-800 rounded-lg" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
