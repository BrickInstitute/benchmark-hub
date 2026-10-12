"use client";

import useSWR from "swr";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDate, truncate } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const statusVariant: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  PENDING: "default",
  RUNNING: "info",
  COMPLETED: "success",
  FAILED: "danger",
  CANCELLED: "warning",
};

const dayNames = ["Paz", "Pzt", "Sal", "Car", "Per", "Cum", "Cmt"];

interface StatsData {
  summary: {
    totalBenchmarks: number;
    todayBenchmarks: number;
    totalSources: number;
    activeSources: number;
    pendingJobs: number;
    runningJobs: number;
  };
  dailyStats: Array<{ date: string; count: number }>;
  nextScrapes: Array<{
    sourceName: string;
    sourceUrl: string;
    site: string;
    nextRunAt: string;
    lastStatus: string;
  }>;
  siteBreakdown: Array<{
    site: string;
    sourceCount: number;
    totalCollected: number;
    todayCollected: number;
  }>;
  recentJobs: Array<{
    id: string;
    targetSite: string;
    targetUrl: string;
    status: string;
    processedItems: number;
    failedItems: number;
    createdAt: string;
    completedAt: string | null;
  }>;
}

export default function ScrapingStatusPage() {
  const { data, isLoading } = useSWR<{ data: StatsData; success: boolean }>(
    "/api/scraping/stats",
    fetcher,
    { refreshInterval: 10000 }
  );

  const stats = data?.data;

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Scraping Durumu</h1>
          <p className="text-sm text-muted mt-1">Sistem durumu ve istatistikler</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="max-w-5xl mx-auto">
        <p className="text-sm text-muted text-center py-8">Veriler yuklenemedi.</p>
      </div>
    );
  }

  const { summary, dailyStats, nextScrapes, siteBreakdown, recentJobs } = stats;
  const maxDaily = Math.max(...dailyStats.map((d) => d.count), 1);

  const closestScrape = nextScrapes[0];
  const hasActiveWork = summary.pendingJobs > 0 || summary.runningJobs > 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Scraping Durumu</h1>
        <p className="text-sm text-muted mt-1">
          Sistem durumu ve istatistikler
          <span className="ml-2 text-xs text-muted-2">(10s auto-refresh)</span>
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Toplam Benchmark" value={summary.totalBenchmarks} />
        <SummaryCard
          label="Bugun Eklenen"
          value={summary.todayBenchmarks}
          highlight="green"
        />
        <SummaryCard label="Aktif Kaynaklar" value={summary.activeSources} />
        <SummaryCard
          label="Kuyrukta"
          value={summary.pendingJobs + summary.runningJobs}
          highlight={hasActiveWork ? "blue" : undefined}
        />
      </div>

      {/* System Status */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-ink">Sistem Durumu</h2>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "w-2.5 h-2.5 rounded-full",
                  hasActiveWork ? "bg-mint animate-pulse" : "bg-surface-3"
                )}
              />
              <span className="text-ink-2">
                {summary.runningJobs > 0
                  ? `${summary.runningJobs} job calisiyor`
                  : summary.pendingJobs > 0
                    ? `${summary.pendingJobs} job bekliyor`
                    : "Bosta"}
              </span>
            </div>
            {closestScrape && (
              <div className="text-ink-2">
                Sonraki scraping:{" "}
                <span className="font-medium text-ink">
                  {closestScrape.sourceName}
                </span>{" "}
                <span className="text-xs text-muted-2">
                  ({formatRelativeTime(closestScrape.nextRunAt)})
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 7-Day Chart */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-ink">Son 7 Gun</h2>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3" style={{ height: 180 }}>
            {dailyStats.map((day, i) => {
              const ratio = maxDaily > 0 ? day.count / maxDaily : 0;
              const barHeight = Math.max(Math.round(ratio * 140), 4);
              const isToday = i === dailyStats.length - 1;
              const dayOfWeek = dayNames[new Date(day.date).getDay()];
              return (
                <div
                  key={day.date}
                  className="flex-1 flex flex-col items-center justify-end"
                  style={{ height: 180 }}
                >
                  <span className="text-xs font-medium text-ink-2 mb-1">
                    {day.count > 0 ? day.count : ""}
                  </span>
                  <div
                    className={cn(
                      "w-full rounded-t-md transition-all",
                      isToday ? "bg-brand-600" : "bg-brand-200"
                    )}
                    style={{ height: barHeight, minWidth: 24 }}
                  />
                  <span
                    className={cn(
                      "text-xs mt-2",
                      isToday ? "font-semibold text-brand-300" : "text-muted"
                    )}
                  >
                    {dayOfWeek}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Site Breakdown */}
      {siteBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-ink">Site Bazli Ozet</h2>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="px-6 py-2 font-medium">Site</th>
                  <th className="px-6 py-2 font-medium text-right">Kaynaklar</th>
                  <th className="px-6 py-2 font-medium text-right">Toplam</th>
                  <th className="px-6 py-2 font-medium text-right">Bugun</th>
                </tr>
              </thead>
              <tbody>
                {siteBreakdown.map((row) => (
                  <tr key={row.site} className="border-b border-line hover:bg-surface-2">
                    <td className="px-6 py-2.5">
                      <Badge variant="default">{row.site}</Badge>
                    </td>
                    <td className="px-6 py-2.5 text-right text-ink-2">{row.sourceCount}</td>
                    <td className="px-6 py-2.5 text-right font-medium text-ink">
                      {row.totalCollected}
                    </td>
                    <td className="px-6 py-2.5 text-right">
                      <span
                        className={cn(
                          "font-medium",
                          row.todayCollected > 0 ? "text-mint" : "text-muted-2"
                        )}
                      >
                        {row.todayCollected}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Recent Jobs */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-ink">Son Isler</h2>
        </CardHeader>
        <CardContent className="p-0">
          {recentJobs.length === 0 ? (
            <p className="text-sm text-muted text-center py-8">Henuz is yok.</p>
          ) : (
            <div className="divide-y divide-line">
              {recentJobs.map((job) => (
                <div key={job.id} className="px-6 py-3 flex items-center gap-3">
                  <Badge variant={statusVariant[job.status] || "default"}>
                    {job.status}
                  </Badge>
                  <Badge variant="default">{job.targetSite}</Badge>
                  <span className="text-sm text-ink-2 truncate flex-1 min-w-0">
                    {truncate(job.targetUrl, 50)}
                  </span>
                  <span className="text-xs text-muted whitespace-nowrap">
                    {job.processedItems > 0 && (
                      <span className="text-mint">{job.processedItems} item</span>
                    )}
                    {job.failedItems > 0 && (
                      <span className="text-rose ml-2">{job.failedItems} basarisiz</span>
                    )}
                  </span>
                  <span className="text-xs text-muted-2 whitespace-nowrap">
                    {formatDate(job.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: "green" | "blue";
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted uppercase tracking-wide">{label}</p>
        <p
          className={cn(
            "text-2xl font-bold mt-1",
            highlight === "green" && "text-mint",
            highlight === "blue" && "text-sky",
            !highlight && "text-ink"
          )}
        >
          {value.toLocaleString("tr-TR")}
        </p>
      </CardContent>
    </Card>
  );
}

function formatRelativeTime(isoString: string): string {
  const target = new Date(isoString).getTime();
  const now = Date.now();
  const diffMs = target - now;

  if (diffMs < 0) return "gecmis";

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes}dk`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}sa`;

  const days = Math.floor(hours / 24);
  return `${days}g`;
}
