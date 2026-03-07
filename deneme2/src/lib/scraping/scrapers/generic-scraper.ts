import { ScraperBase } from "../scraper-base";
import type { ScrapedItem } from "@/types/scraping";
import type { Page, Browser } from "playwright";

export class GenericScraper extends ScraperBase {
  async *scrape(url: string): AsyncGenerator<ScrapedItem> {
    const browser = await this.launchBrowser();

    try {
      const page = await this.createPage(browser);

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(3000);

      // Scroll to load lazy content
      await this.scrollPage(page, 8);

      // Extract all project/design links from the gallery
      const links = await this.extractGalleryLinks(page, url);
      console.log(`[GenericScraper] Found ${links.length} links on ${url}`);

      if (links.length === 0) {
        // Fallback: viewport screenshots of the current page
        yield* this.viewportFallback(page, url, "Generic", "website");
        return;
      }

      // Visit each link and take screenshot
      let count = 0;
      for (const link of links) {
        if (count >= this.config.maxItems) break;

        try {
          const item = await this.scrapeLinkedPage(browser, link);
          if (item) {
            yield item;
            count++;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "unknown";
          console.error(`[GenericScraper] Error scraping ${link.url}: ${msg}`);
        }
      }

      // If we couldn't scrape any links, take viewport screenshots
      if (count === 0) {
        yield* this.viewportFallback(page, url, "Generic", "website");
      }
    } finally {
      await browser.close();
    }
  }

  private async extractGalleryLinks(
    page: Page,
    baseUrl: string
  ): Promise<Array<{ url: string; title: string }>> {
    const baseDomain = new URL(baseUrl).hostname;

    const rawLinks = await page.evaluate((baseDomain: string) => {
      const results: Array<{ url: string; title: string }> = [];
      const seen = new Set<string>();

      // Find links that contain images (typical gallery pattern)
      const imgLinks = document.querySelectorAll("a[href]");

      for (const link of imgLinks) {
        const anchor = link as HTMLAnchorElement;
        let href = anchor.href;

        if (!href || href === "#" || href.startsWith("javascript:")) continue;
        if (href.startsWith("mailto:") || href.startsWith("tel:")) continue;

        // Skip social media, legal, and utility links
        const skipPatterns = [
          /\/(login|signup|register|auth|cart|checkout|pricing|about|contact|privacy|terms|faq|help|blog\/\d|tag\/|category\/|author\/)/i,
          /(twitter\.com|facebook\.com|instagram\.com|linkedin\.com|youtube\.com|github\.com|t\.co)/i,
          /\.(pdf|zip|rar|exe|dmg|apk)$/i,
          /#/,
        ];

        if (skipPatterns.some((p) => p.test(href))) continue;

        // Normalize URL
        try {
          const parsed = new URL(href);
          href = parsed.origin + parsed.pathname;
        } catch {
          continue;
        }

        if (seen.has(href)) continue;
        seen.add(href);

        // Prefer links that have images inside (gallery cards)
        const hasImage = anchor.querySelector("img, picture, svg, [style*='background']");
        // Or links with design-related text
        const text = anchor.textContent?.trim() || "";
        const title = anchor.getAttribute("title") || text.slice(0, 100) || "";

        // Score the link: prefer links with images, internal links, and links to subpages
        const isInternal = href.includes(baseDomain);
        const hasPath = new URL(href).pathname.length > 1;

        if ((hasImage || isInternal) && hasPath) {
          results.push({ url: href, title });
        }
      }

      return results;
    }, baseDomain);

    // Deduplicate by domain (avoid scraping same external site twice)
    const seenDomains = new Set<string>();
    const filtered = rawLinks.filter((link) => {
      try {
        const domain = new URL(link.url).hostname;
        // Allow multiple pages from same domain if they're different paths
        const key = link.url;
        if (seenDomains.has(key)) return false;
        seenDomains.add(key);
        return true;
      } catch {
        return false;
      }
    });

    // Shuffle to get variety (don't always scrape the same top items)
    return filtered.sort(() => Math.random() - 0.5);
  }

  private async scrapeLinkedPage(
    browser: Browser,
    link: { url: string; title: string }
  ): Promise<ScrapedItem | null> {
    const page = await this.createPage(browser);

    try {
      const response = await page.goto(link.url, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });

      if (!response || response.status() >= 400) {
        await page.close();
        return null;
      }

      await page.waitForTimeout(2000);

      // Get page title
      const title = (await page.title()) || link.title || new URL(link.url).hostname;

      // Take viewport screenshot
      const screenshot = await page.screenshot({
        type: "png",
        fullPage: false,
      });

      // Capture HTML
      const htmlContent = await this.captureHtml(page);

      // Extract fonts
      const fonts = await page
        .evaluate(() => {
          const computedStyle = window.getComputedStyle(document.body);
          return {
            bodyFont: computedStyle.fontFamily.split(",")[0].trim().replace(/['"]/g, ""),
          };
        })
        .catch(() => ({}));

      await page.close();

      return {
        title,
        imageBuffer: Buffer.from(screenshot),
        sourceUrl: link.url,
        htmlContent,
        metadata: {
          typography: fonts as Record<string, string>,
          layoutType: "website",
        },
      };
    } catch {
      await page.close().catch(() => {});
      return null;
    }
  }
}
