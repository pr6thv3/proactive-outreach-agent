import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function AnalyticsLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64 bg-slate-800" />
          <Skeleton className="h-4 w-96 bg-slate-850" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28 bg-slate-800 rounded-lg" />
          <Skeleton className="h-9 w-32 bg-slate-800 rounded-lg" />
        </div>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="border-slate-800 bg-slate-900/80 p-4 space-y-3">
            <div className="flex justify-between items-center">
              <Skeleton className="h-4 w-24 bg-slate-800" />
              <Skeleton className="h-8 w-8 rounded-lg bg-slate-800" />
            </div>
            <Skeleton className="h-7 w-20 bg-slate-800" />
            <Skeleton className="h-3 w-36 bg-slate-850" />
          </Card>
        ))}
      </div>

      {/* 2 Chart Skeletons */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
          <Card className="border-slate-800 bg-slate-900/80 p-6 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <Skeleton className="h-5 w-48 bg-slate-800" />
              <Skeleton className="h-4 w-28 bg-slate-850" />
            </div>
            <Skeleton className="h-64 w-full bg-slate-950 rounded-xl" />
          </Card>
        </div>

        <div className="lg:col-span-4">
          <Card className="border-slate-800 bg-slate-900/80 p-6 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <Skeleton className="h-5 w-36 bg-slate-800" />
            </div>
            <div className="space-y-3">
              {[1, 2, 3, 4].map((j) => (
                <div key={j} className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-28 bg-slate-800" />
                    <Skeleton className="h-4 w-12 bg-slate-800" />
                  </div>
                  <Skeleton className="h-2 w-full bg-slate-900 rounded-full" />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
