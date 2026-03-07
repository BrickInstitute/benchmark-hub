import { prisma } from "@/lib/db";
import { getScraper } from "@/lib/scraping/scraper-registry";
import { processImage, getDominantColors } from "@/lib/image/image-processor";
import { getStorageProvider } from "@/lib/storage/storage-provider";
import { createSourceHash, isDuplicate } from "@/lib/scraping/duplicate-detector";
import { scoreBenchmark } from "@/lib/scoring/scoring-engine";
import { nanoid } from "nanoid";
import type { JobContext } from "./job-types";

function scoreInBackground(items: Array<{ id: string; title: string }>) {
  console.log(`[AutoScore] Queuing ${items.length} items for background scoring`);

  // Process scoring sequentially but don't block the caller
  (async () => {
    let scored = 0;
    let skipped = 0;
    let failed = 0;

    for (const item of items) {
      try {
        // Skip if already scored
        const existing = await prisma.score.findFirst({
          where: { benchmarkId: item.id },
          select: { id: true },
        });
        if (existing) {
          skipped++;
          continue;
        }

        await scoreBenchmark(item.id);
        scored++;

        if (scored % 10 === 0) {
          console.log(`[AutoScore] Progress: ${scored}/${items.length} scored, ${skipped} skipped`);
        }

        // Small delay between API calls to avoid rate limiting
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : "Score failed";
        console.error(`[AutoScore] Error scoring "${item.title}": ${msg}`);

        // If rate limited, wait longer before retrying
        if (msg.includes("rate") || msg.includes("429")) {
          console.log("[AutoScore] Rate limited, waiting 30s...");
          await new Promise((r) => setTimeout(r, 30000));
        }
      }
    }
    console.log(`[AutoScore] Done: ${scored} scored, ${skipped} skipped, ${failed} failed out of ${items.length}`);
  })();
}

export async function runScrapingJob(context: JobContext) {
  const { jobId, targetUrl, targetSite, maxItems, config } = context;

  // Update job status to RUNNING
  await prisma.scrapingJob.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  const storage = getStorageProvider();
  const scraper = getScraper(targetSite, { maxItems });

  // Find or use default category
  let categoryId: string;
  if (config?.category) {
    const cat = await prisma.category.findUnique({ where: { slug: config.category } });
    categoryId = cat?.id || (await prisma.category.findFirst())!.id;
  } else {
    const defaultCat = await prisma.category.findFirst();
    categoryId = defaultCat!.id;
  }

  let processedItems = 0;
  let failedItems = 0;
  let skippedDuplicates = 0;
  let totalItems = 0;
  const errors: string[] = [];
  const pendingScores: Array<{ id: string; title: string }> = [];

  try {
    for await (const item of scraper.scrape(targetUrl)) {
      totalItems++;

      try {
        // Duplicate detection
        const sourceHash = createSourceHash(item.sourceUrl, item.imageBuffer);
        if (await isDuplicate(sourceHash)) {
          skippedDuplicates++;
          continue;
        }

        // Process image
        const processed = await processImage(item.imageBuffer);
        const colors = await getDominantColors(item.imageBuffer);

        // Save to storage
        const id = nanoid();
        const imagePath = `benchmarks/${id}.webp`;
        const thumbnailPath = `benchmarks/${id}_thumb.webp`;

        await storage.save(imagePath, processed.buffer, "image/webp");
        await storage.save(thumbnailPath, processed.thumbnailBuffer, "image/webp");

        // Create benchmark record
        const benchmark = await prisma.benchmark.create({
          data: {
            title: item.title,
            description: item.description,
            imagePath,
            thumbnailPath,
            sourceUrl: item.sourceUrl,
            sourceSite: targetSite,
            sourceHash,
            categoryId,
            width: processed.width,
            height: processed.height,
            fileSize: processed.fileSize,
            format: processed.format,
            dominantColors: colors,
            typography: item.metadata?.typography ?? undefined,
            layoutType: item.metadata?.layoutType ?? undefined,
            htmlContent: item.htmlContent ?? undefined,
            scrapingJobId: jobId,
            isUploaded: false,
          },
        });

        processedItems++;

        // Queue for async scoring (don't block scraping)
        if (process.env.ANTHROPIC_API_KEY) {
          pendingScores.push({ id: benchmark.id, title: item.title });
        }
      } catch (error) {
        failedItems++;
        const msg = error instanceof Error ? error.message : "Unknown error";
        errors.push(`Item "${item.title}": ${msg}`);
      }

      // Update progress
      await prisma.scrapingJob.update({
        where: { id: jobId },
        data: {
          totalItems,
          processedItems,
          failedItems,
          errorLog: [...errors, skippedDuplicates > 0 ? `${skippedDuplicates} duplicate(s) skipped` : ""].filter(Boolean),
        },
      });
    }

    // Mark as completed
    await prisma.scrapingJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        totalItems,
        processedItems,
        failedItems,
        errorLog: [...errors, skippedDuplicates > 0 ? `${skippedDuplicates} duplicate(s) skipped` : ""].filter(Boolean),
      },
    });

    // Score benchmarks asynchronously after scraping completes
    if (pendingScores.length > 0) {
      scoreInBackground(pendingScores);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Job failed";
    errors.push(msg);

    await prisma.scrapingJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        totalItems,
        processedItems,
        failedItems,
        errorLog: errors,
      },
    });
  }
}
