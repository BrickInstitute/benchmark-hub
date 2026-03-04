import { ScraperBase } from "../scraper-base";
import type { ScrapedItem } from "@/types/scraping";

export class CollectuiScraper extends ScraperBase {
  async *scrape(url: string): AsyncGenerator<ScrapedItem> {
    const browser = await this.launchBrowser();

    try {
      const page = await this.createPage(browser);

      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(3000);

      await this.scrollPage(page, 5);

      // CollectUI uses Dribbble embeds
      let cards = await page
        .locator(".card, .dribbble, article, .shot-thumbnail, a[href*='dribbble.com']")
        .all();

      if (cards.length === 0) {
        cards = await page.locator("img[src*='cdn.dribbble'], img[data-src*='dribbble']").locator("..").all();
      }

      if (cards.length === 0) {
        console.log("[CollectUI] No cards found, using viewport fallback");
        yield* this.viewportFallback(page, url, "CollectUI", "ui-pattern");
        return;
      }

      const htmlContent = await this.captureHtml(page);

      let count = 0;
      for (const card of cards) {
        if (count >= this.config.maxItems) break;

        try {
          const box = await card.boundingBox();
          if (!box || box.width < 80 || box.height < 60) continue;

          const screenshot = await page.screenshot({
            type: "png",
            clip: { x: box.x, y: box.y, width: box.width, height: box.height },
          });

          const img = card.locator("img").first();
          const alt = await img.getAttribute("alt").catch(() => null);
          const text = await card.textContent().catch(() => null);
          const title = alt || text?.trim().slice(0, 100) || `UI Pattern ${count + 1}`;

          const link = card.locator("a[href]").first();
          const href = await link.getAttribute("href").catch(() =>
            card.getAttribute("href").catch(() => null)
          );
          const sourceUrl = href
            ? href.startsWith("http") ? href : `https://collectui.com${href}`
            : url;

          yield {
            title: title.replace(/\s+/g, " ").trim(),
            imageBuffer: Buffer.from(screenshot),
            sourceUrl,
            htmlContent: count === 0 ? htmlContent : undefined,
            metadata: { layoutType: "ui-pattern" },
          };

          count++;
          await this.delay(500);
        } catch {
          continue;
        }
      }

      if (count === 0) {
        yield* this.viewportFallback(page, url, "CollectUI", "ui-pattern");
      }
    } finally {
      await browser.close();
    }
  }
}
