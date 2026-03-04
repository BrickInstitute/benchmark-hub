import { ScraperBase } from "../scraper-base";
import type { ScrapedItem } from "@/types/scraping";

export class MobbinScraper extends ScraperBase {
  async *scrape(url: string): AsyncGenerator<ScrapedItem> {
    const browser = await this.launchBrowser();

    try {
      const page = await this.createPage(browser);

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(3000);

      await this.scrollPage(page, 5);

      // Mobbin uses image links to screens/apps
      let cards = await page.locator("a[href*='/screens/'], a[href*='/apps/']").all();

      if (cards.length === 0) {
        cards = await page.locator("[class*='ScreenCard'], [class*='AppCard'], figure").all();
      }

      if (cards.length === 0) {
        console.log("[Mobbin] No cards found, using viewport fallback");
        yield* this.viewportFallback(page, url, "Mobbin", "mobile-screen");
        return;
      }

      const htmlContent = await this.captureHtml(page);

      let count = 0;
      for (const card of cards) {
        if (count >= this.config.maxItems) break;

        try {
          const box = await card.boundingBox();
          if (!box || box.width < 50 || box.height < 50) continue;

          const screenshot = await page.screenshot({
            type: "png",
            clip: { x: box.x, y: box.y, width: box.width, height: box.height },
          });

          const href = await card.getAttribute("href").catch(() => null);
          const cardUrl = href
            ? href.startsWith("http") ? href : `https://mobbin.com${href}`
            : url;

          const text = await card.textContent().catch(() => null);
          const title = text?.trim().slice(0, 100) || `Mobbin Screen ${count + 1}`;

          yield {
            title,
            imageBuffer: Buffer.from(screenshot),
            sourceUrl: cardUrl,
            htmlContent: count === 0 ? htmlContent : undefined,
            metadata: { layoutType: "mobile-screen" },
          };

          count++;
          await this.delay(500);
        } catch {
          continue;
        }
      }

      if (count === 0) {
        yield* this.viewportFallback(page, url, "Mobbin", "mobile-screen");
      }
    } finally {
      await browser.close();
    }
  }
}
