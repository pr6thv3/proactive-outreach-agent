import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function CampaignsLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-60 bg-slate-800" />
          <Skeleton className="h-4 w-96 bg-slate-850" />
        </div>
        <Skeleton className="h-9 w-36 bg-slate-800 rounded-lg" />
      </div>

      {/* Campaigns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="border-slate-800 bg-slate-900/80">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <Skeleton className="h-6 w-48 bg-slate-800" />
              <Skeleton className="h-5 w-16 bg-slate-800 rounded-full" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-slate-950 p-3 border border-slate-800 space-y-2">
                  <Skeleton className="h-3.5 w-24 bg-slate-800" />
                  <Skeleton className="h-6 w-12 bg-slate-800" />
                </div>
                <div className="rounded-lg bg-slate-950 p-3 border border-slate-800 space-y-2">
                  <Skeleton className="h-3.5 w-28 bg-slate-800" />
                  <Skeleton className="h-6 w-12 bg-slate-800" />
                </div>
              </div>
              <Skeleton className="h-4 w-64 bg-slate-850" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
