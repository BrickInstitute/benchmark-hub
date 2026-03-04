import type { ScrapedItem } from "@/types/scraping";
import type { Page, Browser } from "playwright";

export interface ScraperConfig {
  maxItems: number;
  category?: string;
  autoScore?: boolean;
}

export abstract class ScraperBase {
  protected config: ScraperConfig;

  constructor(config: ScraperConfig) {
    this.config = config;
  }

  abstract scrape(url: string): AsyncGenerator<ScrapedItem>;

  protected async launchBrowser(): Promise<Browser> {
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

  protected async createPage(browser: Browser): Promise<Page> {
    return browser.newPage({
      viewport: { width: 1440, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });
  }

  protected async scrollPage(page: Page, maxScrolls: number = 5): Promise<void> {
    let previousHeight = 0;
    let scrollAttempts = 0;
    while (scrollAttempts < maxScrolls) {
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      if (currentHeight === previousHeight) break;
      previousHeight = currentHeight;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
      scrollAttempts++;
    }
    // Scroll back to top for screenshots
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
  }

  /**
   * Captures cleaned HTML from the page (strips scripts, styles, and large attributes).
   * Truncates to maxLength to avoid storing huge payloads.
   */
  protected async captureHtml(page: Page, maxLength: number = 100_000): Promise<string> {
    const html = await page.evaluate(() => {
      const clone = document.documentElement.cloneNode(true) as HTMLElement;
      // Remove script and style tags
      clone.querySelectorAll("script, style, noscript, svg, iframe").forEach((el) => el.remove());
      // Remove data-uri attributes and overly long attributes
      clone.querySelectorAll("*").forEach((el) => {
        for (const attr of Array.from(el.attributes)) {
          if (attr.value.length > 500) {
            el.removeAttribute(attr.name);
          }
        }
      });
      return clone.outerHTML;
    }).catch(() => "");
    return html.slice(0, maxLength);
  }

  /**
   * Fallback: takes viewport screenshots by scrolling down.
   * Used when CSS-selector-based card scraping finds 0 items.
   */
  protected async *viewportFallback(
    page: Page,
    url: string,
    siteName: string,
    layoutType: string
  ): AsyncGenerator<ScrapedItem> {
    const maxScreenshots = Math.min(this.config.maxItems, 8);
    const pageTitle = await page.title().catch(() => siteName);
    // Capture HTML once for the whole page
    const htmlContent = await this.captureHtml(page);

    for (let i = 0; i < maxScreenshots; i++) {
      try {
        const screenshot = await page.screenshot({ type: "png", fullPage: false });

        yield {
          title: `${pageTitle} - Section ${i + 1}`,
          imageBuffer: Buffer.from(screenshot),
          sourceUrl: url,
          htmlContent: i === 0 ? htmlContent : undefined, // Only attach HTML to first item
          metadata: { layoutType },
        };

        // Scroll one viewport down
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
        await page.waitForTimeout(1500);

        // Check if we've reached the bottom
        const { atBottom } = await page.evaluate(() => ({
          atBottom: window.scrollY + window.innerHeight >= document.body.scrollHeight - 50,
        }));
        if (atBottom) break;
      } catch {
        break;
      }
    }
  }

  protected async captureScreenshot(url: string): Promise<Buffer> {
    const browser = await this.launchBrowser();
    try {
      const page = await this.createPage(browser);
      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(2000);
      const screenshot = await page.screenshot({ type: "png", fullPage: false });
      return Buffer.from(screenshot);
    } finally {
      await browser.close();
    }
  }

  protected async captureFullPageScreenshot(url: string): Promise<Buffer> {
    const browser = await this.launchBrowser();
    try {
      const page = await this.createPage(browser);
      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(2000);
      const screenshot = await page.screenshot({ type: "png", fullPage: true });
      return Buffer.from(screenshot);
    } finally {
      await browser.close();
    }
  }

  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
