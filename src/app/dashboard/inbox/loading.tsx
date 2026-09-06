import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export default function InboxLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-72 bg-slate-800" />
        <Skeleton className="h-4 w-96 bg-slate-850" />
      </div>

      {/* 4 Category Quick Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="border-slate-800 bg-slate-900/60 p-3.5">
            <CardContent className="p-0 flex items-center justify-between">
              <div className="space-y-1">
                <Skeleton className="h-3 w-20 bg-slate-800" />
                <Skeleton className="h-6 w-10 bg-slate-800" />
              </div>
              <Skeleton className="h-8 w-8 rounded-lg bg-slate-800" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Category Tabs & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
        <div className="flex gap-2 flex-wrap">
          {[1, 2, 3, 4, 5].map((t) => (
            <Skeleton key={t} className="h-8 w-24 bg-slate-800 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-8 w-32 bg-slate-800 rounded-lg" />
      </div>

      {/* 2-Pane Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[550px]">
        {/* Left Pane: Thread list */}
        <div className="lg:col-span-5 space-y-3">
          <Skeleton className="h-9 w-full bg-slate-900 rounded-lg" />
          <div className="space-y-2.5">
            {[1, 2, 3, 4].map((item) => (
              <Card key={item} className="border-slate-800 bg-slate-950 p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <Skeleton className="h-4 w-32 bg-slate-800" />
                  <Skeleton className="h-4 w-16 bg-slate-850" />
                </div>
                <Skeleton className="h-3 w-48 bg-slate-850" />
                <Skeleton className="h-3.5 w-full bg-slate-900" />
              </Card>
            ))}
          </div>
        </div>

        {/* Right Pane: Thread Detail */}
        <div className="lg:col-span-7">
          <Card className="border-slate-800 bg-slate-900/80 p-6 space-y-6 h-full">
            <div className="flex justify-between items-start border-b border-slate-800 pb-4">
              <div className="space-y-2">
                <Skeleton className="h-6 w-48 bg-slate-800" />
                <Skeleton className="h-3.5 w-64 bg-slate-850" />
              </div>
              <Skeleton className="h-6 w-24 bg-slate-800 rounded-full" />
            </div>

            <div className="space-y-3">
              <Skeleton className="h-4 w-32 bg-slate-800" />
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <Skeleton className="h-4 w-full bg-slate-850" />
                <Skeleton className="h-4 w-5/6 bg-slate-850" />
                <Skeleton className="h-4 w-2/3 bg-slate-850" />
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-800">
              <Skeleton className="h-4 w-40 bg-slate-800" />
              <Skeleton className="h-24 w-full bg-slate-950 rounded-xl border border-slate-800" />
              <div className="flex justify-end gap-2">
                <Skeleton className="h-8 w-28 bg-slate-800 rounded-lg" />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
