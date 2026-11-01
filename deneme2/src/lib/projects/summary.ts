/**
 * Project summary: what the study found across all its pages.
 *
 * Everything here is counting over stored, verified rows - no model involved.
 * The same reporting rules as the cohort layer apply:
 *   - prevalence and coverage are separate numbers and both are shown
 *   - below MIN_DENOMINATOR_FOR_PERCENT no percentage is produced
 *   - unverified elements never count
 *
 * One more rule specific to the descriptive layer: a module or theme that was
 * NOT found on a page is not proven absent. The model may have missed it.
 * So prevalence here reads "seen on at least N of M pages", never "missing on
 * the rest".
 */
import type { ObservationStatus } from "@prisma/client";
import { prisma } from "../db";
import { distribution, MIN_DENOMINATOR_FOR_PERCENT } from "../measurement/patterns";
import { HERO_VISUALS, MODULE_TYPES, VALUE_THEMES } from "./vocabulary";

export interface PrevalenceRow {
  key: string;
  label: string;
  description: string;
  /** Pages where at least one verified element of this category was found. */
  count: number;
  percent: number | null;
  institutions: string[];
  /** MODULE only: median 1-based position among the page's modules. */
  medianPosition: number | null;
  /** VALUE_PROP only: one verbatim example per institution. */
  examples: Array<{ institution: string; text: string }>;
}

export interface HeroRow {
  targetId: string;
  institution: string;
  url: string | null;
  benchmarkId: string;
  foldImage: string | null;
  headline: string | null;
  subheadline: string | null;
  ctas: string[];
  visual: string | null;
  visualLabel: string | null;
  firstScreenValueProps: Array<{ text: string; theme: string | null }>;
  modules: Array<{ type: string; label: string; title: string | null }>;
  unverifiedCount: number;
}

export interface CriterionRow {
  code: string;
  question: string;
  pattern: string;
  denominator: number;
  rows: Array<{ value: string; count: number; percent: number | null }>;
  excluded: { unknown: number; notApplicable: number };
}

export interface ProjectSummary {
  coverage: {
    included: number;
    analyzed: number;
    failed: number;
    pending: number;
    percent: number | null;
  };
  percentagesWithheld: boolean;
  minDenominator: number;
  modules: PrevalenceRow[];
  valueThemes: PrevalenceRow[];
  heroVisuals: Array<{ key: string; label: string; count: number }>;
  heroes: HeroRow[];
  criteria: CriterionRow[];
  health: { verifiedElements: number; unverifiedElements: number };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round(((s[mid - 1]! + s[mid]!) / 2) * 10) / 10;
}

export async function projectSummary(projectId: string): Promise<ProjectSummary> {
  const targets = await prisma.projectTarget.findMany({
    where: { projectId, included: true },
    orderBy: { order: "asc" },
    include: {
      benchmark: {
        select: {
          id: true,
          thumbnailPath: true,
          qualityPassed: true,
          pageAnalysis: { include: { elements: { orderBy: [{ kind: "asc" }, { order: "asc" }] } } },
        },
      },
    },
  });

  // Counted = the run finished, the capture passed the gate, and the
  // descriptive analysis actually ran. A capture-only run counts for criteria
  // but not for hero/modules/value props.
  const done = targets.filter((t) => t.runState === "DONE" && t.benchmark?.qualityPassed);
  const described = done.filter((t) => t.benchmark?.pageAnalysis?.status === "DONE");
  const n = described.length;
  const withhold = n < MIN_DENOMINATOR_FOR_PERCENT;
  const pct = (c: number, d: number) => (d >= MIN_DENOMINATOR_FOR_PERCENT ? Math.round((c / d) * 100) : null);

  // ---- Modules & value themes ----
  const moduleHits = new Map<string, { institutions: Set<string>; positions: number[] }>();
  const themeHits = new Map<string, { institutions: Set<string>; examples: Array<{ institution: string; text: string }> }>();
  const visualCount = new Map<string, number>();
  let verifiedElements = 0;
  let unverifiedElements = 0;

  const heroes: HeroRow[] = [];

  for (const t of described) {
    const pa = t.benchmark!.pageAnalysis!;
    const els = pa.elements;
    const ok = els.filter((e) => e.verified);
    verifiedElements += ok.length;
    unverifiedElements += els.length - ok.length;

    const modules = ok.filter((e) => e.kind === "MODULE").sort((a, b) => a.order - b.order);
    const seenModule = new Set<string>();
    modules.forEach((m, i) => {
      const k = m.category ?? "diger";
      if (seenModule.has(k)) return;
      seenModule.add(k);
      const hit = moduleHits.get(k) ?? { institutions: new Set(), positions: [] };
      hit.institutions.add(t.institution);
      hit.positions.push(i + 1);
      moduleHits.set(k, hit);
    });

    const props = ok.filter((e) => e.kind === "VALUE_PROP");
    for (const p of props) {
      const k = p.category ?? "diger";
      const hit = themeHits.get(k) ?? { institutions: new Set(), examples: [] };
      if (!hit.institutions.has(t.institution)) {
        hit.examples.push({ institution: t.institution, text: p.text });
      }
      hit.institutions.add(t.institution);
      themeHits.set(k, hit);
    }

    if (pa.heroVisual) visualCount.set(pa.heroVisual, (visualCount.get(pa.heroVisual) ?? 0) + 1);

    heroes.push({
      targetId: t.id,
      institution: t.institution,
      url: t.url,
      benchmarkId: t.benchmark!.id,
      foldImage: t.benchmark!.thumbnailPath,
      headline: ok.find((e) => e.kind === "HERO_HEADLINE")?.text ?? null,
      subheadline: ok.find((e) => e.kind === "HERO_SUBHEADLINE")?.text ?? null,
      ctas: ok.filter((e) => e.kind === "HERO_CTA").map((e) => e.text),
      visual: pa.heroVisual,
      visualLabel: pa.heroVisual ? (HERO_VISUALS as Record<string, { label: string }>)[pa.heroVisual]?.label ?? null : null,
      firstScreenValueProps: props
        .filter((p) => p.placement === "ilk_ekran")
        .map((p) => ({ text: p.text, theme: p.category })),
      modules: modules.map((m) => ({
        type: m.category ?? "diger",
        label: (MODULE_TYPES as Record<string, { label: string }>)[m.category ?? "diger"]?.label ?? m.category ?? "",
        title: m.title,
      })),
      unverifiedCount: els.length - ok.length,
    });
  }

  const moduleRows: PrevalenceRow[] = Object.entries(MODULE_TYPES)
    .map(([key, v]) => {
      const hit = moduleHits.get(key);
      const count = hit?.institutions.size ?? 0;
      return {
        key,
        label: v.label,
        description: v.description,
        count,
        percent: pct(count, n),
        institutions: hit ? [...hit.institutions] : [],
        medianPosition: hit ? median(hit.positions) : null,
        examples: [],
      };
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count || (a.medianPosition ?? 99) - (b.medianPosition ?? 99));

  const themeRows: PrevalenceRow[] = Object.entries(VALUE_THEMES)
    .map(([key, v]) => {
      const hit = themeHits.get(key);
      const count = hit?.institutions.size ?? 0;
      return {
        key,
        label: v.label,
        description: v.description,
        count,
        percent: pct(count, n),
        institutions: hit ? [...hit.institutions] : [],
        medianPosition: null,
        examples: hit?.examples ?? [],
      };
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  // ---- Criteria (closed questions from the sector catalogue) ----
  const benchmarkIds = done.map((t) => t.benchmark!.id);
  const observations = benchmarkIds.length
    ? await prisma.observation.findMany({
        where: { benchmarkId: { in: benchmarkIds } },
        select: {
          value: true,
          status: true,
          awaitingConfirmation: true,
          criterion: { select: { code: true, question: true, pattern: true } },
        },
      })
    : [];
  const byCode = new Map<string, { question: string; pattern: string; rows: Array<{ value: string | null; status: ObservationStatus }> }>();
  for (const o of observations) {
    if (o.awaitingConfirmation) continue; // not published, so not counted
    const e = byCode.get(o.criterion.code) ?? { question: o.criterion.question, pattern: o.criterion.pattern, rows: [] };
    e.rows.push({ value: o.value, status: o.status });
    byCode.set(o.criterion.code, e);
  }
  const criteria: CriterionRow[] = [...byCode.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, e]) => ({ code, question: e.question, pattern: e.pattern, ...distribution(e.rows) }));

  const failed = targets.filter((t) => t.runState === "FAILED").length;
  return {
    coverage: {
      included: targets.length,
      analyzed: n,
      failed,
      pending: targets.length - done.length - failed,
      percent: targets.length ? Math.round((n / targets.length) * 100) : null,
    },
    percentagesWithheld: withhold,
    minDenominator: MIN_DENOMINATOR_FOR_PERCENT,
    modules: moduleRows,
    valueThemes: themeRows,
    heroVisuals: [...visualCount.entries()]
      .map(([key, count]) => ({
        key,
        label: (HERO_VISUALS as Record<string, { label: string }>)[key]?.label ?? key,
        count,
      }))
      .sort((a, b) => b.count - a.count),
    heroes,
    criteria,
    health: { verifiedElements, unverifiedElements },
  };
}
