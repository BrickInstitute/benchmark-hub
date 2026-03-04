import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runScrapingJob } from "@/lib/jobs/job-runner";
import { z } from "zod/v4";

const scrapingSchema = z.object({
  targetUrl: z.string().url(),
  targetSite: z.string(),
  maxItems: z.number().min(1).max(200).optional().default(50),
  config: z
    .object({
      category: z.string().optional(),
      autoScore: z.boolean().optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = scrapingSchema.parse(body);

    const job = await prisma.scrapingJob.create({
      data: {
        targetUrl: parsed.targetUrl,
        targetSite: parsed.targetSite,
        maxItems: parsed.maxItems,
        config: parsed.config ?? undefined,
      },
    });

    // Fire and forget - don't await
    runScrapingJob({
      jobId: job.id,
      targetUrl: parsed.targetUrl,
      targetSite: parsed.targetSite,
      maxItems: parsed.maxItems,
      config: parsed.config,
    }).catch((err) => {
      console.error(`Scraping job ${job.id} failed:`, err);
    });

    return NextResponse.json(
      { data: { jobId: job.id, status: "PENDING" }, success: true },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues, success: false }, { status: 400 });
    }
    console.error("Scraping error:", error);
    return NextResponse.json({ error: "Failed to start scraping", success: false }, { status: 500 });
  }
}
