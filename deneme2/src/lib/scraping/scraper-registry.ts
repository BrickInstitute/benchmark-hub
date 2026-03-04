import { ScraperBase, type ScraperConfig } from "./scraper-base";
import { GenericScraper } from "./scrapers/generic-scraper";
import { MobbinScraper } from "./scrapers/mobbin-scraper";
import { DribbbleScraper } from "./scrapers/dribbble-scraper";
import { DribbbleApiScraper } from "./scrapers/dribbble-api-scraper";
import { LandingfolioScraper } from "./scrapers/landingfolio-scraper";
import { AwwwardsScraper } from "./scrapers/awwwards-scraper";
import { BehanceScraper } from "./scrapers/behance-scraper";
import { CollectuiScraper } from "./scrapers/collectui-scraper";
import { SiteInspireScraper } from "./scrapers/siteinspire-scraper";
import { LapaScraper } from "./scrapers/lapa-scraper";
import { WebInspoScraper } from "./scrapers/webinspo-scraper";

const scraperMap: Record<string, new (config: ScraperConfig) => ScraperBase> = {
  generic: GenericScraper,
  mobbin: MobbinScraper,
  dribbble: DribbbleScraper,
  "dribbble-api": DribbbleApiScraper,
  landingfolio: LandingfolioScraper,
  awwwards: AwwwardsScraper,
  behance: BehanceScraper,
  collectui: CollectuiScraper,
  siteinspire: SiteInspireScraper,
  lapa: LapaScraper,
  webinspo: WebInspoScraper,
};

export function getScraper(site: string, config: ScraperConfig): ScraperBase {
  const ScraperClass = scraperMap[site] || GenericScraper;
  return new ScraperClass(config);
}

export function getSupportedSites(): string[] {
  return Object.keys(scraperMap);
}
