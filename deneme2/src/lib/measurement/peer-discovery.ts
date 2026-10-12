/**
 * Peer discovery.
 *
 * The user gives ONE company. The system works out what it is, who its
 * comparable institutions are, and which page on each of those sites plays the
 * same role - then verifies every one of those guesses before anything is
 * allowed into a cohort.
 *
 * The discipline is the same as everywhere else in this pipeline:
 *   the model PROPOSES, the software VERIFIES.
 *
 * A model can name Turkish banks reliably. It cannot be trusted to produce a
 * working URL, and it certainly cannot be trusted to assert that a page is the
 * right kind of page. So:
 *   - proposed domains are resolved by actually fetching them
 *   - the equivalent page is chosen from links we really extracted, never
 *     from a URL the model typed
 *   - every candidate passes the capture quality gate before it counts
 *
 * Anything that fails is dropped with a reason. It never becomes an ABSENT,
 * and it never silently shrinks the denominator without being visible.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { DomSnapshot } from "./dom-snapshot";

const MODEL = process.env.AI_MODEL || "claude-sonnet-5";

export interface TargetIdentity {
  institution: string;
  sectorName: string;
  sectorSlug: string;
  country: string;
  /** What this page is for, in the institution's own terms. */
  pageTopic: string;
  pageRole: "ENTRY" | "LISTING" | "DECISION" | "CONVERSION" | "TRUST";
}

export interface PeerCandidate {
  institution: string;
  domain: string;
  why: string;
}

export interface ResolvedPeer {
  institution: string;
  homepageUrl: string;
  equivalentUrl: string | null;
  linkText: string | null;
  rejectedReason: string | null;
}

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

async function askJson<T>(
  toolName: string,
  description: string,
  schema: object,
  content: Anthropic.MessageParam["content"],
): Promise<T | null> {
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 2048,
    tools: [{ name: toolName, description, input_schema: schema as never }],
    tool_choice: { type: "tool", name: toolName },
    messages: [{ role: "user", content }],
  });
  const block = response.content.find((b) => b.type === "tool_use");
  return block && block.type === "tool_use" ? (block.input as T) : null;
}

/** Works out what the captured page actually is. */
export async function identifyTarget(snapshot: DomSnapshot): Promise<TargetIdentity | null> {
  return askJson<TargetIdentity>(
    "report_identity",
    "Sayfanın hangi kuruma ve sektöre ait olduğunu bildir.",
    {
      type: "object",
      properties: {
        institution: { type: "string", description: "Kurumun yaygın adı" },
        sectorName: { type: "string", description: "Sektörün Türkçe adı" },
        sectorSlug: {
          type: "string",
          description: "Sektör için kısa slug, küçük harf ve tire (ör. bankacilik, ozel-hastane)",
        },
        country: { type: "string", description: "İki harfli ülke kodu" },
        pageTopic: {
          type: "string",
          description: "Bu sayfanın konusu, kurumun kendi diliyle (ör. 'ihtiyaç kredisi')",
        },
        pageRole: {
          type: "string",
          enum: ["ENTRY", "LISTING", "DECISION", "CONVERSION", "TRUST"],
          description:
            "ENTRY ana sayfa, LISTING ürün listeleme, DECISION kullanıcının karar verdiği ürün/hizmet detayı, CONVERSION başvuru/randevu akışı, TRUST kurumsal",
        },
      },
      required: ["institution", "sectorName", "sectorSlug", "country", "pageTopic", "pageRole"],
    },
    [
      {
        type: "text",
        text: `Aşağıdaki sayfanın hangi kuruma ve sektöre ait olduğunu, sayfanın konusunu ve rolünü belirle.

url: ${snapshot.url}
başlık: ${snapshot.title}
görünür metin (ilk 3000 karakter):
${snapshot.visibleText.slice(0, 3000)}`,
      },
    ],
  );
}

/**
 * Names comparable institutions.
 *
 * Only names and domains are asked for. The model is explicitly told not to
 * invent deep links - those are resolved from real pages later.
 */
export async function proposePeers(
  target: TargetIdentity,
  count: number,
): Promise<PeerCandidate[]> {
  const result = await askJson<{ peers: PeerCandidate[] }>(
    "report_peers",
    "Karşılaştırılabilir kurumları listele.",
    {
      type: "object",
      properties: {
        peers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              institution: { type: "string" },
              domain: {
                type: "string",
                description: "Yalnızca ana alan adı, protokol ve yol olmadan (ör. ornekbank.com.tr)",
              },
              why: { type: "string", description: "Neden muadil sayıldığı, tek cümle" },
            },
            required: ["institution", "domain", "why"],
          },
        },
      },
      required: ["peers"],
    },
    [
      {
        type: "text",
        text: `"${target.institution}" kurumunun ${target.country} pazarındaki ${target.sectorName} sektöründe
gerçekten muadili sayılabilecek ${count} kurum say.

Kurallar:
- Aynı ülkede ve aynı sektörde faaliyet göstermeli.
- Benzer ölçekte ve aynı müşteri kitlesine hitap etmeli.
- "${target.institution}" kurumunu listeye KOYMA.
- Yalnızca ana alan adı ver. Derin bağlantı (alt sayfa adresi) UYDURMA;
  alt sayfalar daha sonra gerçek sayfalardan bulunacak.
- Emin olmadığın bir kurumu listeye koyma; eksik liste, yanlış listeden iyidir.`,
      },
    ],
  );
  return result?.peers ?? [];
}

/**
 * Picks the page on a peer's site that plays the same role as the target page.
 *
 * The model chooses from links we actually extracted. It returns an index, so
 * it cannot hand back a URL that does not exist on the page.
 */
export async function resolveEquivalentPage(
  homepage: DomSnapshot,
  target: TargetIdentity,
): Promise<{ href: string; text: string } | null> {
  const seen = new Set<string>();
  const links = homepage.interactive
    .filter((e) => e.role === "link" && e.href && e.onScreen)
    .map((e) => ({ href: e.href as string, text: e.text.trim() }))
    .filter((l) => {
      if (!l.text || l.text.length > 60) return false;
      if (/^(javascript:|#|mailto:|tel:)/i.test(l.href)) return false;
      if (seen.has(l.href)) return false;
      seen.add(l.href);
      return true;
    })
    .slice(0, 120);

  if (links.length === 0) return null;

  const listing = links.map((l, i) => `${i}: "${l.text}" -> ${l.href}`).join("\n");

  const result = await askJson<{ index: number; reason: string }>(
    "choose_link",
    "Hedef sayfanın muadili olan bağlantıyı seç.",
    {
      type: "object",
      properties: {
        index: {
          type: "integer",
          description: "Seçilen bağlantının listedeki numarası. Uygun bağlantı yoksa -1.",
        },
        reason: { type: "string" },
      },
      required: ["index", "reason"],
    },
    [
      {
        type: "text",
        text: `Hedef sayfa konusu: "${target.pageTopic}" (rol: ${target.pageRole})

Aşağıda ${homepage.url} sayfasından çıkarılmış bağlantılar var.
Hedefin muadili olan sayfaya giden bağlantının NUMARASINI seç.

Kurallar:
- Yalnızca listedeki numaralardan birini seç. Yeni bir adres yazma.
- Konu birebir eşleşmiyorsa en yakın olanı seç, ama alakasızsa -1 döndür.
- Listeleme sayfası ile ürün detay sayfası farklıdır; rol ${target.pageRole} olduğu için
  ona uygun olanı tercih et.

BAĞLANTILAR:
${listing}`,
      },
    ],
  );

  if (!result || result.index < 0 || result.index >= links.length) return null;
  const chosen = links[result.index]!;

  // The model returned an index, but verify the href really came from the page.
  if (!seen.has(chosen.href)) return null;
  return chosen;
}

/** Turns a bare domain into a homepage URL. */
export function homepageUrl(domain: string): string {
  const clean = domain.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  return `https://www.${clean.replace(/^www\./i, "")}/`;
}

/** Resolves a possibly relative href against the page it was found on. */
export function absoluteUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sitemap discovery
//
// Homepage links are not enough. In a real cohort run one bank was rejected
// with "no equivalent page found among real links" purely because its loan
// page is not linked from the home page. A sitemap finds pages that navigation
// hides.
//
// The rule does not change: these are CANDIDATE urls. They are still chosen by
// index from a real list, still captured, and still put through the quality
// and topic gates before anything counts.
// ---------------------------------------------------------------------------

const SITEMAP_TIMEOUT_MS = 12_000;
const MAX_SITEMAP_URLS = 400;
const MAX_NESTED_SITEMAPS = 5;

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          process.env.CRAWLER_USER_AGENT ??
          "BenchmarkHubBot/0.1 (+https://brick.institute/bot)",
      },
      signal: AbortSignal.timeout(SITEMAP_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]!);
  return out;
}

/** Sitemap urls declared in robots.txt, else the conventional locations. */
async function sitemapIndexes(origin: string): Promise<string[]> {
  const robots = await fetchText(`${origin}/robots.txt`);
  const declared: string[] = [];
  if (robots) {
    for (const line of robots.split(/\r?\n/)) {
      const m = /^\s*sitemap\s*:\s*(\S+)/i.exec(line);
      if (m) declared.push(m[1]!);
    }
  }
  if (declared.length) return declared.slice(0, MAX_NESTED_SITEMAPS);
  return [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
}

export async function discoverUrlsFromSitemap(origin: string): Promise<string[]> {
  const seen = new Set<string>();
  const queue = await sitemapIndexes(origin);
  let fetched = 0;

  while (queue.length > 0 && seen.size < MAX_SITEMAP_URLS && fetched < MAX_NESTED_SITEMAPS * 2) {
    const next = queue.shift()!;
    const xml = await fetchText(next);
    fetched++;
    if (!xml) continue;

    const locs = extractLocs(xml);
    // A sitemap index points at more sitemaps rather than at pages.
    const isIndex = /<sitemapindex/i.test(xml);
    for (const loc of locs) {
      if (isIndex) {
        if (queue.length < MAX_NESTED_SITEMAPS) queue.push(loc);
      } else if (loc.startsWith(origin)) {
        seen.add(loc);
        if (seen.size >= MAX_SITEMAP_URLS) break;
      }
    }
  }
  return [...seen];
}

/**
 * Picks the equivalent page from sitemap urls.
 *
 * Urls are pre-filtered by topic words so the model is not handed hundreds of
 * unrelated paths, then it chooses by index exactly as it does for homepage
 * links.
 */
export async function resolveEquivalentFromSitemap(
  origin: string,
  target: TargetIdentity,
): Promise<{ href: string; text: string } | null> {
  const urls = await discoverUrlsFromSitemap(origin);
  if (urls.length === 0) return null;

  const fold = (s: string) =>
    s.replace(/[İIı]/g, "i").toLowerCase().replace(/̇/g, "");
  const tokens = fold(target.pageTopic)
    .split(/[^a-z0-9çğöşü]+/)
    .filter((t) => t.length >= 4);

  const scored = urls
    .map((u) => ({ u, hits: tokens.filter((t) => fold(u).includes(t)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.u.length - b.u.length)
    .slice(0, 60);

  if (scored.length === 0) return null;

  const listing = scored.map((x, i) => `${i}: ${x.u}`).join("\n");

  const result = await askJson<{ index: number; reason: string }>(
    "choose_url",
    "Hedef sayfanın muadili olan adresi seç.",
    {
      type: "object",
      properties: {
        index: {
          type: "integer",
          description: "Seçilen adresin listedeki numarası. Uygun adres yoksa -1.",
        },
        reason: { type: "string" },
      },
      required: ["index", "reason"],
    },
    [
      {
        type: "text",
        text: `Hedef sayfa konusu: "${target.pageTopic}" (rol: ${target.pageRole})

Aşağıdaki adresler ${origin} sitesinin sitemap dosyasından alındı.
Hedefin muadili olan sayfanın NUMARASINI seç.

Kurallar:
- Yalnızca listedeki numaralardan birini seç. Yeni bir adres yazma.
- Blog yazısı, haber veya kampanya duyurusu ürün sayfası DEĞİLDİR.
- Rol ${target.pageRole}: listeleme sayfası ile ürün detay sayfası farklıdır.
- Alakalı adres yoksa -1 döndür. Eksik liste, yanlış eşleşmeden iyidir.

ADRESLER:
${listing}`,
      },
    ],
  );

  if (!result || result.index < 0 || result.index >= scored.length) return null;
  return { href: scored[result.index]!.u, text: "(sitemap)" };
}
