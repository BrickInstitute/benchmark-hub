import { ScraperBase } from "../scraper-base";
import type { ScrapedItem } from "@/types/scraping";

export class SiteInspireScraper extends ScraperBase {
  async *scrape(url: string): AsyncGenerator<ScrapedItem> {
    const browser = await this.launchBrowser();

    try {
      const page = await this.createPage(browser);

      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(3000);

      await this.scrollPage(page, 5);

      // SiteInspire grid items
      let cards = await page
        .locator(".showcase-item, .site-thumb, a[href*='/website/']")
        .all();

      if (cards.length === 0) {
        cards = await page.locator("article, .grid-item, figure").all();
      }

      if (cards.length === 0) {
        // Try any container with images
        cards = await page.locator("img[src*='siteinspire']").locator("..").all();
      }

      if (cards.length === 0) {
        console.log("[SiteInspire] No cards found, using viewport fallback");
        yield* this.viewportFallback(page, url, "SiteInspire", "website");
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

          const titleEl = card.locator("h2, h3, .title, figcaption").first();
          const titleText = await titleEl.textContent().catch(() => null);
          const img = card.locator("img").first();
          const alt = await img.getAttribute("alt").catch(() => null);
          const title = titleText?.trim().slice(0, 100) || alt || `SiteInspire ${count + 1}`;

          const link = card.locator("a[href]").first();
          const href = await link.getAttribute("href").catch(() =>
            card.getAttribute("href").catch(() => null)
          );
          const sourceUrl = href
            ? href.startsWith("http") ? href : `https://www.siteinspire.com${href}`
            : url;

          yield {
            title: title.replace(/\s+/g, " ").trim(),
            imageBuffer: Buffer.from(screenshot),
            sourceUrl,
            htmlContent: count === 0 ? htmlContent : undefined,
            metadata: { layoutType: "website" },
          };

          count++;
          await this.delay(500);
        } catch {
          continue;
        }
      }

      if (count === 0) {
        yield* this.viewportFallback(page, url, "SiteInspire", "website");
      }
    } finally {
      await browser.close();
    }
  }
}
