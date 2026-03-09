import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Run independent queries in parallel
    const [
      totalBenchmarks,
      todayBenchmarks,
      sources,
      pendingJobs,
      runningJobs,
      recentJobs,
      dailyRaw,
    ] = await Promise.all([
      prisma.benchmark.count(),
      prisma.benchmark.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.scrapingSource.findMany(),
      prisma.scrapingJob.count({ where: { status: "PENDING" } }),
      prisma.scrapingJob.count({ where: { status: "RUNNING" } }),
      prisma.scrapingJob.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          targetSite: true,
          targetUrl: true,
          status: true,
          processedItems: true,
          failedItems: true,
          createdAt: true,
          completedAt: true,
        },
      }),
      prisma.$queryRaw`
        SELECT DATE("createdAt") as date, COUNT(*)::bigint as count
        FROM "Benchmark"
        WHERE "createdAt" >= ${new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)}
        GROUP BY DATE("createdAt")
        ORDER BY date ASC
      ` as Promise<Array<{ date: unknown; count: bigint }>>,
    ]);

    const activeSources = sources.filter((s) => s.enabled);

    // Build daily stats for last 7 days (fill missing days with 0)
    const dailyMap = new Map<string, number>();
    for (const row of dailyRaw) {
      const dateStr =
        row.date instanceof Date
          ? row.date.toISOString().split("T")[0]
          : String(row.date).split("T")[0];
      dailyMap.set(dateStr, Number(row.count));
    }

    const dailyStats: Array<{ date: string; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split("T")[0];
      dailyStats.push({ date: dateStr, count: dailyMap.get(dateStr) || 0 });
    }

    // Calculate next scrape times based on schedule
    const cooldownMs: Record<string, number> = {
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
      manual: Infinity,
    };

    const nextScrapes = activeSources
      .filter((s) => s.schedule !== "manual")
      .map((s) => {
        const cooldown = cooldownMs[s.schedule] || cooldownMs.daily;
        const lastRun = s.lastRunAt ? new Date(s.lastRunAt).getTime() : 0;
        const nextRunAt = new Date(lastRun + cooldown);
        return {
          sourceName: s.name,
          sourceUrl: s.url,
          site: s.site,
          nextRunAt: nextRunAt.toISOString(),
          lastStatus: s.lastRunStatus || "never",
        };
      })
      .sort((a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime())
      .slice(0, 10);

    // Site breakdown - group by site from sources + count benchmarks per site
    const siteMap = new Map<
      string,
      { sourceCount: number; totalCollected: number; todayCollected: number }
    >();

    for (const s of sources) {
      const existing = siteMap.get(s.site) || {
        sourceCount: 0,
        totalCollected: 0,
        todayCollected: 0,
      };
      existing.sourceCount++;
      existing.totalCollected += s.totalCollected;
      siteMap.set(s.site, existing);
    }

    // Get today's benchmark counts per sourceSite
    const todayPerSite = await prisma.benchmark.groupBy({
      by: ["sourceSite"],
      where: { createdAt: { gte: todayStart }, sourceSite: { not: null } },
      _count: true,
    });

    for (const row of todayPerSite) {
      if (row.sourceSite) {
        const existing = siteMap.get(row.sourceSite);
        if (existing) {
          existing.todayCollected = row._count;
        }
      }
    }

    const siteBreakdown = Array.from(siteMap.entries())
      .map(([site, data]) => ({ site, ...data }))
      .sort((a, b) => b.totalCollected - a.totalCollected);

    return NextResponse.json({
      data: {
        summary: {
          totalBenchmarks,
          todayBenchmarks,
          totalSources: sources.length,
          activeSources: activeSources.length,
          pendingJobs,
          runningJobs,
        },
        dailyStats,
        nextScrapes,
        siteBreakdown,
        recentJobs: recentJobs.map((j) => ({
          ...j,
          createdAt: j.createdAt.toISOString(),
          completedAt: j.completedAt?.toISOString() || null,
        })),
      },
      success: true,
    });
  } catch (error) {
    console.error("Scraping stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch scraping stats", success: false },
      { status: 500 }
    );
  }
}
