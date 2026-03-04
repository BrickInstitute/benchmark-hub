import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { processImage, getDominantColors } from "@/lib/image/image-processor";
import { getStorageProvider } from "@/lib/storage/storage-provider";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "URL is required", success: false },
        { status: 400 }
      );
    }

    // Take screenshot with Playwright
    const { chromium } = await import("playwright");

    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    let screenshotBuffer: Buffer;
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      });

      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(2000);

      const screenshot = await page.screenshot({ type: "png", fullPage: false });
      screenshotBuffer = Buffer.from(screenshot);
    } finally {
      await browser.close();
    }

    // Process image
    const storage = getStorageProvider();
    const processed = await processImage(screenshotBuffer);
    const colors = await getDominantColors(screenshotBuffer);

    const id = nanoid();
    const imagePath = `benchmarks/${id}.webp`;
    const thumbnailPath = `benchmarks/${id}_thumb.webp`;

    await storage.save(imagePath, processed.buffer, "image/webp");
    await storage.save(thumbnailPath, processed.thumbnailBuffer, "image/webp");

    return NextResponse.json({
      data: {
        imagePath,
        thumbnailPath,
        imageUrl: storage.getUrl(imagePath),
        thumbnailUrl: storage.getUrl(thumbnailPath),
        width: processed.width,
        height: processed.height,
        fileSize: processed.fileSize,
        format: processed.format,
        dominantColors: colors,
      },
      success: true,
    });
  } catch (error) {
    console.error("Screenshot error:", error);
    const message = error instanceof Error ? error.message : "Screenshot failed";
    return NextResponse.json(
      { error: message, success: false },
      { status: 500 }
    );
  }
}
