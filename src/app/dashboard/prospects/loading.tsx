import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export default function ProspectsLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-64 bg-slate-800" />
        <Skeleton className="h-4 w-96 bg-slate-850" />
      </div>

      {/* Top Banner Skeleton */}
      <Card className="border-slate-800 bg-slate-900/60 p-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-2">
            <Skeleton className="h-5 w-72 bg-slate-800" />
            <Skeleton className="h-3.5 w-96 bg-slate-850" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-28 bg-slate-800 rounded-lg" />
            <Skeleton className="h-8 w-32 bg-slate-800 rounded-lg" />
          </div>
        </div>
      </Card>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
        <Skeleton className="h-9 w-72 bg-slate-800 rounded-lg" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20 bg-slate-800 rounded-md" />
          <Skeleton className="h-8 w-24 bg-slate-800 rounded-md" />
          <Skeleton className="h-8 w-24 bg-slate-800 rounded-md" />
        </div>
      </div>

      {/* Prospect Cards Grid */}
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="border-slate-800 bg-slate-900/80 p-5">
            <CardContent className="p-0 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-44 bg-slate-800" />
                    <Skeleton className="h-4 w-24 bg-slate-850" />
                  </div>
                  <Skeleton className="h-3.5 w-60 bg-slate-850" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-7 w-20 bg-slate-800 rounded-full" />
                  <Skeleton className="h-8 w-24 bg-slate-800 rounded-lg" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800/80 space-y-2">
                  <Skeleton className="h-3 w-32 bg-slate-800" />
                  <Skeleton className="h-4 w-full bg-slate-850" />
                </div>
                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800/80 space-y-2">
                  <Skeleton className="h-3 w-28 bg-slate-800" />
                  <Skeleton className="h-4 w-full bg-slate-850" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
