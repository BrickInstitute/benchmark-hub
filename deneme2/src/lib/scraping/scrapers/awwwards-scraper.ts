import { ScraperBase } from "../scraper-base";
import type { ScrapedItem } from "@/types/scraping";

export class AwwwardsScraper extends ScraperBase {
  async *scrape(url: string): AsyncGenerator<ScrapedItem> {
    const browser = await this.launchBrowser();

    try {
      const page = await this.createPage(browser);

      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(3000);

      // Try to dismiss cookie/popup banners
      await page.locator("button:has-text('Accept'), .cookie-accept, #onetrust-accept-btn-handler").first().click().catch(() => {});
      await page.waitForTimeout(1000);

      await this.scrollPage(page, 5);

      // Find site cards - Awwwards uses various class names
      let cards = await page
        .locator("li[data-id], .js-collectable, article.js-nominee, .box-item")
        .all();

      if (cards.length === 0) {
        cards = await page.locator(".grid__item, .nominees-list li, figure, .wall-item").all();
      }

      if (cards.length === 0) {
        console.log("[Awwwards] No cards found, using viewport fallback");
        yield* this.viewportFallback(page, url, "Awwwards", "website");
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

          const titleEl = card.locator("h2, h3, .heading, .title").first();
          const titleText = await titleEl.textContent().catch(() => null);
          const title = titleText?.trim().slice(0, 100) || `Awwwards Site ${count + 1}`;

          const link = card.locator("a[href]").first();
          const href = await link.getAttribute("href").catch(() => null);
          const sourceUrl = href
            ? href.startsWith("http") ? href : `https://www.awwwards.com${href}`
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
        yield* this.viewportFallback(page, url, "Awwwards", "website");
      }
    } finally {
      await browser.close();
    }
  }
}
