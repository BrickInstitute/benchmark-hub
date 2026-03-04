export interface DiscoveryStrategy {
  name: string;
  description: string;
  prompt: string;
}

export const DISCOVERY_STRATEGIES: DiscoveryStrategy[] = [
  {
    name: "trending-new",
    description: "Yeni açılmış UI showcase/gallery siteleri",
    prompt: "Find recently launched (2024-2025) websites that showcase or curate web design, UI design, or UX design examples. Focus on new platforms that feature galleries, collections, or portfolios of website designs.",
  },
  {
    name: "niche-specialized",
    description: "Sektöre özel UI design galeri siteleri",
    prompt: "Find websites that curate UI/UX designs for specific industries or niches: fintech, healthcare, SaaS, e-commerce, education, travel. Look for design galleries that focus on a particular vertical.",
  },
  {
    name: "regional",
    description: "Farklı ülkelerdeki yerel web design galeri siteleri",
    prompt: "Find web design gallery and showcase websites from different regions: Japanese, Korean, Chinese, European (German, French, Dutch), Latin American. Focus on sites that curate local web designs.",
  },
  {
    name: "tool-integrated",
    description: "Design tool showcase sayfaları",
    prompt: "Find design tool showcase and community pages: Figma community galleries, Sketch resource sites, Adobe XD showcases, Framer templates, Webflow showcases. Sites that display real designs made with specific tools.",
  },
  {
    name: "award-sites",
    description: "Web tasarım ödül/yarışma siteleri",
    prompt: "Find websites that give awards or recognition to web designs: CSS awards, design competitions, best-of-web showcases, annual design award sites. Focus on sites with galleries of winning designs.",
  },
  {
    name: "curated-lists",
    description: "Küratörlü web design koleksiyon siteleri",
    prompt: "Find curated web design collection and inspiration websites. Look for sites maintained by designers that collect and categorize beautiful websites, similar to siteinspire or webdesign-inspiration.",
  },
  {
    name: "mobile-focused",
    description: "Mobil uygulama UI showcase siteleri",
    prompt: "Find websites that showcase mobile app UI designs, app screenshots, mobile interaction patterns. Sites like Mobbin alternatives, app design galleries, mobile UI pattern collections.",
  },
  {
    name: "dashboard-admin",
    description: "Dashboard ve admin panel tasarım galeri siteleri",
    prompt: "Find websites that showcase dashboard designs, admin panel UIs, data visualization interfaces, analytics dashboards. Look for galleries that collect SaaS dashboard screenshots and examples.",
  },
  {
    name: "landing-page",
    description: "Landing page tasarım koleksiyon siteleri",
    prompt: "Find websites that curate landing page designs: SaaS landing pages, product pages, marketing pages, startup landing pages. Look for galleries specifically focused on landing page inspiration.",
  },
  {
    name: "component-pattern",
    description: "UI component ve pattern library siteleri",
    prompt: "Find websites that showcase UI components, design patterns, interaction patterns, micro-interactions. Sites that collect specific UI elements like navigation, forms, cards, modals, onboarding flows.",
  },
];

export function buildDiscoveryPrompt(
  strategy: DiscoveryStrategy,
  knownUrls: string[],
  category: string
): string {
  const knownList = knownUrls.length > 0
    ? `\n\nALREADY KNOWN SITES (do NOT suggest these or their subdomains):\n${knownUrls.map((u) => `- ${u}`).join("\n")}`
    : "";

  return `You are an expert web design researcher. Your task is to discover websites that showcase, curate, or collect UI/UX design examples.

CATEGORY FOCUS: ${category}
STRATEGY: ${strategy.description}

${strategy.prompt}

${knownList}

IMPORTANT RULES:
- Only suggest websites that are publicly accessible (no login required to browse)
- Sites must have a gallery/grid/collection of design screenshots or examples
- Do NOT suggest social media, blogs, or general portfolio sites
- Do NOT suggest sites that require payment to view content
- Each URL must be the homepage or main gallery page
- Make sure URLs are real, working websites

Respond ONLY with valid JSON array, no other text:
[
  {
    "url": "https://example.com",
    "name": "Example Design Gallery",
    "confidence": 0.9,
    "reason": "Brief explanation of why this site is good for UI benchmarking"
  }
]

Return exactly 10 suggestions. Confidence should be 0.0-1.0 based on how confident you are that:
- The site exists and is accessible
- It contains a gallery of UI/web design screenshots
- It would be useful for UI benchmarking`;
}

export const CATEGORIES = [
  "website",
  "mobile-app",
  "dashboard",
  "landing-page",
  "portfolio",
  "ui-pattern",
] as const;

export type DiscoveryCategory = (typeof CATEGORIES)[number];
