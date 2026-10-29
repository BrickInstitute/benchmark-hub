/**
 * Loads a hand-authored criterion catalogue into the database.
 *
 * The catalogue is DATA, not code. For a sector worth hand-designing and
 * reviewing ahead of time, this is how it gets in. For a sector nobody has
 * ever seen before, the live analysis flow (cohort.ts) generates and
 * validates one on the spot instead - see catalogue-generation.ts. Both paths
 * end up going through the exact same persistence function so neither is
 * treated as more trustworthy than it actually is.
 *
 *   npx tsx scripts/seed-criteria.ts [data/criteria/<sector>.json]
 *
 * Defaults to data/criteria/banking.json when no path is given.
 */
import { readFile } from "node:fs/promises";
import type { MeasurementPattern, PageRole, RegionType } from "@prisma/client";
import { materializeSectorCatalogue } from "../src/lib/measurement/catalogue";

interface SectorJson {
  sectorSlug: string;
  sectorName: string;
  country: string;
  version: string;
  pageRole: PageRole;
  bindings: Record<string, string>;
  criteria: Array<{
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
    featureId?: string;
    requiredEvidence?: string[];
    exclusions?: string[];
    scopeRegions?: RegionType[];
  }>;
}

async function main() {
  const sectorFile = process.argv[2] ?? "data/criteria/banking.json";
  const sector: SectorJson = JSON.parse(await readFile(sectorFile, "utf8"));

  const result = await materializeSectorCatalogue(sector);

  console.log(`sector   : ${sector.sectorName} (${sector.sectorSlug})`);
  console.log(`package  : v${sector.version} (#${result.packageId})`);
  console.log(`superseded universal: ${result.supersededUniversal.join(", ") || "none"}`);
  console.log(
    `criteria : ${result.activeUniversalCount} universal + ${result.sectorCriterionCount} sector = ${
      result.activeUniversalCount + result.sectorCriterionCount
    }`,
  );
  console.log(`cohort   : ${sector.pageRole} / DESKTOP / ${sector.country} v1`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
