import { ScraperBase } from "../scraper-base";
import type { ScrapedItem } from "@/types/scraping";

export class GenericScraper extends ScraperBase {
  async *scrape(url: string): AsyncGenerator<ScrapedItem> {
    const browser = await this.launchBrowser();

    try {
      const page = await this.createPage(browser);

      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(2000);

      // Get page title
      const title = await page.title();

      // Get meta description
      const description = await page
        .locator('meta[name="description"]')
        .getAttribute("content")
        .catch(() => null);

      // Take screenshot
      const screenshot = await page.screenshot({
        type: "png",
        fullPage: false,
      });

      // Capture HTML
      const htmlContent = await this.captureHtml(page);

      // Extract fonts from page
      const fonts = await page.evaluate(() => {
        const computedStyle = window.getComputedStyle(document.body);
        return {
          bodyFont: computedStyle.fontFamily.split(",")[0].trim().replace(/['"]/g, ""),
        };
      }).catch(() => ({}));

      yield {
        title: title || new URL(url).hostname,
        description: description || undefined,
        imageBuffer: Buffer.from(screenshot),
        sourceUrl: url,
        htmlContent,
        metadata: {
          typography: fonts as Record<string, string>,
        },
      };
    } finally {
      await browser.close();
    }
  }
}
