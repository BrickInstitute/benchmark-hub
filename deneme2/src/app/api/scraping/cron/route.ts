import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runScrapingJob } from "@/lib/jobs/job-runner";

/**
 * Cron endpoint - processes scraping jobs.
 *
 * Modes:
 * - ?all=true         -> Create PENDING jobs for ALL enabled sources, then process them
 * - ?sourceId=xxx     -> Create + run a specific source
 * - ?process=true     -> Just process existing PENDING jobs (no new creation)
 * - (default)         -> Create jobs for due sources + process pending
 *
 * Jobs are processed synchronously in this request (max 5 per call).
 */
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const all = searchParams.get("all") === "true";
  const sourceId = searchParams.get("sourceId");
  const processOnly = searchParams.get("process") === "true";

  // Step 1: Create new PENDING jobs (unless processOnly)
  let created = 0;
  if (!processOnly) {
    const where: Record<string, unknown> = { enabled: true };
    if (sourceId) {
      where.id = sourceId;
    }

    const sources = await prisma.scrapingSource.findMany({
      where: where as never,
    });

    for (const source of sources) {
      // Skip if there's already a pending/running job
      const existing = await prisma.scrapingJob.findFirst({
        where: {
          targetUrl: source.url,
          status: { in: ["PENDING", "RUNNING"] },
        },
      });
      if (existing) continue;

      // Skip if ran recently (unless all=true or sourceId)
      if (!all && !sourceId) {
        const cooldown = source.schedule === "weekly"
          ? 5 * 24 * 60 * 60 * 1000
          : 12 * 60 * 60 * 1000;
        if (source.lastRunAt && Date.now() - source.lastRunAt.getTime() < cooldown) continue;
      }

      await prisma.scrapingJob.create({
        data: {
          targetUrl: source.url,
          targetSite: source.site,
          maxItems: source.maxItems,
          config: source.categorySlug ? { category: source.categorySlug } : undefined,
        },
      });
      created++;
    }
  }

  // Step 2: Process PENDING jobs (max 10 per request)
  const maxProcess = sourceId ? 1 : 10;
  const pendingJobs = await prisma.scrapingJob.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: maxProcess,
  });

  const results: Array<{ url: string; status: string; items: number }> = [];

  for (const job of pendingJobs) {
    try {
      console.log(`[Cron] Processing: ${job.targetSite} - ${job.targetUrl.slice(0, 60)}`);

      await runScrapingJob({
        jobId: job.id,
        targetUrl: job.targetUrl,
        targetSite: job.targetSite,
        maxItems: job.maxItems,
        config: (job.config as Record<string, string>) || undefined,
      });

      // Update source lastRunAt
      const source = await prisma.scrapingSource.findFirst({
        where: { url: job.targetUrl },
      });
      if (source) {
        await prisma.scrapingSource.update({
          where: { id: source.id },
          data: { lastRunAt: new Date(), lastRunStatus: "success" },
        });
      }

      const updatedJob = await prisma.scrapingJob.findUnique({ where: { id: job.id } });
      results.push({
        url: job.targetUrl,
        status: "success",
        items: updatedJob?.processedItems || 0,
      });

      console.log(`[Cron] Done: ${job.targetSite} - ${updatedJob?.processedItems || 0} items`);
    } catch (err) {
      console.error(`[Cron] Failed: ${job.targetUrl}`, err);

      const source = await prisma.scrapingSource.findFirst({ where: { url: job.targetUrl } });
      if (source) {
        await prisma.scrapingSource.update({
          where: { id: source.id },
          data: { lastRunAt: new Date(), lastRunStatus: "failed" },
        }).catch(() => {});
      }

      results.push({
        url: job.targetUrl,
        status: "failed",
        items: 0,
      });
    }
  }

  // Count remaining
  const remaining = await prisma.scrapingJob.count({ where: { status: "PENDING" } });

  return NextResponse.json({
    data: {
      created,
      processed: results.length,
      remaining,
      results,
      message: remaining > 0
        ? `Processed ${results.length} jobs. ${remaining} still pending - call again to continue.`
        : `All done. Processed ${results.length} jobs.`,
    },
    success: true,
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
