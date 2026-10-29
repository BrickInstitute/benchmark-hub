/**
 * On-demand sector catalogue generation.
 *
 * The whole premise of this product is that a user drops in ONE url from
 * ANY sector - a bank, a hospital, an underwear brand, a hardware chain -
 * and gets back a detailed, evidence-bound comparison against real peers,
 * right then. That rules out hand-authoring a catalogue per sector ahead of
 * time: the set of sectors is not a fixed list, it is "whatever the next
 * person throws at it".
 *
 * So the catalogue itself has to be produced live, the first time a sector is
 * ever seen - and the same discipline that governs every other model call in
 * this codebase applies here too: THE MODEL PROPOSES, THE SOFTWARE DECIDES.
 * Concretely:
 *
 *   - The model never chooses a criterion's measurement vocabulary (its
 *     `steps`). Every criterion of a given pattern already uses one fixed
 *     ladder (P3 is always rakam/aralik/kosullu/yonlendirme/yok, P4 is always
 *     gomulu/ayri_sayfa/statik/yok, ...) across every hand-authored catalogue
 *     in this project - the pattern alone determines the vocabulary. Letting
 *     a model invent new wording per sector would make every sector
 *     incomparable with the next and silently fork the whole scheme.
 *   - The model never proposes P5 (depth) or P6 (density): both are
 *     software-computed everywhere else in this codebase (patterns.ts,
 *     evaluator.ts) and a model guess at either would be exactly the kind of
 *     unverifiable number this product exists to avoid.
 *   - Everything the model DOES propose - pattern, question, rule, evidence
 *     requirements, exclusions, which regions it may draw evidence from, a
 *     stable feature id, and whether it supersedes a universal criterion - is
 *     validated below. Anything malformed is DISCARDED, never silently
 *     coerced into something plausible-looking.
 *   - A sector whose generated catalogue is too thin to say anything (fewer
 *     than MIN_SECTOR_CRITERIA survive validation) is refused outright rather
 *     than quietly shipped as a weak analysis.
 *
 * A generated catalogue is not the same thing as a reviewed one. It has not
 * been through the inter-rater agreement protocol (docs/olcum-yontemi.md)
 * that is supposed to gate anything claiming to measure reliably. It is
 * created in PublishState.DRAFT and stays there; nothing in this file
 * promotes a package to PUBLISHED. That is a deliberate, visible gap, not an
 * oversight - until enough real runs accumulate for a given sector, its
 * numbers should be read as a first pass, not a settled finding.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { MeasurementPattern, PageRole, RegionType } from "@prisma/client";
import { materializeSectorCatalogue, universalCatalogueSummary } from "./catalogue";
import { PATTERN_STEPS } from "./pattern-steps";
import type { TargetIdentity } from "./peer-discovery";

const MODEL = process.env.AI_MODEL || "claude-sonnet-5";

/** P6 is reserved for universal density counting (menu items, CTAs, form
 * fields, ...) which is already sector-agnostic - a model is not asked for it. */
const ALLOWED_PATTERNS: MeasurementPattern[] = ["P1", "P2", "P3", "P4", "P5", "P7"];

const VALID_REGIONS: RegionType[] = [
  "MENU", "HERO", "CONTENT", "CARD_LIST", "CALCULATOR", "FORM", "TRUST", "FOOTER", "COOKIE",
];
const VALID_PAGE_ROLES: PageRole[] = ["ENTRY", "LISTING", "DECISION", "CONVERSION", "TRUST"];

/** Below this many *validated* criteria, the catalogue is too thin to publish. */
const MIN_SECTOR_CRITERIA = 5;
const MAX_SECTOR_CRITERIA = 14;

interface RawProposedCriterion {
  code?: string;
  pattern?: string;
  question?: string;
  rule?: string;
  naRule?: string;
  description?: string;
  bestStep?: string;
  requiredEvidence?: string[];
  exclusions?: string[];
  scopeRegions?: string[];
  defaultRegion?: string;
  featureId?: string;
  supersedesUniversalCode?: string;
}

interface RawProposal {
  conversionTarget: string;
  bindings: Record<string, string>;
  criteria: RawProposedCriterion[];
}

export interface RejectedCriterion {
  code: string | undefined;
  reason: string;
}

export interface GeneratedCatalogueResult {
  packageId: string;
  cohortId: string;
  sectorId: string;
  criteriaCount: number;
  activeUniversalCount: number;
  rejected: RejectedCriterion[];
}

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Turns the model's raw proposal into validated criterion rows. A rejected
 * entry is dropped and recorded with a reason - never silently fixed up,
 * because a "fixed" criterion is one nobody actually reviewed.
 */
function validateCriteria(
  raw: RawProposedCriterion[],
  sectorSlug: string,
): { accepted: Array<Parameters<typeof materializeSectorCatalogue>[0]["criteria"][number]>; rejected: RejectedCriterion[] } {
  const accepted: Array<Parameters<typeof materializeSectorCatalogue>[0]["criteria"][number]> = [];
  const rejected: RejectedCriterion[] = [];
  const seenCodes = new Set<string>();
  const seenFeatureIds = new Set<string>();

  const prefix = sectorSlug
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 3) || "SEC";
  let counter = 1;

  for (const c of raw.slice(0, MAX_SECTOR_CRITERIA * 2)) {
    // The model is free to suggest a code, but the one actually used is
    // always software-assigned and guaranteed unique - a collision here would
    // silently merge two unrelated criteria into one row (upsert matches on
    // code+sectorId), which is far worse than renumbering.
    const code = `${prefix}${String(counter).padStart(2, "0")}`;

    if (!isNonEmptyString(c.question) || !isNonEmptyString(c.rule) || !isNonEmptyString(c.description)) {
      rejected.push({ code: c.code, reason: "question, rule veya description eksik" });
      continue;
    }
    const pattern = (c.pattern ?? "").toUpperCase() as MeasurementPattern;
    if (!ALLOWED_PATTERNS.includes(pattern)) {
      rejected.push({ code: c.code, reason: `geçersiz veya yasaklı kalıp: ${c.pattern}` });
      continue;
    }
    const steps = PATTERN_STEPS[pattern];
    if (!steps) {
      rejected.push({ code: c.code, reason: `${pattern} için basamak tanımı yok` });
      continue;
    }
    const featureId = isNonEmptyString(c.featureId)
      ? c.featureId.trim().toLowerCase().replace(/\s+/g, "_")
      : null;
    if (featureId && seenFeatureIds.has(featureId)) {
      rejected.push({ code: c.code, reason: `tekrarlanan featureId: ${featureId}` });
      continue;
    }

    const defaultRegion = (c.defaultRegion ?? "").toUpperCase();
    const scopeRegions = (c.scopeRegions ?? [])
      .map((r) => r.toUpperCase())
      .filter((r): r is RegionType => VALID_REGIONS.includes(r as RegionType));
    // Direction is derived from a concrete value the model named, never
    // trusted as an abstract ASC/DESC claim - see pattern-steps.ts header and
    // scripts/backfill-descriptions.ts for why that was tried and backfired.
    const bestStep = c.bestStep?.trim();
    const betterDirection: "ASC" | "DESC" | null =
      bestStep === steps[0] ? "DESC" : bestStep === steps[steps.length - 1] ? "ASC" : null;

    accepted.push({
      code,
      pattern,
      question: c.question.trim(),
      rule: c.rule.trim(),
      naRule: isNonEmptyString(c.naRule) ? c.naRule.trim() : null,
      description: c.description.trim(),
      betterDirection,
      steps,
      supersedesCode: isNonEmptyString(c.supersedesUniversalCode)
        ? c.supersedesUniversalCode.trim().toUpperCase()
        : null,
      defaultRegion: VALID_REGIONS.includes(defaultRegion as RegionType)
        ? (defaultRegion as RegionType)
        : null,
      featureId,
      requiredEvidence: (c.requiredEvidence ?? []).filter(isNonEmptyString).slice(0, 5),
      exclusions: (c.exclusions ?? []).filter(isNonEmptyString).slice(0, 5),
      scopeRegions,
    });
    seenCodes.add(code);
    if (featureId) seenFeatureIds.add(featureId);
    counter++;
    if (accepted.length >= MAX_SECTOR_CRITERIA) break;
  }

  return { accepted, rejected };
}

/**
 * Generates and persists a criteria package for a sector that has never been
 * analysed before. Throws if the model's proposal cannot be turned into a
 * usable catalogue - a thin, mostly-rejected catalogue would produce a report
 * that looks detailed but is not, and this product does not ship that.
 */
export async function generateSectorCatalogue(
  identity: TargetIdentity,
): Promise<GeneratedCatalogueResult> {
  const universal = universalCatalogueSummary();
  const universalList = universal
    .map((u) => `${u.code}${u.parametric ? " (parametrik)" : ""}: ${u.question}`)
    .join("\n");

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [
      {
        name: "report_sector_catalogue",
        description: "Bu sektör için karşılaştırma ölçütlerini bildir.",
        input_schema: {
          type: "object",
          properties: {
            conversionTarget: {
              type: "string",
              description: "Bu sayfa türünde kullanıcının ulaşması istenen asıl eylem (ör. 'sepete ekleme', 'randevu formu')",
            },
            bindings: {
              type: "object",
              description:
                "Zaten var olan parametrik evrensel ölçütlerin (işaretli olanlar) bu sektördeki hedef nesnesi. Anahtar ölçüt kodu, değer hedef nesne açıklaması.",
              additionalProperties: { type: "string" },
            },
            criteria: {
              type: "array",
              description: `6-12 sektöre özgü karşılaştırma ölçütü. Her biri şu kalıplardan birini kullanmalı: P1 (var/yok), P2 (konum), P3 (somutluk), P4 (etkileşim düzeyi), P5 (derinlik), P7 (güven sinyali). P6 kullanma.`,
              items: {
                type: "object",
                properties: {
                  code: { type: "string", description: "Geçici kod önerisi, yazılım yeniden atayacak" },
                  pattern: { type: "string", enum: ["P1", "P2", "P3", "P4", "P5", "P7"] },
                  question: { type: "string", description: "Tek cümlelik soru, ör. 'Kargo ücreti ne kadar somut gösteriliyor?'" },
                  rule: { type: "string", description: "Basamakların nasıl ayırt edileceğine dair değerlendirme kuralı" },
                  naRule: { type: "string", description: "Bu ölçütün geçerli olmadığı durum, varsa" },
                  description: {
                    type: "string",
                    description:
                      "Son kullanıcıya gösterilecek 2-3 cümlelik açıklama: bu özellik nedir, kullanıcı/müşteri için neden önemlidir. 'Var' tek başına hiçbir şey anlatmaz - bunu okuyan biri özelliği hiç bilmeden anlamalı.",
                  },
                  bestStep: {
                    type: "string",
                    description:
                      "Eğer bu ölçütün kullandığı kalıbın basamaklarından biri GERÇEKTEN evrensel olarak en iyi uygulamaysa (yukarıdaki basamak listelerinden), o basamağın TAM metnini buraya yaz (listeden birebir kopyala, ör. 'var' veya '0'). Hangisinin daha iyi olduğu bağlama göre değişiyorsa (çoğu P2 konum ölçütü gibi - bir CTA'nın ilk ekranda olması iyi ama bir çerez bildiriminin olması gerekmeyebilir) bu alanı BOŞ bırak. Basamağın dizideki konumuna göre TAHMİN etme, yalnızca değerin kendisini yaz - yön yazılım tarafından hesaplanacak.",
                  },
                  requiredEvidence: { type: "array", items: { type: "string" }, description: "Sayılması için sayfada görünmesi gereken şeyler" },
                  exclusions: { type: "array", items: { type: "string" }, description: "Sayılmayacak olanlar" },
                  defaultRegion: { type: "string", enum: VALID_REGIONS, description: "Bu ölçütün genelde bulunduğu bölüm türü" },
                  scopeRegions: { type: "array", items: { type: "string", enum: VALID_REGIONS }, description: "Kanıtın alınabileceği bölüm türleri" },
                  featureId: { type: "string", description: "Kalıcı işlev kimliği, ör. 'shipping_cost.specificity'" },
                  supersedesUniversalCode: {
                    type: "string",
                    description: "Eğer bu ölçüt parametrik bir evrensel ölçütle (U06/U09/U14/U15) AYNI hedefi ölçüyorsa o kodu yaz, aksi halde boş bırak",
                  },
                },
                required: ["pattern", "question", "rule", "description"],
              },
            },
          },
          required: ["conversionTarget", "bindings", "criteria"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "report_sector_catalogue" },
    messages: [
      {
        role: "user",
        content: `"${identity.institution}" kurumu için bir karşılaştırma ölçütü kataloğu tasarla.

Sektör: ${identity.sectorName} (${identity.sectorSlug}), ülke ${identity.country}
Sayfa konusu: "${identity.pageTopic}"
Sayfa rolü: ${identity.pageRole}

Bu, bu sektörde İLK KEZ oluşturulan bir katalog. Amaç, bu sayfa türünü aynı
sektördeki muadilleriyle kanıta dayalı karşılaştırmak.

Zaten var olan EVRENSEL ölçütler (bunları tekrar önerme, yalnızca "parametrik"
olanlardan hedefi bu sektöre bağlayabilirsin):
${universalList}

Kullanacağın her kalıbın basamakları SIRAYLA (yazılım tarafından sabit,
sen değiştiremezsin):
${Object.entries(PATTERN_STEPS)
  .map(([p, steps]) => `${p}: [${steps!.join(", ")}]`)
  .join("\n")}

Kurallar:
- Yalnızca bu sektöre ÖZGÜ, evrensel listede karşılığı olmayan ölçütler öner.
- "steps"/basamak önerme; bunu yazılım kalıba göre otomatik atıyor.
- P6 kullanma; sayım ölçütleri zaten evrensel katmanda var.
- Her ölçüt somut ve kanıtla doğrulanabilir olmalı: "requiredEvidence" alanına
  sayfada GÖRÜLEBİLECEK bir şey yaz, soyut bir kavram değil.
- Emin olmadığın bir ölçütü eklemektense eklemmemeyi tercih et; az ama
  doğrulanabilir ölçüt, çok ama belirsiz ölçütten iyidir.
- Her ölçüt için "description" yaz: son kullanıcı bu özelliği hiç bilmiyor
  olabilir, "Var" tek kelimesi onun için hiçbir şey ifade etmez.
- "bestStep"i yalnızca gerçekten evrensel bir doğru cevap varsa doldur, aksi
  halde boş bırak - yanlış bir "daha iyi" yönü, kullanıcıyı yanlış yönlendirir.`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("model sektör kataloğu önerisi döndürmedi");
  }
  const raw = block.input as RawProposal;

  const { accepted, rejected } = validateCriteria(raw.criteria ?? [], identity.sectorSlug);

  if (accepted.length < MIN_SECTOR_CRITERIA) {
    throw new Error(
      `sektör kataloğu oluşturulamadı: ${accepted.length} ölçüt doğrulamadan geçti, ` +
        `en az ${MIN_SECTOR_CRITERIA} gerekiyor (reddedilen: ${rejected.map((r) => r.reason).join("; ")})`,
    );
  }

  // Bindings: only for parametric universal codes that actually exist and
  // were not superseded by one of the newly accepted criteria.
  const parametricCodes = new Set(universal.filter((u) => u.parametric).map((u) => u.code));
  const superseded = new Set(accepted.map((c) => c.supersedesCode).filter(Boolean) as string[]);
  const bindings: Record<string, string> = {};
  for (const [code, target] of Object.entries(raw.bindings ?? {})) {
    const upper = code.toUpperCase();
    if (parametricCodes.has(upper) && !superseded.has(upper) && isNonEmptyString(target)) {
      bindings[upper] = target;
    }
  }

  const materialized = await materializeSectorCatalogue({
    sectorSlug: identity.sectorSlug,
    sectorName: identity.sectorName,
    country: identity.country,
    version: "1",
    pageRole: identity.pageRole,
    bindings,
    criteria: accepted,
  });

  return {
    packageId: materialized.packageId,
    cohortId: materialized.cohortId,
    sectorId: materialized.sectorId,
    criteriaCount: materialized.activeUniversalCount + materialized.sectorCriterionCount,
    activeUniversalCount: materialized.activeUniversalCount,
    rejected,
  };
}
