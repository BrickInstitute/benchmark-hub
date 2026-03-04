import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runScrapingJob } from "@/lib/jobs/job-runner";

/**
 * Cron endpoint - triggers scraping for all enabled sources that are due.
 *
 * Call this endpoint:
 * - Via Railway cron job (recommended)
 * - Via external cron service (e.g., cron-job.org)
 * - Manually for "one-click bulk scrape"
 *
 * Query params:
 * - ?schedule=daily  -> only run daily sources
 * - ?schedule=weekly -> only run weekly sources
 * - ?all=true        -> run ALL enabled sources (one-click bulk)
 * - ?sourceId=xxx    -> run a specific source
 *
 * Auth: requires API_KEY header for security
 */
export async function POST(request: NextRequest) {
  // Simple API key auth for cron
  const apiKey = request.headers.get("x-api-key") || request.nextUrl.searchParams.get("key");
  if (apiKey !== process.env.API_KEY) {
    return NextResponse.json({ error: "Unauthorized", success: false }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const schedule = searchParams.get("schedule");
  const all = searchParams.get("all") === "true";
  const sourceId = searchParams.get("sourceId");

  // Build query
  const where: Record<string, unknown> = { enabled: true };

  if (sourceId) {
    where.id = sourceId;
  } else if (!all && schedule) {
    where.schedule = schedule;
  }

  // Check timing - don't re-run sources that ran recently
  if (!all && !sourceId) {
    const cutoff = schedule === "weekly"
      ? new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) // 6 days ago
      : new Date(Date.now() - 22 * 60 * 60 * 1000);     // 22 hours ago

    where.OR = [
      { lastRunAt: null },
      { lastRunAt: { lt: cutoff } },
    ];
  }

  const sources = await prisma.scrapingSource.findMany({
    where: where as never,
  });

  if (sources.length === 0) {
    return NextResponse.json({
      data: { message: "No sources due for scraping", triggered: 0 },
      success: true,
    });
  }

  const jobs: { sourceId: string; sourceName: string; jobId: string }[] = [];

  for (const source of sources) {
    try {
      // Create a scraping job for each source
      const job = await prisma.scrapingJob.create({
        data: {
          targetUrl: source.url,
          targetSite: source.site,
          maxItems: source.maxItems,
          config: source.categorySlug ? { category: source.categorySlug } : undefined,
        },
      });

      // Fire and forget
      runScrapingJob({
        jobId: job.id,
        targetUrl: source.url,
        targetSite: source.site,
        maxItems: source.maxItems,
        config: source.categorySlug ? { category: source.categorySlug } : undefined,
      })
        .then(async () => {
          await prisma.scrapingSource.update({
            where: { id: source.id },
            data: { lastRunAt: new Date(), lastRunStatus: "success" },
          });
        })
        .catch(async () => {
          await prisma.scrapingSource.update({
            where: { id: source.id },
            data: { lastRunAt: new Date(), lastRunStatus: "failed" },
          });
        });

      jobs.push({ sourceId: source.id, sourceName: source.name, jobId: job.id });
    } catch (error) {
      console.error(`Failed to start job for source ${source.name}:`, error);
    }
  }

  return NextResponse.json({
    data: {
      message: `Triggered ${jobs.length} scraping job(s)`,
      triggered: jobs.length,
      jobs,
    },
    success: true,
  });
}

// Also support GET for easier cron setup
export async function GET(request: NextRequest) {
  return POST(request);
}
