// Runtime seed script (no TypeScript compilation needed)
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const categories = [
  { name: "Landing Pages", slug: "landing-pages", icon: "layout", description: "Marketing and product landing pages" },
  { name: "Mobile Screens", slug: "mobile-screens", icon: "smartphone", description: "iOS and Android app screens" },
  { name: "Dashboards", slug: "dashboards", icon: "bar-chart", description: "Admin panels and analytics dashboards" },
  { name: "E-commerce", slug: "e-commerce", icon: "shopping-cart", description: "Online stores and product pages" },
  { name: "SaaS", slug: "saas", icon: "cloud", description: "Software-as-a-service interfaces" },
  { name: "Portfolio", slug: "portfolio", icon: "palette", description: "Personal and agency portfolios" },
  { name: "Blog", slug: "blog", icon: "file-text", description: "Blog layouts and article pages" },
  { name: "Components", slug: "components", icon: "layers", description: "Individual UI components and patterns" },
];

const tags = [
  "minimal", "dark-mode", "light-mode", "gradient", "illustration",
  "photography", "animation", "responsive", "accessibility",
  "material-design", "flat-design", "glassmorphism", "neumorphism",
  "bold-typography", "monochrome", "colorful", "cards", "hero-section",
  "navigation", "footer", "form", "modal", "pricing", "testimonials",
];

const defaultSources = [
  { name: "Dribbble Popular Shots", url: "https://dribbble.com/shots/popular", site: "dribbble", maxItems: 20, schedule: "daily", categorySlug: "components" },
  { name: "Dribbble Web Design", url: "https://dribbble.com/tags/web-design", site: "dribbble", maxItems: 15, schedule: "daily", categorySlug: "landing-pages" },
  { name: "Mobbin iOS Apps", url: "https://mobbin.com/browse/ios/apps", site: "mobbin", maxItems: 20, schedule: "weekly", categorySlug: "mobile-screens" },
  { name: "Landingfolio Inspiration", url: "https://www.landingfolio.com/inspiration/landing-page", site: "landingfolio", maxItems: 15, schedule: "weekly", categorySlug: "landing-pages" },
  { name: "Awwwards Sites of the Day", url: "https://www.awwwards.com/websites/sites_of_the_day/", site: "awwwards", maxItems: 20, schedule: "daily", categorySlug: "landing-pages" },
  { name: "Behance UI/UX", url: "https://www.behance.net/search/projects?field=ui%2Fux", site: "behance", maxItems: 20, schedule: "weekly", categorySlug: "portfolio" },
  { name: "Collect UI Daily", url: "https://collectui.com/designs", site: "collectui", maxItems: 20, schedule: "daily", categorySlug: "components" },
  { name: "SiteInspire Curated", url: "https://www.siteinspire.com/", site: "siteinspire", maxItems: 15, schedule: "weekly", categorySlug: "landing-pages" },
  { name: "Lapa.ninja Landing Pages", url: "https://www.lapa.ninja/", site: "lapa", maxItems: 15, schedule: "weekly", categorySlug: "landing-pages" },
  { name: "WebInspo Gallery", url: "https://www.webinspo.com/", site: "webinspo", maxItems: 15, schedule: "weekly", categorySlug: "landing-pages" },
];

async function main() {
  console.log("[Seed] Checking if seed is needed...");

  const categoryCount = await prisma.category.count();
  if (categoryCount > 0) {
    console.log("[Seed] Database already seeded, skipping.");
    return;
  }

  console.log("[Seed] Seeding categories...");
  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
  }

  console.log("[Seed] Seeding tags...");
  for (const tag of tags) {
    const name = tag
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    await prisma.tag.upsert({
      where: { slug: tag },
      update: {},
      create: { name, slug: tag },
    });
  }

  console.log("[Seed] Seeding default scraping sources...");
  for (const source of defaultSources) {
    const existing = await prisma.scrapingSource.findFirst({
      where: { url: source.url },
    });
    if (!existing) {
      await prisma.scrapingSource.create({ data: source });
    }
  }

  console.log("[Seed] Seed completed.");
}

main()
  .catch((e) => console.error("[Seed] Error:", e))
  .finally(() => prisma.$disconnect());
