import { ScraperBase } from "../scraper-base";
import type { ScrapedItem } from "@/types/scraping";

/**
 * Dribbble API-based scraper - more reliable than browser scraping.
 * Requires a Dribbble API token (get one at https://dribbble.com/account/applications)
 * Falls back to browser scraping if no token is available.
 */
export class DribbbleApiScraper extends ScraperBase {
  async *scrape(url: string): AsyncGenerator<ScrapedItem> {
    const token = process.env.DRIBBBLE_ACCESS_TOKEN;

    if (!token) {
      // Fallback to browser scraping
      const { DribbbleScraper } = await import("./dribbble-scraper");
      const fallback = new DribbbleScraper(this.config);
      yield* fallback.scrape(url);
      return;
    }

    // Parse search query from URL if present
    const urlObj = new URL(url);
    const searchQuery = urlObj.searchParams.get("search") || "";

    let page = 1;
    let count = 0;

    while (count < this.config.maxItems) {
      const apiUrl = searchQuery
        ? `https://api.dribbble.com/v2/user/shots?page=${page}&per_page=30`
        : `https://api.dribbble.com/v2/popular_shots?page=${page}&per_page=30`;

      const response = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        console.error(`Dribbble API error: ${response.status}`);
        break;
      }

      const shots = await response.json();
      if (!shots.length) break;

      for (const shot of shots) {
        if (count >= this.config.maxItems) break;

        try {
          // Download the image
          const imageUrl = shot.images?.hidpi || shot.images?.normal || shot.images?.teaser;
          if (!imageUrl) continue;

          const imgResponse = await fetch(imageUrl);
          if (!imgResponse.ok) continue;

          const imageBuffer = Buffer.from(await imgResponse.arrayBuffer());

          yield {
            title: shot.title || `Dribbble Shot ${shot.id}`,
            description: shot.description?.replace(/<[^>]*>/g, "") || undefined,
            imageBuffer,
            sourceUrl: shot.html_url || `https://dribbble.com/shots/${shot.id}`,
          };

          count++;
          await this.delay(200); // Respect rate limits
        } catch {
          continue;
        }
      }

      page++;
      if (shots.length < 30) break;
    }
  }
}
