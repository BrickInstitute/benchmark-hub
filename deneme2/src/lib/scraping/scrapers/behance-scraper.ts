import { ScraperBase } from "../scraper-base";
import type { ScrapedItem } from "@/types/scraping";

export class BehanceScraper extends ScraperBase {
  async *scrape(url: string): AsyncGenerator<ScrapedItem> {
    const browser = await this.launchBrowser();

    try {
      const page = await this.createPage(browser);

      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(3000);

      // Dismiss cookie banners
      await page.locator("button:has-text('Accept'), .cookie-accept").first().click().catch(() => {});
      await page.waitForTimeout(1000);

      await this.scrollPage(page, 5);

      // Behance project cards - try multiple selectors
      let cards = await page
        .locator(".ProjectCoverNeue-root, .js-project-cover, a[href*='/gallery/']")
        .all();

      if (cards.length === 0) {
        cards = await page
          .locator(".ContentGrid-gridItem, .e2e-ProjectCoverNeue, [class*='ProjectCover']")
          .all();
      }

      if (cards.length === 0) {
        // Try generic image cards
        cards = await page.locator("img[src*='project_modules']").locator("..").all();
      }

      if (cards.length === 0) {
        console.log("[Behance] No cards found, using viewport fallback");
        yield* this.viewportFallback(page, url, "Behance", "portfolio");
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

          const img = card.locator("img").first();
          const alt = await img.getAttribute("alt").catch(() => null);
          const text = await card.textContent().catch(() => null);
          const title = alt || text?.trim().slice(0, 100) || `Behance Project ${count + 1}`;

          const link = card.locator("a[href]").first();
          const href = await link.getAttribute("href").catch(() =>
            card.getAttribute("href").catch(() => null)
          );
          const sourceUrl = href
            ? href.startsWith("http") ? href : `https://www.behance.net${href}`
            : url;

          yield {
            title: title.replace(/\s+/g, " ").trim(),
            imageBuffer: Buffer.from(screenshot),
            sourceUrl,
            htmlContent: count === 0 ? htmlContent : undefined,
            metadata: { layoutType: "portfolio" },
          };

          count++;
          await this.delay(500);
        } catch {
          continue;
        }
      }

      if (count === 0) {
        yield* this.viewportFallback(page, url, "Behance", "portfolio");
      }
    } finally {
      await browser.close();
    }
  }
}
