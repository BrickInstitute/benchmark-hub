import type { Browser } from "playwright";

export interface ValidationResult {
  valid: boolean;
  url: string;
  title: string;
  description: string;
  hasImageGrid: boolean;
  imageCount: number;
  error?: string;
}

async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright");
  return chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
}

export async function validateUrl(url: string): Promise<ValidationResult> {
  let browser: Browser | null = null;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });

    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    if (!response || response.status() >= 400) {
      return {
        valid: false,
        url,
        title: "",
        description: "",
        hasImageGrid: false,
        imageCount: 0,
        error: `HTTP ${response?.status() || "no response"}`,
      };
    }

    // Wait a bit for dynamic content
    await page.waitForTimeout(2000);

    const result = await page.evaluate(() => {
      const title = document.title || "";
      const metaDesc =
        document.querySelector('meta[name="description"]')?.getAttribute("content") || "";

      // Count images and visual elements that suggest a gallery
      const images = document.querySelectorAll("img");
      const links = document.querySelectorAll("a[href] img, a[href] picture");
      const cards = document.querySelectorAll(
        '[class*="card"], [class*="grid"] > *, [class*="gallery"] > *, [class*="item"], [class*="project"]'
      );

      const imageCount = images.length;
      // A gallery-like site typically has many images in a grid
      const hasImageGrid = imageCount >= 5 || links.length >= 3 || cards.length >= 3;

      return { title, description: metaDesc, hasImageGrid, imageCount };
    });

    await browser.close();
    browser = null;

    return {
      valid: result.hasImageGrid,
      url,
      title: result.title,
      description: result.description,
      hasImageGrid: result.hasImageGrid,
      imageCount: result.imageCount,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Validation failed";
    return {
      valid: false,
      url,
      title: "",
      description: "",
      hasImageGrid: false,
      imageCount: 0,
      error: msg,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

export async function validateUrls(
  urls: string[],
  concurrency: number = 2
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  // Process in batches to limit concurrent browser instances
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((url) => validateUrl(url)));
    results.push(...batchResults);
  }

  return results;
}
