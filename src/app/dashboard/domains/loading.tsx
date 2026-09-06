import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function DomainsLoading() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="space-y-2">
          <Skeleton className="h-8 w-72 bg-slate-800" />
          <Skeleton className="h-4 w-96 bg-slate-850" />
        </div>
        <Skeleton className="h-9 w-64 bg-slate-800 rounded-lg" />
      </div>

      {/* Domain Addition Form Skeleton */}
      <Card className="border-slate-800 bg-slate-900/80 p-5 space-y-4">
        <Skeleton className="h-6 w-56 bg-slate-800" />
        <Skeleton className="h-4 w-80 bg-slate-850" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <Skeleton className="h-10 w-full bg-slate-950 rounded-lg border border-slate-800" />
          <Skeleton className="h-10 w-full bg-slate-950 rounded-lg border border-slate-800" />
          <Skeleton className="h-10 w-full bg-slate-950 rounded-lg border border-slate-800" />
        </div>
        <Skeleton className="h-9 w-40 bg-slate-800 rounded-lg" />
      </Card>

      {/* Configured Domains List Skeleton */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-6 w-52 bg-slate-800" />
          <Skeleton className="h-4 w-28 bg-slate-850" />
        </div>

        {[1, 2].map((i) => (
          <Card key={i} className="border-slate-800 bg-slate-900/80 p-5 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <div className="space-y-1.5">
                <Skeleton className="h-5 w-48 bg-slate-800" />
                <Skeleton className="h-3.5 w-36 bg-slate-850" />
              </div>
              <Skeleton className="h-6 w-24 bg-slate-800 rounded-full" />
            </div>

            {/* DNS Records Table Skeleton */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-32 bg-slate-800" />
              <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-3">
                {[1, 2, 3].map((r) => (
                  <div key={r} className="flex justify-between items-center py-2 border-b border-slate-900 last:border-0">
                    <div className="space-y-1">
                      <Skeleton className="h-3.5 w-28 bg-slate-800" />
                      <Skeleton className="h-3 w-48 bg-slate-850" />
                    </div>
                    <Skeleton className="h-6 w-20 bg-slate-800 rounded-md" />
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
