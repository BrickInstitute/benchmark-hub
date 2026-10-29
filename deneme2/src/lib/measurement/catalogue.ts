/**
 * Catalogue materialisation: turns catalogue DATA into database rows.
 *
 * There are two sources of that data, and they must go through the exact
 * same path so neither is treated as more trustworthy than it looks:
 *   - a hand-authored JSON file (data/criteria/*.json), loaded by
 *     scripts/seed-criteria.ts for a sector someone has sat down and designed
 *   - a model's live proposal for a sector nobody has ever analysed before
 *     (see catalogue-generation.ts), validated before it ever reaches here
 *
 * This module only persists. It does not judge whether a criterion is a good
 * one - that judgement either already happened (a human wrote the JSON) or
 * happens one layer up (catalogue-generation.ts's validation, mirroring the
 * same discipline used everywhere else: the model proposes, software checks).
 *
 * The universal layer (U01-U16) is imported as a static JSON module rather
 * than read from disk at runtime. A loose `readFile("data/criteria/...")`
 * would work when a script runs against the full checkout, but the
 * Dockerfile's runner stage only copies the Next.js standalone build output -
 * it does not copy data/ at all - so anything invoked from inside a live API
 * route (as catalogue-generation.ts is, from /api/cohort) would 500 in
 * production while working perfectly on a developer's machine. A static
 * import is traced and bundled by Next like any other module, so it has no
 * such gap.
 */
import universalJson from "../../../data/criteria/universal.json";
import {
  PrismaClient,
  type BetterDirection,
  type MeasurementPattern,
  type PageRole,
  type RegionType,
} from "@prisma/client";

const prisma = new PrismaClient();

export interface CriterionInput {
  code: string;
  pattern: MeasurementPattern;
  question: string;
  rule: string;
  naRule?: string | null;
  /// What this feature is and why it is worth comparing - shown to the end
  /// user next to the raw status.
  description?: string | null;
  /// Which end of `steps` is the better practice, if either is. Omit when
  /// there is no universal answer.
  betterDirection?: BetterDirection | null;
  steps: string[];
  bucketLimits?: Record<string, [number, number | null]>;
  parametric?: boolean;
  supersedesCode?: string | null;
  defaultRegion?: RegionType | null;
  featureId?: string | null;
  requiredEvidence?: string[];
  exclusions?: string[];
  scopeRegions?: RegionType[];
}

export interface SectorCatalogueInput {
  sectorSlug: string;
  sectorName: string;
  country: string;
  version: string;
  pageRole: PageRole;
  /** Universal criterion code -> this sector's target object, e.g. U14 -> "Program ücreti". */
  bindings: Record<string, string>;
  criteria: CriterionInput[];
}

const UNIVERSAL_CRITERIA = (universalJson as { criteria: CriterionInput[] }).criteria;
const UNIVERSAL_DICTIONARY_VERSION =
  (universalJson as { dictionaryVersion?: number }).dictionaryVersion ?? 1;

async function upsertCriterion(
  c: CriterionInput,
  sectorId: string | null,
  dictionaryVersion: number,
) {
  const data = {
    pattern: c.pattern,
    featureId: c.featureId ?? null,
    requiredEvidence: c.requiredEvidence ?? [],
    exclusions: c.exclusions ?? [],
    scopeRegions: c.scopeRegions ?? [],
    dictionaryVersion,
    question: c.question,
    rule: c.rule,
    naRule: c.naRule ?? null,
    description: c.description ?? null,
    betterDirection: c.betterDirection ?? null,
    steps: c.steps,
    bucketLimits: c.bucketLimits ?? undefined,
    parametric: c.parametric ?? false,
    supersedesCode: c.supersedesCode ?? null,
    defaultRegion: c.defaultRegion ?? null,
    layer: sectorId ? ("SECTOR" as const) : ("UNIVERSAL" as const),
    sectorId,
  };

  const existing = await prisma.criterion.findFirst({ where: { code: c.code, sectorId } });
  if (existing) return prisma.criterion.update({ where: { id: existing.id }, data });
  return prisma.criterion.create({ data: { code: c.code, ...data } });
}

export interface MaterializedCatalogue {
  sectorId: string;
  packageId: string;
  cohortId: string;
  activeUniversalCount: number;
  sectorCriterionCount: number;
  supersededUniversal: string[];
}

/**
 * Writes a full sector catalogue (universal layer + sector layer + package +
 * bindings + the DESKTOP/TR cohort it belongs to) to the database.
 *
 * Idempotent: running it again for the same sector+version updates rather
 * than duplicates, so a sector can be re-materialised (e.g. the model
 * proposes a slightly different catalogue next time) without orphaning rows.
 */
export async function materializeSectorCatalogue(
  input: SectorCatalogueInput,
): Promise<MaterializedCatalogue> {
  const sector = await prisma.sector.upsert({
    where: { slug: input.sectorSlug },
    update: { name: input.sectorName, country: input.country },
    create: { slug: input.sectorSlug, name: input.sectorName, country: input.country },
  });

  const universalIds = new Map<string, string>();
  for (const c of UNIVERSAL_CRITERIA) {
    const row = await upsertCriterion(c, null, UNIVERSAL_DICTIONARY_VERSION);
    universalIds.set(c.code, row.id);
  }

  const sectorIds = new Map<string, string>();
  for (const c of input.criteria) {
    const row = await upsertCriterion(c, sector.id, UNIVERSAL_DICTIONARY_VERSION);
    sectorIds.set(c.code, row.id);
  }

  // A sector criterion that supersedes a universal one measures the same
  // target object - including both would count the same fact twice and break
  // the distribution.
  const superseded = new Set(
    input.criteria.map((c) => c.supersedesCode).filter((x): x is string => Boolean(x)),
  );

  const pkg = await prisma.criteriaPackage.upsert({
    where: { sectorId_version: { sectorId: sector.id, version: input.version } },
    update: {},
    create: { sectorId: sector.id, version: input.version },
  });

  await prisma.packageCriterion.deleteMany({ where: { packageId: pkg.id } });

  let activeUniversal = 0;
  for (const [code, id] of universalIds) {
    if (superseded.has(code)) continue;
    await prisma.packageCriterion.create({ data: { packageId: pkg.id, criterionId: id } });
    activeUniversal++;
  }
  for (const id of sectorIds.values()) {
    await prisma.packageCriterion.create({ data: { packageId: pkg.id, criterionId: id } });
  }

  await prisma.criterionBinding.deleteMany({ where: { packageId: pkg.id } });
  for (const [code, target] of Object.entries(input.bindings)) {
    if (superseded.has(code)) continue;
    const id = universalIds.get(code);
    if (!id) continue;
    await prisma.criterionBinding.create({
      data: { packageId: pkg.id, criterionId: id, targetObject: target },
    });
  }

  const cohort = await prisma.cohort.upsert({
    where: {
      sectorId_pageRole_viewport_country_version: {
        sectorId: sector.id,
        pageRole: input.pageRole,
        viewport: "DESKTOP",
        country: input.country,
        version: "v1",
      },
    },
    update: { packageId: pkg.id },
    create: {
      sectorId: sector.id,
      pageRole: input.pageRole,
      viewport: "DESKTOP",
      country: input.country,
      version: "v1",
      packageId: pkg.id,
    },
  });

  return {
    sectorId: sector.id,
    packageId: pkg.id,
    cohortId: cohort.id,
    activeUniversalCount: activeUniversal,
    sectorCriterionCount: sectorIds.size,
    supersededUniversal: [...superseded],
  };
}

/** For prompts: the universal catalogue's own codes, so a model proposing
 * sector criteria knows what already exists and can supersede it correctly
 * instead of re-inventing (e.g. "price specificity" already exists as U14). */
export function universalCatalogueSummary(): Array<{
  code: string;
  question: string;
  parametric: boolean;
}> {
  return UNIVERSAL_CRITERIA.map((c) => ({
    code: c.code,
    question: c.question,
    parametric: Boolean(c.parametric),
  }));
}

export { prisma as cataloguePrisma };
