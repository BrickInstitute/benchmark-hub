import { prisma } from "@/lib/db";
import { runScrapingJob } from "./job-runner";
import { runDiscovery } from "@/lib/discovery/discovery-engine";

let schedulerStarted = false;

const HOURLY_INTERVAL = 60 * 60 * 1000; // Check every hour
const DISCOVERY_INTERVAL = 6 * 60 * 60 * 1000; // Discovery every 6 hours

export function startScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  console.log("[Scheduler] Auto-scraping scheduler started");

  // Run first check after 10 seconds (let the app boot)
  setTimeout(() => runScheduledJobs(), 10_000);

  // Run first discovery after 60 seconds
  setTimeout(() => runScheduledDiscovery(), 60_000);

  // Then check scraping every hour
  setInterval(() => runScheduledJobs(), HOURLY_INTERVAL);

  // Check discovery every hour (but only triggers every 6 hours)
  setInterval(() => runScheduledDiscovery(), HOURLY_INTERVAL);
}

async function runScheduledJobs() {
  try {
    const now = new Date();
    const dailyCutoff = new Date(now.getTime() - 22 * 60 * 60 * 1000);
    const weeklyCutoff = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);

    const sources = await prisma.scrapingSource.findMany({
      where: { enabled: true },
    });

    let triggered = 0;

    for (const source of sources) {
      const cutoff = source.schedule === "weekly" ? weeklyCutoff : dailyCutoff;

      // Skip if ran recently
      if (source.lastRunAt && source.lastRunAt > cutoff) continue;
      // Skip manual-only sources
      if (source.schedule === "manual") continue;

      try {
        const job = await prisma.scrapingJob.create({
          data: {
            targetUrl: source.url,
            targetSite: source.site,
            maxItems: source.maxItems,
            config: source.categorySlug ? { category: source.categorySlug } : undefined,
          },
        });

        console.log(`[Scheduler] Starting scrape: ${source.name}`);

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
            console.log(`[Scheduler] Completed: ${source.name}`);
          })
          .catch(async (err) => {
            await prisma.scrapingSource.update({
              where: { id: source.id },
              data: { lastRunAt: new Date(), lastRunStatus: "failed" },
            });
            console.error(`[Scheduler] Failed: ${source.name}`, err);
          });

        triggered++;
      } catch (err) {
        console.error(`[Scheduler] Error starting ${source.name}:`, err);
      }
    }

    if (triggered > 0) {
      console.log(`[Scheduler] Triggered ${triggered} job(s)`);
    }
  } catch (err) {
    console.error("[Scheduler] Error:", err);
  }
}

async function runScheduledDiscovery() {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return;

    // Check if enough time since last discovery
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
