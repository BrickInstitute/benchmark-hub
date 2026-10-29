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

async function main() {
  console.log("Seeding categories...");
  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
  }

  console.log("Seeding tags...");
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

  console.log("Seed completed.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
