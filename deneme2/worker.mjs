/**
 * Standalone worker process - runs alongside Next.js server.
 * Continuously processes scraping jobs, scoring, and discovery.
 */
import { PrismaClient } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";

const prisma = new PrismaClient();

const SCRAPE_INTERVAL = 3 * 60 * 1000;
const SCORE_INTERVAL = 3 * 60 * 1000;
const CREATE_JOBS_INTERVAL = 30 * 60 * 1000;
const DISCOVERY_INTERVAL = 2 * 60 * 60 * 1000;
const SCRAPE_COOLDOWN = 3 * 60 * 60 * 1000;
const WEEKLY_COOLDOWN = 5 * 24 * 60 * 60 * 1000;
const SCORING_BATCH = 20;

let scrapingBusy = false;
let scoringBusy = false;

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;

async function main() {
  console.log("[Worker] Starting - scrape every 3min, score every 3min, discover every 2h");

  await cleanupStaleJobs();

  setInterval(() => processJobs().catch(logErr), SCRAPE_INTERVAL);
  setInterval(() => scoreUnscored().catch(logErr), SCORE_INTERVAL);
  setInterval(() => createNewJobs().catch(logErr), CREATE_JOBS_INTERVAL);
  setInterval(() => triggerDiscovery().catch(logErr), DISCOVERY_INTERVAL);

  setTimeout(() => createNewJobs().catch(logErr), 5_000);
  setTimeout(() => processJobs().catch(logErr), 10_000);
  setTimeout(() => scoreUnscored().catch(logErr), 60_000);
  setTimeout(() => triggerDiscovery().catch(logErr), 3 * 60 * 1000);

  setInterval(() => {
    const mem = process.memoryUsage();
    console.log(`[Worker] Alive | RSS: ${Math.round(mem.rss / 1024 / 1024)}MB`);
  }, 10 * 60 * 1000);
}

function logErr(err) {
  console.error("[Worker] Error:", err?.message || err);
}

async function cleanupStaleJobs() {
  const staleAge = new Date(Date.now() - 30 * 60 * 1000);
  const { count } = await prisma.scrapingJob.updateMany({
    where: { status: "RUNNING", startedAt: { lt: staleAge } },
    data: { status: "FAILED", completedAt: new Date() },
  });
  if (count > 0) console.log(`[Worker] Cleaned ${count} stale jobs`);
}

async function createNewJobs() {
  const sources = await prisma.scrapingSource.findMany({ where: { enabled: true } });
  let created = 0;

  for (const source of sources) {
    if (source.schedule === "manual") continue;
    const cooldown = source.schedule === "weekly" ? WEEKLY_COOLDOWN : SCRAPE_COOLDOWN;
    if (source.lastRunAt && Date.now() - source.lastRunAt.getTime() < cooldown) continue;

    const existing = await prisma.scrapingJob.findFirst({
      where: { targetUrl: source.url, status: { in: ["PENDING", "RUNNING"] } },
    });
    if (existing) continue;

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

  const pending = await prisma.scrapingJob.count({ where: { status: "PENDING" } });
  if (created > 0) console.log(`[Worker] Created ${created} jobs (${pending} pending)`);
}

async function processJobs() {
  if (scrapingBusy) return;
  scrapingBusy = true;

  try {
    const pending = await prisma.scrapingJob.count({ where: { status: "PENDING" } });
    if (pending === 0) return;

    console.log(`[Worker] Scraping (${pending} pending)...`);

    // Wait for Next.js to be ready
    for (let i = 0; i < 5; i++) {
      try {
        const check = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(5000) });
        if (check.ok) break;
      } catch {
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    const res = await fetch(`${BASE_URL}/api/scraping/cron?process=true`, {
      method: "POST",
      signal: AbortSignal.timeout(600000),
    });

    if (res.ok) {
      const data = await res.json();
      const d = data.data || {};
      console.log(`[Worker] Scraped: ${d.processed || 0} done, ${d.remaining || 0} left`);
    } else {
      console.error(`[Worker] Cron returned ${res.status}`);
    }
  } catch (err) {
    console.error("[Worker] Scrape error:", err?.message || err);
  } finally {
    scrapingBusy = false;
  }
}

/**
 * Score unscored benchmarks directly using Anthropic API (no HTTP call needed)
 */
async function scoreUnscored() {
  if (!process.env.ANTHROPIC_API_KEY) return;
  if (scoringBusy) return;
  scoringBusy = true;

  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const uploadDir = process.env.UPLOAD_DIR || (process.env.RAILWAY_ENVIRONMENT ? "/app/data/uploads" : "./public/uploads");

    const unscored = await prisma.benchmark.findMany({
      where: { overallScore: null, scores: { none: {} } },
      select: { id: true, title: true, imagePath: true, format: true, htmlContent: true },
      orderBy: { createdAt: "desc" },
      take: SCORING_BATCH,
    });

    if (unscored.length === 0) return;

    // Filter out benchmarks with missing image files
    const withImages = [];
    let skippedMissing = 0;
    for (const item of unscored) {
      const imgPath = path.join(uploadDir, item.imagePath);
      try {
        await fs.access(imgPath);
        withImages.push(item);
      } catch {
        skippedMissing++;
        // Mark as scored with -1 so we don't keep retrying missing images
        await prisma.benchmark.update({
          where: { id: item.id },
          data: { overallScore: -1 },
        });
      }
    }

    if (skippedMissing > 0) console.log(`[Worker] Skipped ${skippedMissing} benchmarks (missing images)`);
    if (withImages.length === 0) return;

    console.log(`[Worker] Scoring ${withImages.length} benchmarks...`);

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    let scored = 0;
    let failed = 0;

    for (const item of withImages) {
      try {
        const imgPath = path.join(uploadDir, item.imagePath);
        const imgBuffer = await fs.readFile(imgPath);
        const imgBase64 = imgBuffer.toString("base64");
        const mimeType = item.format === "png" ? "image/png" : item.format === "webp" ? "image/webp" : "image/jpeg";

        const response = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2048,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mimeType, data: imgBase64 } },
              { type: "text", text: `Score this UI screenshot on a scale of 1-10. Respond ONLY with valid JSON:
{"visualConsistency":7,"layoutQuality":8,"typography":6,"colorHarmony":7,"whitespaceUsage":8,"accessibilityScore":5,"overallScore":7,"feedback":"Turkish feedback.","strengths":["s1","s2","s3"],"improvements":["i1","i2","i3"]}` },
            ],
          }],
        });

        const text = response.content.find(b => b.type === "text")?.text || "";

        // Extract JSON
        let jsonStr = text;
        const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlock) jsonStr = codeBlock[1].trim();
        const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (braceMatch) jsonStr = braceMatch[0];

        // Clean trailing commas
        jsonStr = jsonStr.replace(/,\s*([\]}])/g, "$1");

        const scores = JSON.parse(jsonStr);
        const overall = Math.min(10, Math.max(1, Math.round(scores.overallScore || 5)));

        await prisma.score.create({
          data: {
            benchmarkId: item.id,
            visualConsistency: scores.visualConsistency || 5,
            layoutQuality: scores.layoutQuality || 5,
            typography: scores.typography || 5,
            colorHarmony: scores.colorHarmony || 5,
            whitespaceUsage: scores.whitespaceUsage || 5,
            accessibilityScore: scores.accessibilityScore || 5,
            overallScore: overall,
            feedback: scores.feedback || "",
            strengths: scores.strengths || [],
            improvements: scores.improvements || [],
            aiProvider: "claude",
            aiModel: "claude-haiku-4-5-20251001",
            promptVersion: "v2",
            rawResponse: { content: text },
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
          },
        });

        await prisma.benchmark.update({
          where: { id: item.id },
          data: { overallScore: overall },
        });

        scored++;
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        failed++;
        const msg = err?.message || "unknown";
        if (msg.includes("rate") || msg.includes("429")) {
          console.log("[Worker] Rate limited, pausing scoring");
          break;
        }
        console.error(`[Worker] Score error: ${msg.slice(0, 80)}`);
      }
    }

    if (scored > 0 || failed > 0) {
      console.log(`[Worker] Scored: ${scored} ok, ${failed} failed`);
    }
  } catch (err) {
    console.error("[Worker] Scoring error:", err?.message || err);
  } finally {
    scoringBusy = false;
  }
}

async function triggerDiscovery() {
  if (!process.env.ANTHROPIC_API_KEY) return;

  try {
    const lastRun = await prisma.discoveryRun.findFirst({
      where: { status: { in: ["completed", "running"] } },
      orderBy: { createdAt: "desc" },
    });

    if (lastRun) {
      const timeSince = Date.now() - lastRun.createdAt.getTime();
      if (timeSince < DISCOVERY_INTERVAL) return;
    }

    console.log("[Worker] Running discovery...");
    const res = await fetch(`${BASE_URL}/api/discovery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(120000),
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`[Worker] Discovery:`, data.data?.message || "done");
    }
  } catch (err) {
    console.error("[Worker] Discovery error:", err?.message || err);
  }
}

main().catch((err) => {
  console.error("[Worker] Fatal:", err);
  process.exit(1);
});
