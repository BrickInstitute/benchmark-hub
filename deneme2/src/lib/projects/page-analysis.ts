/**
 * Descriptive page analysis: hero, modules, value propositions.
 *
 * The criteria layer (measurement/analyze.ts) answers closed questions. A
 * benchmark study also needs open ones - "what does each bank's hero say",
 * "which modules do these pages use and in what order", "what do they
 * promise". This file answers those under the same contract as the rest of
 * the pipeline:
 *
 *   - the model returns QUOTES and a CATEGORY from a fixed vocabulary
 *   - software finds each quote in the DOM, computes its box and placement
 *   - a quote that cannot be found is stored with verified = false and a
 *     reason, and is never counted in any project statistic
 *   - hero CTAs come from the DOM alone (InteractiveElement.primaryCta),
 *     the model is not asked
 *
 * The one reading that has no DOM proof is the hero visual type (photo,
 * product image, illustration...). It is stored separately and labelled as a
 * visual reading in the UI.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { PrismaClient } from "@prisma/client";
import type { Box, DomSnapshot } from "../measurement/dom-snapshot";
import { findEvidence, isUsable } from "../measurement/evidence";
import { sliceScreenshot } from "../measurement/extraction";
import { placement } from "../measurement/patterns";
import {
  HERO_VISUALS,
  MODULE_TYPES,
  VALUE_THEMES,
  isHeroVisual,
  isModuleType,
  isValueTheme,
  vocabularyForPrompt,
} from "./vocabulary";

const MODEL = process.env.AI_MODEL || "claude-sonnet-5";
const MAX_MODULES = 24;
const MAX_VALUE_PROPS = 15;
const MAX_CTAS = 4;

export type ElementKind = "HERO_HEADLINE" | "HERO_SUBHEADLINE" | "HERO_CTA" | "MODULE" | "VALUE_PROP";

export interface DescribedElement {
  kind: ElementKind;
  category: string | null;
  text: string;
  title: string | null;
  order: number;
  verified: boolean;
  ambiguous: boolean;
  source: "MODEL_QUOTE" | "DOM_ELEMENT";
  box: Box | null;
  placement: string | null;
  note: string | null;
}

/** What the model is asked to return. Nothing here is trusted as-is. */
export interface RawDescription {
  hero: {
    headline: string;
    subheadline: string;
    visual: string;
  };
  modules: Array<{ type: string; title: string; anchorQuote: string }>;
  valueProps: Array<{ quote: string; theme: string }>;
}

export interface PageDescription {
  heroVisual: string | null;
  elements: DescribedElement[];
  /** Model output dropped before verification (unknown category etc.). */
  discarded: Array<{ what: string; why: string }>;
  usage: { inputTokens: number; outputTokens: number } | null;
  model: string | null;
  raw: RawDescription | null;
}

// ---------------------------------------------------------------------------
// Deterministic half
// ---------------------------------------------------------------------------

/**
 * Hero CTAs straight from the DOM: button-like, action verb, outside
 * menu/footer/cookie, on the first screen. No model involved, so the box is
 * exact (DOM_ELEMENT) and no minimum quote length applies.
 */
export function heroCtasFromDom(snapshot: DomSnapshot): DescribedElement[] {
  const seen = new Set<string>();
  return snapshot.interactive
    .filter((e) => e.primaryCta && e.onScreen && e.box.y < snapshot.viewport.h)
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
    .filter((e) => {
      const key = e.text.trim().toLocaleLowerCase("tr");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_CTAS)
    .map((e, i) => ({
      kind: "HERO_CTA" as const,
      category: null,
      text: e.text.trim(),
      title: null,
      order: i,
      verified: true,
      ambiguous: false,
      source: "DOM_ELEMENT" as const,
      box: e.box,
      placement: placement(e.box, snapshot.viewport.h),
      note: null,
    }));
}

function overlap(a: Box, b: Box): number {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const area = a.w * a.h;
  return area === 0 ? 0 : (w * h) / area;
}

/**
 * The module's box: the smallest DOM region that contains the anchor text,
 * else the anchor's own box. Never a model-drawn rectangle.
 */
function moduleBox(anchor: Box, snapshot: DomSnapshot): Box {
  const containing = snapshot.regions
    .filter((r) => r.type !== "COOKIE" && overlap(anchor, r.box) > 0.8)
    .sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h)[0];
  return containing?.box ?? anchor;
}

// ---------------------------------------------------------------------------
// Verification - pure, testable without a model
// ---------------------------------------------------------------------------

/**
 * Turns the model's raw answer into elements, locating every quote in the DOM.
 * Exported separately from the model call so it can be tested on fixtures.
 */
export function verifyDescription(
  raw: RawDescription,
  snapshot: DomSnapshot,
): Omit<PageDescription, "usage" | "model" | "raw"> {
  const vh = snapshot.viewport.h;
  const elements: DescribedElement[] = [];
  const discarded: PageDescription["discarded"] = [];

  function locate(
    kind: ElementKind,
    quote: string,
    extra: { category?: string | null; title?: string | null; order: number; firstScreenOnly?: boolean },
  ): DescribedElement | null {
    const q = (quote ?? "").trim();
    if (!q) return null;
    const ev = findEvidence(q, snapshot);
    const usable = isUsable(ev);
    let verified = usable;
    let note: string | null = null;
    if (!usable) {
      note = q.length < 8
        ? "alıntı doğrulanamayacak kadar kısa"
        : "alıntı sayfada bulunamadı; doğrulanmadı";
    } else if (extra.firstScreenOnly && ev.box!.y >= vh) {
      verified = false;
      note = "alıntı sayfada var ama ilk ekranda değil; hero sayılmadı";
    }
    return {
      kind,
      category: extra.category ?? null,
      // An exact match means the quote is literally on the page, and it is
      // tighter than the whole DOM node ("Aidatsız" vs the full headline).
      // Otherwise keep the DOM's own text, never the folded search form.
      text: usable && ev.match !== "EXACT" ? (ev.text ?? q) : q,
      title: extra.title ?? null,
      order: extra.order,
      verified,
      ambiguous: usable ? ev.ambiguous : false,
      source: "MODEL_QUOTE",
      box: usable ? ev.box : null,
      placement: usable ? placement(ev.box, vh) : null,
      note,
    };
  }

  // ---- Hero text ----
  const headline = locate("HERO_HEADLINE", raw.hero?.headline, { order: 0, firstScreenOnly: true });
  if (headline) elements.push(headline);
  const sub = locate("HERO_SUBHEADLINE", raw.hero?.subheadline, { order: 0, firstScreenOnly: true });
  if (sub) elements.push(sub);

  // ---- Hero CTAs (DOM only) ----
  elements.push(...heroCtasFromDom(snapshot));

  // ---- Modules ----
  const modules: DescribedElement[] = [];
  for (const m of (raw.modules ?? []).slice(0, MAX_MODULES)) {
    if (!isModuleType(m.type)) {
      discarded.push({ what: `modül "${m.type}"`, why: "sözlükte olmayan modül türü" });
      continue;
    }
    // Anchor first (a text inside the module), title as fallback anchor.
    const anchor = (m.anchorQuote || m.title || "").trim();
    const el = locate("MODULE", anchor, {
      category: m.type,
      title: m.title?.trim() || null,
      order: 0,
    });
    if (!el) {
      discarded.push({ what: `modül "${m.type}"`, why: "alıntı verilmedi" });
      continue;
    }
    if (el.verified && el.box) {
      el.box = moduleBox(el.box, snapshot);
      el.placement = placement(el.box, vh);
    }
    modules.push(el);
  }
  // Same type on the same box twice is one module, not two.
  const moduleKeys = new Set<string>();
  const uniqueModules = modules.filter((m) => {
    if (!m.verified || !m.box) return true;
    const k = `${m.category}:${m.box.x}:${m.box.y}:${m.box.w}:${m.box.h}`;
    if (moduleKeys.has(k)) return false;
    moduleKeys.add(k);
    return true;
  });
  // Order is the page's own top-to-bottom order, computed from boxes - not the
  // order the model happened to list them in. Unverified ones go last.
  uniqueModules
    .sort((a, b) => (a.box?.y ?? Infinity) - (b.box?.y ?? Infinity))
    .forEach((m, i) => (m.order = i));
  elements.push(...uniqueModules);

  // ---- Value propositions ----
  const props: DescribedElement[] = [];
  const propKeys = new Set<string>();
  for (const v of (raw.valueProps ?? []).slice(0, MAX_VALUE_PROPS)) {
    if (!isValueTheme(v.theme)) {
      discarded.push({ what: `değer önerisi "${v.quote}"`, why: `sözlükte olmayan tema "${v.theme}"` });
      continue;
    }
    const el = locate("VALUE_PROP", v.quote, { category: v.theme, order: 0 });
    if (!el) continue;
    const k = el.text.toLocaleLowerCase("tr");
    if (propKeys.has(k)) continue;
    propKeys.add(k);
    props.push(el);
  }
  props
    .sort((a, b) => (a.box?.y ?? Infinity) - (b.box?.y ?? Infinity))
    .forEach((p, i) => (p.order = i));
  elements.push(...props);

  let heroVisual: string | null = null;
  if (raw.hero?.visual) {
    if (isHeroVisual(raw.hero.visual)) heroVisual = raw.hero.visual;
    else discarded.push({ what: `hero görseli "${raw.hero.visual}"`, why: "sözlükte olmayan görsel türü" });
  }

  return { heroVisual, elements, discarded };
}

// ---------------------------------------------------------------------------
// Model half
// ---------------------------------------------------------------------------

const SCHEMA = {
  type: "object" as const,
  properties: {
    hero: {
      type: "object" as const,
      properties: {
        headline: { type: "string" as const, description: "Hero'daki ana başlık, sayfadaki haliyle birebir. Yoksa boş." },
        subheadline: { type: "string" as const, description: "Ana başlığın altındaki açıklama cümlesi, birebir. Yoksa boş." },
        visual: { type: "string" as const, enum: Object.keys(HERO_VISUALS) },
      },
      required: ["headline", "subheadline", "visual"],
    },
    modules: {
      type: "array" as const,
      description: "Sayfadaki bölümler, yukarıdan aşağıya.",
      items: {
        type: "object" as const,
        properties: {
          type: { type: "string" as const, enum: Object.keys(MODULE_TYPES) },
          title: { type: "string" as const, description: "Bölümün başlığı, birebir. Yoksa boş." },
          anchorQuote: {
            type: "string" as const,
            description: "Bölümün İÇİNDEN birebir alınmış, en az 8 karakterlik ayırt edici bir metin.",
          },
        },
        required: ["type", "title", "anchorQuote"],
      },
    },
    valueProps: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          quote: { type: "string" as const, description: "Vaadin sayfadaki birebir metni." },
          theme: { type: "string" as const, enum: Object.keys(VALUE_THEMES) },
        },
        required: ["quote", "theme"],
      },
    },
  },
  required: ["hero", "modules", "valueProps"],
};

function buildPrompt(snapshot: DomSnapshot, pageTopic: string | null): string {
  return `Bu bir web benchmark çalışmasının parçası. Ekteki ekran görüntüsü parçaları ve
görünür metin aynı sayfaya ait${pageTopic ? ` (sayfa konusu: "${pageTopic}")` : ""}.

Üç şey çıkar:

1. HERO: Sayfanın ilk ekranındaki ana başlık ve alt açıklama (birebir metin), ve hero'da
   kullanılan görselin türü.
2. MODÜLLER: Sayfadaki bölümleri yukarıdan aşağıya sırala. Her bölüm için türünü aşağıdaki
   listeden seç ve bölümün içinden birebir bir metin (anchorQuote) ver. Menü ve çerez
   bildirimini sayma. Altbilgiyi (footer) sayma.
3. DEĞER ÖNERİLERİ: Sayfanın kullanıcıya verdiği vaatler ("aidatsız", "dakikalar içinde
   onay", "her alışverişe %5 iade"). Her biri için birebir metni ve temasını ver.
   Genel menü bağlantıları veya yasal metin değer önerisi değildir.

Kurallar:
- Her metin sayfada GÖRÜNDÜĞÜ GİBİ, birebir olmalı. Yazılım bu metinleri sayfada arayacak;
  bulunamayan metin doğrulanmamış sayılır ve rapora girmez. Kendi cümleni kurma, özetleme.
- Tür ve tema yalnızca listedeki anahtarlardan biri olabilir.
- Emin olmadığın şeyi ekleme. Eksik liste, uydurulmuş listeden iyidir.
- Koordinat verme; yerleşimi yazılım hesaplayacak.

MODÜL TÜRLERİ:
${vocabularyForPrompt(MODULE_TYPES)}

DEĞER ÖNERİSİ TEMALARI:
${vocabularyForPrompt(VALUE_THEMES)}

HERO GÖRSEL TÜRLERİ:
${vocabularyForPrompt(HERO_VISUALS)}

SAYFA:
url: ${snapshot.url}
başlık: ${snapshot.title}
görünür metin (ilk 8000 karakter):
${snapshot.visibleText.slice(0, 8000)}`;
}

/** Model call + verification. Throws only on configuration/network errors. */
export async function describePage(
  snapshot: DomSnapshot,
  fullScreenshot: Buffer,
  pageTopic: string | null,
): Promise<PageDescription> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey });
  const slices = await sliceScreenshot(fullScreenshot);

  const content: Anthropic.MessageParam["content"] = [
    ...slices.flatMap((buf, i) => [
      { type: "text" as const, text: `Sayfa parçası ${i + 1}/${slices.length}:` },
      {
        type: "image" as const,
        source: { type: "base64" as const, media_type: "image/png" as const, data: buf.toString("base64") },
      },
    ]),
    { type: "text" as const, text: buildPrompt(snapshot, pageTopic) },
  ];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [
      {
        name: "report_page_description",
        description: "Sayfanın hero'sunu, modüllerini ve değer önerilerini bildir.",
        input_schema: SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: "report_page_description" },
    messages: [{ role: "user", content }],
  });

  const block = response.content.find((b) => b.type === "tool_use");
  const raw: RawDescription =
    block && block.type === "tool_use"
      ? (block.input as RawDescription)
      : { hero: { headline: "", subheadline: "", visual: "" }, modules: [], valueProps: [] };

  return {
    ...verifyDescription(raw, snapshot),
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    model: MODEL,
    raw,
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export async function savePageAnalysis(
  prisma: PrismaClient,
  benchmarkId: string,
  result:
    | { status: "DONE"; description: PageDescription }
    | { status: "SKIPPED" | "FAILED"; note: string; elements?: DescribedElement[] },
): Promise<void> {
  // Re-running a benchmark's description replaces it; elements cascade.
  await prisma.pageAnalysis.deleteMany({ where: { benchmarkId } });

  const d = result.status === "DONE" ? result.description : null;
  const elements = d ? d.elements : result.status !== "DONE" ? (result.elements ?? []) : [];
  const note =
    result.status === "DONE"
      ? d!.discarded.length
        ? `${d!.discarded.length} model çıktısı sözlük dışı olduğu için atıldı: ` +
          d!.discarded.map((x) => `${x.what} (${x.why})`).join("; ")
        : null
      : result.note;

  await prisma.pageAnalysis.create({
    data: {
      benchmarkId,
      status: result.status,
      note,
      heroVisual: d?.heroVisual ?? null,
      model: d?.model ?? null,
      inputTokens: d?.usage?.inputTokens ?? null,
      outputTokens: d?.usage?.outputTokens ?? null,
      rawResponse: d?.raw ? (d.raw as unknown as object) : undefined,
      elements: {
        create: elements.map((e) => ({
          kind: e.kind,
          category: e.category,
          text: e.text,
          title: e.title,
          order: e.order,
          verified: e.verified,
          ambiguous: e.ambiguous,
          source: e.source,
          x: e.box ? Math.round(e.box.x) : null,
          y: e.box ? Math.round(e.box.y) : null,
          w: e.box ? Math.round(e.box.w) : null,
          h: e.box ? Math.round(e.box.h) : null,
          placement: e.placement,
          note: e.note,
        })),
      },
    },
  });
}
