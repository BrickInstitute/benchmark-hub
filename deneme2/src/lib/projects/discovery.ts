/**
 * Building a project's URL list.
 *
 * Same split as peer-discovery.ts: the model PROPOSES, the software VERIFIES.
 *
 *   brief ("Türkiye'deki bankaların kredi kartı sayfaları")
 *     -> interpretBrief: sector, country, page topic, page role
 *     -> proposeInstitutions: institution names + bare domains only
 *     -> resolveTargetPage: the actual page, chosen from links / sitemap
 *        entries that really exist on the site, never a URL the model typed
 *
 * The user can add a target at any point (a domain or a full URL), exclude or
 * delete suggestions, and overwrite a resolved URL. A manually entered full
 * URL is taken as-is: the user's choice of page is not second-guessed.
 */
import type { PageRole } from "@prisma/client";
import { capturePage, type ViewportName } from "../measurement/capture";
import {
  askJson,
  homepageUrl,
  absoluteUrl,
  resolveEquivalentFromSitemap,
  resolveEquivalentPage,
  type TargetIdentity,
} from "../measurement/peer-discovery";

const PAGE_ROLES = ["ENTRY", "LISTING", "DECISION", "CONVERSION", "TRUST"] as const;

// ---------------------------------------------------------------------------
// Input normalisation (pure)
// ---------------------------------------------------------------------------

/** "https://www.Enpara.com/kredi-karti?x=1" -> "enpara.com". Null if not a host. */
export function normalizeDomain(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!host.includes(".") || /\s/.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

/**
 * What a user typed into "add site": a bare domain means "find the right page
 * for me", a URL with a path means "this exact page".
 */
export function parseTargetInput(input: string): { domain: string; url: string | null } | null {
  const domain = normalizeDomain(input);
  if (!domain) return null;
  const raw = input.trim();
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  const hasPage = url.pathname.replace(/\/+$/, "") !== "" || url.search !== "";
  return { domain, url: hasPage ? url.toString() : null };
}

/** "enpara.com" -> "Enpara". A placeholder until the user or model names it. */
export function institutionFromDomain(domain: string): string {
  const first = domain.split(".")[0] ?? domain;
  return first.charAt(0).toLocaleUpperCase("tr") + first.slice(1);
}

/** Does the page talk about the topic at all? Same check cohort.ts uses. */
export function topicMatches(topic: string, text: string): boolean {
  const fold = (s: string) => s.replace(/[İIı]/g, "i").toLowerCase().replace(/̇/g, "");
  const tokens = fold(topic)
    .split(/[^a-z0-9çğöşü]+/)
    .filter((t) => t.length >= 4);
  if (tokens.length === 0) return true;
  const haystack = fold(text);
  return tokens.some((t) => haystack.includes(t));
}

// ---------------------------------------------------------------------------
// Model: interpret the brief, propose institutions
// ---------------------------------------------------------------------------

export interface BriefReading {
  sectorName: string;
  sectorSlug: string;
  country: string;
  pageTopic: string;
  pageRole: PageRole;
}

/**
 * Reads the brief once, at the first discovery. Existing sector slugs are
 * offered so the model reuses one instead of inventing "hazir-giyim" next to
 * "giyim-perakende" (see docs/olcum-yontemi.md, sector naming).
 */
export async function interpretBrief(
  brief: string,
  existingSectors: Array<{ slug: string; name: string }>,
): Promise<BriefReading | null> {
  const known = existingSectors.length
    ? existingSectors.map((s) => `- ${s.slug} (${s.name})`).join("\n")
    : "(henüz yok)";
  const r = await askJson<BriefReading>(
    "report_brief",
    "Benchmark çalışmasının kapsamını bildir.",
    {
      type: "object",
      properties: {
        sectorName: { type: "string", description: "Sektörün Türkçe adı" },
        sectorSlug: {
          type: "string",
          description: "Küçük harf ve tire. Mevcut sektörlerden biri uyuyorsa ONU kullan.",
        },
        country: { type: "string", description: "İki harfli ülke kodu" },
        pageTopic: {
          type: "string",
          description: "Karşılaştırılacak sayfanın konusu, kurumların kendi diliyle (ör. 'kredi kartı')",
        },
        pageRole: {
          type: "string",
          enum: [...PAGE_ROLES],
          description:
            "ENTRY ana sayfa, LISTING ürün listeleme, DECISION ürün/hizmet detay ya da landing sayfası, CONVERSION başvuru/form akışı, TRUST kurumsal",
        },
      },
      required: ["sectorName", "sectorSlug", "country", "pageTopic", "pageRole"],
    },
    [
      {
        type: "text",
        text: `Bir web benchmark çalışması tanımı:

"${brief}"

Bu çalışmanın hangi sektörde, hangi ülkede, hangi konudaki sayfaları karşılaştırdığını belirle.

Mevcut sektörler:
${known}`,
      },
    ],
  );
  if (!r || !PAGE_ROLES.includes(r.pageRole as (typeof PAGE_ROLES)[number])) return null;
  return {
    ...r,
    sectorSlug: r.sectorSlug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, ""),
    country: (r.country || "TR").toUpperCase().slice(0, 2),
  };
}

export interface InstitutionCandidate {
  institution: string;
  domain: string;
  why: string;
}

export async function proposeInstitutions(args: {
  brief: string;
  reading: BriefReading;
  count: number;
  /** Already on the list (included or excluded) - never proposed again. */
  excludeDomains: string[];
}): Promise<InstitutionCandidate[]> {
  const skip = args.excludeDomains.length ? args.excludeDomains.join(", ") : "(yok)";
  const r = await askJson<{ institutions: InstitutionCandidate[] }>(
    "report_institutions",
    "Benchmark listesine girecek kurumları bildir.",
    {
      type: "object",
      properties: {
        institutions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              institution: { type: "string" },
              domain: {
                type: "string",
                description: "Yalnızca ana alan adı, protokol ve yol olmadan (ör. ornekbank.com.tr)",
              },
              why: { type: "string", description: "Neden listeye girdiği, tek cümle" },
            },
            required: ["institution", "domain", "why"],
          },
        },
      },
      required: ["institutions"],
    },
    [
      {
        type: "text",
        text: `Benchmark çalışması: "${args.brief}"
Sektör: ${args.reading.sectorName}, ülke: ${args.reading.country}, sayfa konusu: "${args.reading.pageTopic}"

Bu çalışmaya girmesi gereken ${args.count} kurumu listele.

Kurallar:
- Çalışmanın tanımına uyan, o ülkede faaliyet gösteren kurumlar olmalı. Dijital bankalar,
  yeni oyuncular gibi tanıma uyan daha küçük kurumları da unutma.
- Yalnızca ana alan adı ver. Alt sayfa adresi UYDURMA; sayfalar sonra gerçek
  bağlantılardan bulunacak.
- Şu alan adlarını listeye KOYMA (zaten listede): ${skip}
- Emin olmadığın kurumu koyma; eksik liste, yanlış listeden iyidir.`,
      },
    ],
    4096,
  );
  const seen = new Set(args.excludeDomains);
  const out: InstitutionCandidate[] = [];
  for (const c of r?.institutions ?? []) {
    const domain = normalizeDomain(c.domain);
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    out.push({ institution: c.institution.trim(), domain, why: c.why });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Software: resolve a domain to the page to analyse
// ---------------------------------------------------------------------------

export type ResolveOutcome =
  | { ok: true; url: string; foundVia: "homepage" | "navigation" | "sitemap"; note: string }
  | { ok: false; note: string };

/**
 * Visits the site and picks the page that matches the project's topic from
 * links that really exist (navigation first, sitemap second). For ENTRY-role
 * projects the homepage is the page.
 */
export async function resolveTargetPage(args: {
  domain: string;
  institution: string;
  reading: BriefReading;
  viewport: ViewportName;
}): Promise<ResolveOutcome> {
  const home = homepageUrl(args.domain);
  const capture = await capturePage({ url: home, viewport: args.viewport });
  if (!capture.snapshot || capture.status !== "SUCCESS") {
    return {
      ok: false,
      note: `ana sayfa açılamadı (${capture.status}${capture.error ? `: ${capture.error.slice(0, 160)}` : ""})`,
    };
  }
  const base = capture.finalUrl ?? home;

  if (args.reading.pageRole === "ENTRY") {
    return { ok: true, url: base, foundVia: "homepage", note: "ana sayfa (proje rolü ENTRY)" };
  }

  const identity: TargetIdentity = {
    institution: args.institution,
    sectorName: args.reading.sectorName,
    sectorSlug: args.reading.sectorSlug,
    country: args.reading.country,
    pageTopic: args.reading.pageTopic,
    pageRole: args.reading.pageRole,
  };

  let link = await resolveEquivalentPage(capture.snapshot, identity);
  let foundVia: "navigation" | "sitemap" = "navigation";
  if (!link) {
    link = await resolveEquivalentFromSitemap(new URL(base).origin, identity);
    foundVia = "sitemap";
  }
  if (!link) {
    return {
      ok: false,
      note: `"${args.reading.pageTopic}" sayfası menüde de sitemap'te de bulunamadı; adresi elle girin`,
    };
  }
  const url = absoluteUrl(link.href, base);
  if (!url) return { ok: false, note: "bulunan bağlantı çözümlenemedi" };
  return {
    ok: true,
    url,
    foundVia,
    note: foundVia === "navigation" ? `menüden bulundu: "${link.text}"` : "sitemap'ten bulundu",
  };
}
