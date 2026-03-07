import { prisma } from "@/lib/db";
import { scoreBenchmark } from "@/lib/scoring/scoring-engine";
import { runDiscovery } from "@/lib/discovery/discovery-engine";

let schedulerStarted = false;
let scoringInProgress = false;

const SCORING_INTERVAL = 5 * 60 * 1000; // Score every 5 minutes
const DISCOVERY_INTERVAL = 2 * 60 * 60 * 1000; // Discovery every 2 hours
const SCORING_BATCH_SIZE = 20;
const SELF_SCRAPE_INTERVAL = 3 * 60 * 1000; // Self-trigger scraping every 3 minutes

export function startScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  console.log("[Scheduler] Started");

  // Clean up stale RUNNING jobs
  cleanupStaleJobs();

  // Start scoring after 30s
  setTimeout(() => scoreUnscoredBenchmarks(), 30_000);
  setInterval(() => scoreUnscoredBenchmarks(), SCORING_INTERVAL);

  // Discovery every 30 min (checks 2h cooldown internally)
  setTimeout(() => runScheduledDiscovery(), 60_000);
  setInterval(() => runScheduledDiscovery(), 30 * 60 * 1000);

  // Self-trigger scraping via internal HTTP call every 3 minutes
  setTimeout(() => selfTriggerScraping(), 15_000);
  setInterval(() => selfTriggerScraping(), SELF_SCRAPE_INTERVAL);
}

async function cleanupStaleJobs() {
  try {
    const staleAge = new Date(Date.now() - 30 * 60 * 1000);
    const { count } = await prisma.scrapingJob.updateMany({
      where: {
        status: "RUNNING",
        startedAt: { lt: staleAge },
      },
      data: {
        status: "FAILED",
        completedAt: new Date(),
      },
    });
    if (count > 0) console.log(`[Scheduler] Cleaned up ${count} stale RUNNING jobs`);
  } catch (err) {
    console.error("[Scheduler] Cleanup error:", err);
  }
}

/**
 * Self-trigger the cron endpoint to process PENDING jobs.
 * This works around serverless limitations by making an HTTP call to ourselves.
 */
async function selfTriggerScraping() {
  try {
    // Check if there are pending jobs
    const pendingCount = await prisma.scrapingJob.count({ where: { status: "PENDING" } });
    if (pendingCount === 0) {
      // No pending jobs - check if we should create new ones from due sources
      const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : process.env.NEXTAUTH_URL || "http://localhost:3000";

      await fetch(`${baseUrl}/api/scraping/cron?process=true`, {
        method: "POST",
        signal: AbortSignal.timeout(300000), // 5 min timeout
      }).catch(() => {});
      return;
    }

    console.log(`[Scheduler] ${pendingCount} pending jobs, triggering processing...`);

    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : process.env.NEXTAUTH_URL || "http://localhost:3000";

    const res = await fetch(`${baseUrl}/api/scraping/cron?process=true`, {
      method: "POST",
      signal: AbortSignal.timeout(300000), // 5 min timeout
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`[Scheduler] Processed: ${data.data?.processed || 0}, remaining: ${data.data?.remaining || 0}`);
    }
  } catch (err) {
    console.error("[Scheduler] Self-trigger error:", err);
  }
}

async function runScheduledDiscovery() {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return;

    const lastRun = await prisma.discoveryRun.findFirst({
      where: { status: { in: ["completed", "running"] } },
      orderBy: { createdAt: "desc" },
    });

    if (lastRun) {
      const timeSince = Date.now() - lastRun.createdAt.getTime();
      if (timeSince < DISCOVERY_INTERVAL) return;
    }

    console.log("[Scheduler] Starting auto-discovery...");
    await runDiscovery();
    console.log("[Scheduler] Auto-discovery completed");
  } catch (err) {
    console.error("[Scheduler] Discovery error:", err);
  }
}

async function scoreUnscoredBenchmarks() {
  if (!process.env.ANTHROPIC_API_KEY) return;
  if (scoringInProgress) return;

  scoringInProgress = true;

  try {
    const unscored = await prisma.benchmark.findMany({
      where: {
        overallScore: null,
        scores: { none: {} },
      },
      select: { id: true, title: true },
      orderBy: { createdAt: "asc" },
      take: SCORING_BATCH_SIZE,
    });

    if (unscored.length === 0) return;

    console.log(`[Scorer] Found ${unscored.length} unscored benchmarks`);

    let scored = 0;
    let failed = 0;

    for (const item of unscored) {
      try {
        await scoreBenchmark(item.id);
        scored++;
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : "unknown";
        console.error(`[Scorer] Error: ${msg.slice(0, 80)}`);
        if (msg.includes("rate") || msg.includes("429")) break;
      }
    }

    if (scored > 0 || failed > 0) {
      console.log(`[Scorer] Done: ${scored} scored, ${failed} failed`);
    }
  } catch (err) {
    console.error("[Scorer] Error:", err);
  } finally {
    scoringInProgress = false;
  }
}
