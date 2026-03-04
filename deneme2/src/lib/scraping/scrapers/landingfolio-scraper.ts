import { ScraperBase } from "../scraper-base";
import type { ScrapedItem } from "@/types/scraping";

export class LandingfolioScraper extends ScraperBase {
  async *scrape(url: string): AsyncGenerator<ScrapedItem> {
    const browser = await this.launchBrowser();

    try {
      const page = await this.createPage(browser);

      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(3000);

      await this.scrollPage(page, 5);

      // Landingfolio landing page cards
      let cards = await page
        .locator("a[href*='/inspiration/'], .card, .landing-card, article")
        .all();

      if (cards.length === 0) {
        cards = await page.locator("figure, .grid-item, img[loading='lazy']").locator("..").all();
      }

      if (cards.length === 0) {
        console.log("[Landingfolio] No cards found, using viewport fallback");
        yield* this.viewportFallback(page, url, "Landingfolio", "landing-page");
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

          const text = await card.textContent().catch(() => null);
          const title = text?.trim().slice(0, 100) || `Landing Page ${count + 1}`;

          const href = await card.getAttribute("href").catch(() => null);
          const sourceUrl = href
            ? href.startsWith("http") ? href : `https://www.landingfolio.com${href}`
            : url;

          yield {
            title: title.replace(/\s+/g, " ").trim(),
            imageBuffer: Buffer.from(screenshot),
            sourceUrl,
            htmlContent: count === 0 ? htmlContent : undefined,
            metadata: { layoutType: "landing-page" },
          };

          count++;
          await this.delay(500);
        } catch {
          continue;
        }
      }

      if (count === 0) {
        yield* this.viewportFallback(page, url, "Landingfolio", "landing-page");
      }
    } finally {
      await browser.close();
    }
  }
}
