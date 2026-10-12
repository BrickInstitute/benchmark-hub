"use client";

import { useScrapingJobs } from "@/hooks/use-scraping";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";

const statusVariant: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  PENDING: "default",
  RUNNING: "info",
  COMPLETED: "success",
  FAILED: "danger",
  CANCELLED: "warning",
};

export function JobList() {
  const { jobs, isLoading } = useScrapingJobs();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <p className="text-sm text-muted text-center py-8">
        Henuz scraping job yok.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {jobs.map((job: {
        id: string;
        targetUrl: string;
        targetSite: string;
        status: string;
        processedItems: number;
        totalItems: number;
        failedItems: number;
        maxItems: number;
        createdAt: string;
        _count: { benchmarks: number };
      }) => (
        <Card key={job.id}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant[job.status] || "default"}>
                    {job.status}
                  </Badge>
                  <span className="text-xs text-muted-2">{job.targetSite}</span>
                </div>
                <p className="text-sm text-ink-2 mt-1 truncate">{job.targetUrl}</p>
                <p className="text-xs text-muted-2 mt-1">
                  {formatDate(job.createdAt)} - {job._count.benchmarks} benchmark olusturuldu
                </p>
              </div>

              <div className="text-right ml-4">
                {job.status === "RUNNING" && (
                  <div>
                    <div className="text-sm font-medium">
                      {job.processedItems}/{job.maxItems}
                    </div>
                    <div className="w-24 bg-surface-3 rounded-full h-1.5 mt-1">
                      <div
                        className="bg-brand-500 h-1.5 rounded-full transition-all"
                        style={{
                          width: `${(job.processedItems / job.maxItems) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
                {job.status === "COMPLETED" && (
                  <span className="text-sm text-mint font-medium">
                    {job.processedItems} basarili
                  </span>
                )}
                {job.failedItems > 0 && (
                  <span className="text-xs text-rose block">
                    {job.failedItems} basarisiz
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
