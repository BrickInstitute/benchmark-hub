/**
 * Loads the criterion catalogue into the database.
 *
 * The catalogue is DATA, not code. Adding a sector means writing a JSON file
 * with ~15 rows and running this - no TypeScript changes.
 *
 *   npx tsx scripts/seed-criteria.ts
 */
import { readFile } from "node:fs/promises";
import { PrismaClient, type MeasurementPattern, type RegionType } from "@prisma/client";

const prisma = new PrismaClient();

interface CriterionJson {
  code: string;
  pattern: MeasurementPattern;
  question: string;
  rule: string;
  naRule?: string;
  steps: string[];
  bucketLimits?: Record<string, [number, number | null]>;
  parametric?: boolean;
  supersedesCode?: string;
  defaultRegion?: RegionType;
}

interface UniversalJson {
  version: string;
  criteria: CriterionJson[];
}

interface SectorJson {
  sectorSlug: string;
  sectorName: string;
  country: string;
  version: string;
  pageRole: "ENTRY" | "LISTING" | "DECISION" | "CONVERSION" | "TRUST";
  bindings: Record<string, string>;
  criteria: CriterionJson[];
}

async function upsertCriterion(c: CriterionJson, sectorId: string | null) {
  const data = {
    pattern: c.pattern,
    question: c.question,
    rule: c.rule,
    naRule: c.naRule ?? null,
    steps: c.steps,
    bucketLimits: c.bucketLimits ?? undefined,
    parametric: c.parametric ?? false,
    supersedesCode: c.supersedesCode ?? null,
    defaultRegion: c.defaultRegion ?? null,
    layer: sectorId ? ("SECTOR" as const) : ("UNIVERSAL" as const),
    sectorId,
  };

  const existing = await prisma.criterion.findFirst({
    where: { code: c.code, sectorId },
  });
  if (existing) {
    return prisma.criterion.update({ where: { id: existing.id }, data });
  }
  return prisma.criterion.create({ data: { code: c.code, ...data } });
}

async function main() {
  const universal: UniversalJson = JSON.parse(
    await readFile("data/criteria/universal.json", "utf8"),
  );
  const sector: SectorJson = JSON.parse(
    await readFile("data/criteria/banking.json", "utf8"),
  );

  const s = await prisma.sector.upsert({
    where: { slug: sector.sectorSlug },
    update: { name: sector.sectorName, country: sector.country },
    create: {
      slug: sector.sectorSlug,
      name: sector.sectorName,
      country: sector.country,
    },
  });

  const universalIds = new Map<string, string>();
  for (const c of universal.criteria) {
    const row = await upsertCriterion(c, null);
    universalIds.set(c.code, row.id);
  }

  const sectorIds = new Map<string, string>();
  for (const c of sector.criteria) {
    const row = await upsertCriterion(c, s.id);
    sectorIds.set(c.code, row.id);
  }

  // A superseded universal criterion is left out of the package entirely.
  const superseded = new Set(
    sector.criteria.map((c) => c.supersedesCode).filter((x): x is string => Boolean(x)),
  );

  const pkg = await prisma.criteriaPackage.upsert({
    where: { sectorId_version: { sectorId: s.id, version: sector.version } },
    update: {},
    create: { sectorId: s.id, version: sector.version },
  });

  await prisma.packageCriterion.deleteMany({ where: { packageId: pkg.id } });

  let activeUniversal = 0;
  for (const [code, id] of universalIds) {
    if (superseded.has(code)) continue;
    await prisma.packageCriterion.create({
      data: { packageId: pkg.id, criterionId: id },
    });
    activeUniversal++;
  }
  for (const id of sectorIds.values()) {
    await prisma.packageCriterion.create({
      data: { packageId: pkg.id, criterionId: id },
    });
  }

  // Parametric bindings only for universal criteria that survived.
  await prisma.criterionBinding.deleteMany({ where: { packageId: pkg.id } });
  for (const [code, target] of Object.entries(sector.bindings)) {
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
        sectorId: s.id,
        pageRole: sector.pageRole,
        viewport: "DESKTOP",
        country: sector.country,
        version: "v1",
      },
    },
    update: { packageId: pkg.id },
    create: {
      sectorId: s.id,
      pageRole: sector.pageRole,
      viewport: "DESKTOP",
      country: sector.country,
      version: "v1",
      packageId: pkg.id,
    },
  });

  console.log(`sector   : ${s.name} (${s.slug})`);
  console.log(`package  : v${pkg.version} [${pkg.state}]`);
  console.log(`superseded universal: ${[...superseded].join(", ") || "none"}`);
  console.log(`criteria : ${activeUniversal} universal + ${sectorIds.size} sector = ${activeUniversal + sectorIds.size}`);
  console.log(`cohort   : ${cohort.pageRole} / ${cohort.viewport} / ${cohort.country} v${cohort.version}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
