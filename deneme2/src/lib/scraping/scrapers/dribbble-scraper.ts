import { ScraperBase } from "../scraper-base";
import type { ScrapedItem } from "@/types/scraping";

export class DribbbleScraper extends ScraperBase {
  async *scrape(url: string): AsyncGenerator<ScrapedItem> {
    const browser = await this.launchBrowser();

    try {
      const page = await this.createPage(browser);

      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(3000);

      // Scroll to load more shots
      await this.scrollPage(page, 3);

      // Find shot cards - multiple selectors for resilience
      let cards = await page
        .locator("[data-testid='shot-thumbnail'], .shot-thumbnail, .dribbble-shot")
        .all();

      if (cards.length === 0) {
        cards = await page
          .locator("li.shot-thumbnail-container, .shots-grid li, ol.dribbbles li, .shot-grid li")
          .all();
      }

      // Fallback: try any image-containing links
      if (cards.length === 0) {
        cards = await page.locator("a[href*='/shots/'] img").locator("..").all();
      }

      if (cards.length === 0) {
        console.log("[Dribbble] No cards found, using viewport fallback");
        yield* this.viewportFallback(page, url, "Dribbble", "website");
        return;
      }

      // Capture page HTML once for all items
      const htmlContent = await this.captureHtml(page);

      let count = 0;
      for (const item of cards) {
        if (count >= this.config.maxItems) break;

        try {
          const box = await item.boundingBox();
          if (!box || box.width < 50 || box.height < 50) continue;

          const screenshot = await page.screenshot({
            type: "png",
            clip: { x: box.x, y: box.y, width: box.width, height: box.height },
          });

          const img = item.locator("img").first();
          const alt = await img.getAttribute("alt").catch(() => null);
          const title = alt || `Dribbble Shot ${count + 1}`;

          const link = item.locator("a").first();
          const href = await link.getAttribute("href").catch(() => null);
          const sourceUrl = href
            ? href.startsWith("http") ? href : `https://dribbble.com${href}`
            : url;

          yield {
            title,
            imageBuffer: Buffer.from(screenshot),
            sourceUrl,
            htmlContent: count === 0 ? htmlContent : undefined,
          };

          count++;
          await this.delay(500);
        } catch {
          continue;
        }
      }

      if (count === 0) {
        yield* this.viewportFallback(page, url, "Dribbble", "website");
      }
    } finally {
      await browser.close();
    }
  }
}
