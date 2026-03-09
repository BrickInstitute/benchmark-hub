import { ScraperBase } from "../scraper-base";
import type { ScrapedItem } from "@/types/scraping";
import type { Page, Browser } from "playwright";

export class GenericScraper extends ScraperBase {
  async *scrape(url: string): AsyncGenerator<ScrapedItem> {
    const browser = await this.launchBrowser();

    try {
      let count = 0;
      const allLinks: Array<{ url: string; title: string }> = [];
      const seenUrls = new Set<string>();
      const MAX_PAGES = 5;

      // Scrape multiple pages (pagination support)
      let currentUrl = url;
      for (let pageNum = 0; pageNum < MAX_PAGES; pageNum++) {
        const page = await this.createPage(browser);

        try {
          await page.goto(currentUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
          await page.waitForTimeout(3000);

          // Scroll aggressively to load lazy/infinite content
          await this.scrollPage(page, 20);

          // Try clicking "Load More" buttons to reveal more content
          await this.clickLoadMore(page);

          const links = await this.extractGalleryLinks(page, url);
          const pageLabel = pageNum > 0 ? ` (page ${pageNum + 1})` : "";
          console.log(`[GenericScraper] Found ${links.length} links on ${currentUrl.slice(0, 80)}${pageLabel}`);

          // Add new links (dedup across pages)
          for (const link of links) {
            if (!seenUrls.has(link.url)) {
              seenUrls.add(link.url);
              allLinks.push(link);
            }
          }

          // If this is the first page and no links found, use viewport fallback
          if (pageNum === 0 && allLinks.length === 0) {
            yield* this.viewportFallback(page, url, "Generic", "website");
            await page.close();
            return;
          }

          // Find next page URL
          const nextPageUrl = await this.findNextPageUrl(page, currentUrl, pageNum);
          await page.close();

          if (!nextPageUrl) break;
          currentUrl = nextPageUrl;
        } catch {
          await page.close().catch(() => {});
          break;
        }
      }

      // Visit each link and take screenshot
      for (const link of allLinks) {
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
      if (count === 0 && allLinks.length > 0) {
        const page = await this.createPage(browser);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
        yield* this.viewportFallback(page, url, "Generic", "website");
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }

  /**
   * Try to click "Load More" / "Show More" buttons to reveal additional items
   */
  private async clickLoadMore(page: Page): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const clicked = await page.evaluate(() => {
          const patterns = [
            /load\s*more/i, /show\s*more/i, /see\s*more/i, /view\s*more/i,
            /daha\s*fazla/i, /devamını\s*gör/i, /more\s*projects/i, /more\s*designs/i,
          ];
          const buttons = document.querySelectorAll("button, a, [role='button'], .load-more, .show-more");
          for (const btn of buttons) {
            const text = btn.textContent?.trim() || "";
            if (patterns.some(p => p.test(text)) && btn instanceof HTMLElement) {
              btn.click();
              return true;
            }
          }
          return false;
        });

        if (!clicked) break;
        await page.waitForTimeout(2000);
      } catch {
        break;
      }
    }
  }

  /**
   * Detect pagination and return the URL for the next page
   */
  private async findNextPageUrl(page: Page, currentUrl: string, currentPage: number): Promise<string | null> {
    // Strategy 1: Look for "next" / ">" links on the page
    const nextLink = await page.evaluate(() => {
      const patterns = [
        /^next$/i, /^sonraki$/i, /^→$/, /^›$/, /^»$/, /^>$/,
        /next\s*page/i, /sonraki\s*sayfa/i,
      ];

      const links = document.querySelectorAll("a[href], button[onclick]");
      for (const link of links) {
        const text = (link.textContent?.trim() || "").slice(0, 30);
        const ariaLabel = link.getAttribute("aria-label") || "";
        const rel = link.getAttribute("rel") || "";

        if (rel === "next" || patterns.some(p => p.test(text) || p.test(ariaLabel))) {
          if (link instanceof HTMLAnchorElement && link.href && !link.href.startsWith("javascript:")) {
            return link.href;
          }
        }
      }
      return null;
    });

    if (nextLink) return nextLink;

    // Strategy 2: Try common pagination URL patterns
    try {
      const parsed = new URL(currentUrl);
      const nextPageNum = currentPage + 2; // currentPage is 0-indexed, pages are 1-indexed

      // Try ?page=N pattern
      const pageParam = parsed.searchParams.get("page");
      if (pageParam) {
        parsed.searchParams.set("page", String(nextPageNum));
        return parsed.toString();
      }

      // Try /page/N/ pattern
      const pageMatch = parsed.pathname.match(/\/page\/(\d+)/);
      if (pageMatch) {
        return currentUrl.replace(/\/page\/\d+/, `/page/${nextPageNum}`);
      }

      // For page 1, try appending common pagination params
      if (currentPage === 0) {
        // Try ?page=2
        parsed.searchParams.set("page", "2");
        return parsed.toString();
      }
    } catch {
      // ignore
    }

    return null;
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

    // Deduplicate by URL
    const seenUrls = new Set<string>();
    const filtered = rawLinks.filter((link) => {
      if (seenUrls.has(link.url)) return false;
      seenUrls.add(link.url);
      return true;
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
