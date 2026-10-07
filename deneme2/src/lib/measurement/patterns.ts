/**
 * Pattern maths and status derivation.
 *
 * None of this is done by a model. Placement, depth, counts, status,
 * denominators and distributions are all deterministic software decisions.
 */
import type { ObservationStatus, MeasurementPattern } from "@prisma/client";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Placement = "ilk_ekran" | "ilk_kaydirma" | "sayfa_alti" | "yok";

/** P2 - placement derived from the box's y against the viewport height. */
export function placement(box: Box | null, viewportHeight: number): Placement {
  if (!box) return "yok";
  if (box.y < viewportHeight) return "ilk_ekran";
  if (box.y < viewportHeight * 2) return "ilk_kaydirma";
  return "sayfa_alti";
}

export type Bucket = "az" | "orta" | "cok";
export type BucketLimits = Record<Bucket, [number, number | null]>;

/** P6 - a raw count dropped into a bucket. The raw count is kept as well. */
export function bucket(count: number, limits: BucketLimits): Bucket {
  for (const name of ["az", "orta", "cok"] as const) {
    const range = limits[name];
    if (!range) continue;
    const [low, high] = range;
    if (count >= low && (high === null || count <= high)) return name;
  }
  return "cok";
}

/** P5 - click count to the conversion target. */
export function depthStep(clicks: number | null): string {
  if (clicks === null) return "ulasilamadi";
  if (clicks <= 0) return "0";
  if (clicks === 1) return "1";
  if (clicks === 2) return "2";
  return "3_arti";
}

const ABSENT_VALUES = new Set(["yok"]);
const UNKNOWN_VALUES = new Set(["ulasilamadi"]);

/** Patterns whose claim rests on page content, so ABSENT needs confirmation. */
const CONTENT_PATTERNS: MeasurementPattern[] = ["P1", "P2", "P3", "P4", "P7"];

export interface StatusInput {
  value: string | string[] | null;
  notApplicable: boolean;
  qualityPassed: boolean;
  evidenceVerified: boolean;
  /** Counting and computed patterns (P5, P6) need no evidence text. */
  evidenceRequired: boolean;
  repeatsAgreed: boolean;
}

/**
 * Order matters and must not be rearranged: a crawl failure never produces
 * ABSENT. That rule is the whole reason the four-state model exists.
 */
export function deriveStatus(i: StatusInput): ObservationStatus {
  if (i.notApplicable) return "NOT_APPLICABLE";
  if (!i.qualityPassed) return "UNKNOWN";
  if (!i.repeatsAgreed) return "UNKNOWN";

  if (typeof i.value === "string" && UNKNOWN_VALUES.has(i.value)) return "UNKNOWN";

  const empty =
    i.value === null ||
    (Array.isArray(i.value) && i.value.length === 0) ||
    (typeof i.value === "string" && ABSENT_VALUES.has(i.value));

  if (empty) return "ABSENT";
  if (i.evidenceRequired && !i.evidenceVerified) return "UNKNOWN";
  return "PRESENT";
}

export function evidenceRequired(pattern: MeasurementPattern): boolean {
  return pattern === "P1" || pattern === "P3" || pattern === "P4" || pattern === "P7";
}

/**
 * PRESENT can be proven by pointing at something. ABSENT is a claim about the
 * entire page and the DOM cannot prove it - a phone number rendered inside an
 * image simply is not in the DOM. So a deterministic ABSENT on a content
 * pattern is held back until the model confirms it on the screenshot.
 */
export function needsAbsenceConfirmation(
  status: ObservationStatus,
  pattern: MeasurementPattern,
): boolean {
  return status === "ABSENT" && CONTENT_PATTERNS.includes(pattern);
}

export interface DistributionRow {
  value: string;
  count: number;
  /** Null when the denominator is too small to express as a percentage. */
  percent: number | null;
}

/** Below this denominator a percentage is misleading, so it is not shown. */
export const MIN_DENOMINATOR_FOR_PERCENT = 8;

/**
 * Only PRESENT and ABSENT enter the denominator. UNKNOWN and NOT_APPLICABLE are
 * carried separately and shown, never hidden.
 */
export function distribution(
  observations: Array<{ value: string | null; status: ObservationStatus }>,
): {
  denominator: number;
  rows: DistributionRow[];
  excluded: { unknown: number; notApplicable: number };
} {
  const counted = observations.filter(
    (o) => o.status === "PRESENT" || o.status === "ABSENT",
  );
  const denominator = counted.length;
  const showPercent = denominator >= MIN_DENOMINATOR_FOR_PERCENT;

  const tally = new Map<string, number>();
  for (const o of counted) {
    const key = o.status === "ABSENT" ? "yok" : (o.value ?? "yok");
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }

  const rows = [...tally.entries()]
    .map(([value, count]) => ({
      value,
      count,
      percent: showPercent ? Math.round((count / denominator) * 100) : null,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    denominator,
    rows,
    excluded: {
      unknown: observations.filter((o) => o.status === "UNKNOWN").length,
      notApplicable: observations.filter((o) => o.status === "NOT_APPLICABLE").length,
    },
  };
}

/**
 * Whether two captures of the same page differ meaningfully.
 *
 * An image hash cannot answer this: carousels and animations change pixels on
 * every load, so the same page yields three different hashes in three
 * consecutive captures. A text fingerprint is barely better - a single changed
 * character flips it. So the decision is a threshold on set similarity.
 */
export function contentSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a.map((s) => s.trim().toLowerCase()).filter(Boolean));
  const setB = new Set(b.map((s) => s.trim().toLowerCase()).filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;
  let shared = 0;
  for (const x of setA) if (setB.has(x)) shared++;
  const union = setA.size + setB.size - shared;
  return union === 0 ? 1 : shared / union;
}

/** Below this similarity the page is treated as changed and re-analysed. */
export const REANALYSIS_THRESHOLD = 0.98;
