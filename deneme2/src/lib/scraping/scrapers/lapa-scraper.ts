import { ScraperBase } from "../scraper-base";
import type { ScrapedItem } from "@/types/scraping";

export class LapaScraper extends ScraperBase {
  async *scrape(url: string): AsyncGenerator<ScrapedItem> {
    const browser = await this.launchBrowser();

    try {
      const page = await this.createPage(browser);

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(3000);

      await this.scrollPage(page, 5);

      // Lapa.ninja landing page cards
      let cards = await page
        .locator(".card, a[href*='/post/'], article, .site-card")
        .all();

      if (cards.length === 0) {
        cards = await page.locator(".grid-item, figure, a > img").locator("..").all();
      }

      if (cards.length === 0) {
        console.log("[Lapa] No cards found, using viewport fallback");
        yield* this.viewportFallback(page, url, "Lapa.ninja", "landing-page");
        return;
      }

      const htmlContent = await this.captureHtml(page);

      let count = 0;
      for (const card of cards) {
        if (count >= this.config.maxItems) break;

        try {
          const box = await card.boundingBox();
          if (!box || box.width < 100 || box.height < 80) continue;

          const screenshot = await page.screenshot({
            type: "png",
            clip: { x: box.x, y: box.y, width: box.width, height: box.height },
          });

          const titleEl = card.locator("h2, h3, .title, figcaption, p").first();
          const titleText = await titleEl.textContent().catch(() => null);
          const img = card.locator("img").first();
          const alt = await img.getAttribute("alt").catch(() => null);
          const title = titleText?.trim().slice(0, 100) || alt || `Lapa Landing ${count + 1}`;

          const link = card.locator("a[href]").first();
          const href = await link.getAttribute("href").catch(() =>
            card.getAttribute("href").catch(() => null)
          );
          const sourceUrl = href
            ? href.startsWith("http") ? href : `https://www.lapa.ninja${href}`
            : url;

          yield {
            title: title.replace(/\s+/g, " ").trim(),
            imageBuffer: Buffer.from(screenshot),
            sourceUrl,
            metadata: { layoutType: "landing-page" },
          };

          count++;
          await this.delay(500);
        } catch {
          continue;
        }
      }

      if (count === 0) {
        yield* this.viewportFallback(page, url, "Lapa.ninja", "landing-page");
      }
    } finally {
      await browser.close();
    }
  }
}
