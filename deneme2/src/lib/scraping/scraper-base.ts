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
   * Enhanced fallback: first tries to follow gallery links, then falls back to viewport screenshots.
   * Used when CSS-selector-based card scraping finds 0 items.
   */
  protected async *viewportFallback(
    page: Page,
    url: string,
    siteName: string,
    layoutType: string
  ): AsyncGenerator<ScrapedItem> {
    // First try: extract and follow gallery links
    const links = await this.extractPageLinks(page, url);

    if (links.length > 0) {
      console.log(`[${siteName}] Fallback: following ${links.length} links`);
      const browser = page.context().browser();
      if (!browser) return;

      let count = 0;
      for (const link of links) {
        if (count >= this.config.maxItems) break;

        try {
          const subPage = await this.createPage(browser);
          const response = await subPage.goto(link.url, {
            waitUntil: "domcontentloaded",
            timeout: 20000,
          });

          if (!response || response.status() >= 400) {
            await subPage.close();
            continue;
          }

          await subPage.waitForTimeout(2000);

          const title = (await subPage.title()) || link.title || `${siteName} ${count + 1}`;
          const screenshot = await subPage.screenshot({ type: "png", fullPage: false });
          const htmlContent = count < 3 ? await this.captureHtml(subPage) : undefined;

          await subPage.close();

          yield {
            title,
            imageBuffer: Buffer.from(screenshot),
            sourceUrl: link.url,
            htmlContent,
            metadata: { layoutType },
          };

          count++;
        } catch {
          continue;
        }
      }

      if (count > 0) return;
    }

    // Second fallback: viewport screenshots by scrolling
    console.log(`[${siteName}] Fallback: viewport screenshots`);
    const maxScreenshots = Math.min(this.config.maxItems, 8);
    const pageTitle = await page.title().catch(() => siteName);
    const htmlContent = await this.captureHtml(page);

    for (let i = 0; i < maxScreenshots; i++) {
      try {
        const screenshot = await page.screenshot({ type: "png", fullPage: false });

        yield {
          title: `${pageTitle} - Section ${i + 1}`,
          imageBuffer: Buffer.from(screenshot),
          sourceUrl: url,
          htmlContent: i === 0 ? htmlContent : undefined,
          metadata: { layoutType },
        };

        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
        await page.waitForTimeout(1500);

        const { atBottom } = await page.evaluate(() => ({
          atBottom: window.scrollY + window.innerHeight >= document.body.scrollHeight - 50,
        }));
        if (atBottom) break;
      } catch {
        break;
      }
    }
  }

  /**
   * Extract project/design links from gallery pages.
   */
  private async extractPageLinks(
    page: Page,
    baseUrl: string
  ): Promise<Array<{ url: string; title: string }>> {
    const baseDomain = new URL(baseUrl).hostname;

    const rawLinks = await page.evaluate((baseDomain: string) => {
      const results: Array<{ url: string; title: string }> = [];
      const seen = new Set<string>();

      const allLinks = document.querySelectorAll("a[href]");

      for (const link of allLinks) {
        const anchor = link as HTMLAnchorElement;
        let href = anchor.href;

        if (!href || href === "#" || href.startsWith("javascript:") ||
            href.startsWith("mailto:") || href.startsWith("tel:")) continue;

        const skipPatterns = [
          /\/(login|signup|register|auth|cart|checkout|pricing|about|contact|privacy|terms|faq|help)/i,
          /(twitter\.com|facebook\.com|instagram\.com|linkedin\.com|youtube\.com|github\.com)/i,
          /\.(pdf|zip|rar|exe|dmg|apk)$/i,
        ];

        if (skipPatterns.some((p) => p.test(href))) continue;

        try {
          const parsed = new URL(href);
          href = parsed.origin + parsed.pathname;
        } catch { continue; }

        if (seen.has(href)) continue;
        seen.add(href);

        const hasImage = anchor.querySelector("img, picture, [style*='background']");
        const hasPath = new URL(href).pathname.length > 1;
        const isInternal = href.includes(baseDomain);

        if ((hasImage || isInternal) && hasPath) {
          const title = anchor.getAttribute("title") || anchor.textContent?.trim().slice(0, 100) || "";
          results.push({ url: href, title });
        }
      }

      return results;
    }, baseDomain).catch(() => []);

    return rawLinks.sort(() => Math.random() - 0.5);
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
