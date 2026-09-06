import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64 bg-slate-800" />
          <Skeleton className="h-4 w-96 bg-slate-850" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-32 bg-slate-800 rounded-lg" />
          <Skeleton className="h-9 w-36 bg-slate-800 rounded-lg" />
        </div>
      </div>

      {/* Top 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="border-slate-800 bg-slate-900/80 p-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24 bg-slate-800" />
              <Skeleton className="h-8 w-8 rounded-lg bg-slate-800" />
            </div>
            <Skeleton className="h-7 w-16 mt-3 bg-slate-800" />
            <Skeleton className="h-3 w-32 mt-2 bg-slate-850" />
          </Card>
        ))}
      </div>

      {/* Funnel Pipeline Banner */}
      <Card className="border-slate-800 bg-slate-900/60 p-5">
        <div className="flex justify-between items-center mb-4">
          <Skeleton className="h-5 w-48 bg-slate-800" />
          <Skeleton className="h-4 w-28 bg-slate-800" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((step) => (
            <div key={step} className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2">
              <Skeleton className="h-3 w-20 bg-slate-800" />
              <Skeleton className="h-6 w-12 bg-slate-800" />
            </div>
          ))}
        </div>
      </Card>

      {/* 2-Column Split: Activity Feed & Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-4">
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader className="pb-3 border-b border-slate-800">
              <Skeleton className="h-5 w-40 bg-slate-800" />
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-44 bg-slate-800" />
                    <Skeleton className="h-3 w-64 bg-slate-850" />
                  </div>
                  <Skeleton className="h-7 w-20 bg-slate-800 rounded-md" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-5 space-y-4">
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader className="pb-3 border-b border-slate-800">
              <Skeleton className="h-5 w-36 bg-slate-800" />
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-32 bg-slate-800" />
                    <Skeleton className="h-4 w-12 bg-slate-800" />
                  </div>
                  <Skeleton className="h-3 w-full bg-slate-850" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
