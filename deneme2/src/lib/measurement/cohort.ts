/**
 * Builds a comparison cohort from a single starting company.
 *
 * Flow: analyse the target -> work out what it is -> name comparable
 * institutions -> for each, find the page that plays the same role -> put it
 * through the same acceptance gate -> analyse it -> compute distributions.
 *
 * The acceptance gate is the whole point. An irrelevant or broken page that
 * slips into the cohort does not just add noise: it enters the denominator and
 * makes every percentage wrong. So a candidate is accepted only when
 *   - its homepage loads
 *   - an equivalent page is found among its REAL links
 *   - that page passes the capture quality gate
 *   - its content actually relates to the target topic
 * and every rejection is recorded with a reason instead of disappearing.
 */
import { PrismaClient, type ObservationStatus, type PageRole } from "@prisma/client";
import { analyze } from "./analyze";
import { capturePage } from "./capture";
import {
  absoluteUrl,
  homepageUrl,
  identifyTarget,
  proposePeers,
  resolveEquivalentPage,
  type TargetIdentity,
} from "./peer-discovery";
import { distribution, MIN_DENOMINATOR_FOR_PERCENT } from "./patterns";

const prisma = new PrismaClient();

export interface PeerOutcome {
  institution: string;
  domain: string;
  equivalentUrl: string | null;
  accepted: boolean;
  reason: string;
  benchmarkId?: string;
}

export interface CriterionDistribution {
  code: string;
  question: string;
  pattern: string;
  denominator: number;
  rows: Array<{ value: string; count: number; percent: number | null }>;
  excluded: { unknown: number; notApplicable: number };
  targetValue: string | null;
  targetStatus: ObservationStatus | null;
}

export interface CohortRunResult {
  identity: TargetIdentity | null;
  targetBenchmarkId: string;
  cohortId: string | null;
  peers: PeerOutcome[];
  distributions: CriterionDistribution[];
  percentagesWithheld: boolean;
}

/** Cheap page-type check: does the peer page actually talk about the topic? */
function topicMatches(topic: string, text: string): boolean {
  const fold = (s: string) =>
    s.replace(/[İIı]/g, "i").toLowerCase().replace(/̇/g, "");
  const tokens = fold(topic)
    .split(/[^a-z0-9çğöşü]+/)
    .filter((t) => t.length >= 4);
  if (tokens.length === 0) return true;
  const haystack = fold(text);
  return tokens.some((t) => haystack.includes(t));
}

export async function buildPeerCohort(options: {
  url: string;
  viewport?: "DESKTOP" | "MOBILE";
  peerCount?: number;
  sectorSlug?: string;
}): Promise<CohortRunResult> {
  const viewport = options.viewport ?? "DESKTOP";
  const peerCount = options.peerCount ?? 5;

  // ---- 1. Target ----
  const probe = await capturePage({ url: options.url, viewport });
  if (!probe.snapshot) {
    throw new Error(`target capture failed: ${probe.status} ${probe.error ?? ""}`);
  }
  const identity = await identifyTarget(probe.snapshot);
  if (!identity) throw new Error("could not identify the target page");

  const sectorSlug = options.sectorSlug ?? identity.sectorSlug;
  const sector = await prisma.sector.upsert({
    where: { slug: sectorSlug },
    update: {},
    create: { slug: sectorSlug, name: identity.sectorName, country: identity.country },
  });

  // A sector with no criteria package cannot be measured at all.
  const pkg = await prisma.criteriaPackage.findFirst({
    where: { sectorId: sector.id },
    orderBy: { createdAt: "desc" },
  });
  if (!pkg) {
    throw new Error(
      `no criteria package for sector "${sectorSlug}" - the catalogue has to be authored before this sector can be measured`,
    );
  }

  const targetRun = await analyze({
    url: options.url,
    viewport,
    institution: identity.institution,
    sectorSlug,
  });

  // ---- 2. Peers ----
  const candidates = await proposePeers(identity, peerCount);
  const outcomes: PeerOutcome[] = [];
  const acceptedBenchmarks: Array<{ institution: string; benchmarkId: string }> = [];

  for (const candidate of candidates) {
    const home = homepageUrl(candidate.domain);
    const base: PeerOutcome = {
      institution: candidate.institution,
      domain: candidate.domain,
      equivalentUrl: null,
      accepted: false,
      reason: "",
    };

    const homeCapture = await capturePage({ url: home, viewport });
    if (!homeCapture.snapshot || homeCapture.status !== "SUCCESS") {
      outcomes.push({ ...base, reason: `homepage not reachable (${homeCapture.status})` });
      continue;
    }

    const link = await resolveEquivalentPage(homeCapture.snapshot, identity);
    if (!link) {
      outcomes.push({ ...base, reason: "no equivalent page found among real links" });
      continue;
    }

    const equivalentUrl = absoluteUrl(link.href, homeCapture.finalUrl ?? home);
    if (!equivalentUrl) {
      outcomes.push({ ...base, reason: "equivalent link could not be resolved" });
      continue;
    }
    base.equivalentUrl = equivalentUrl;

    const peerProbe = await capturePage({ url: equivalentUrl, viewport });
    if (!peerProbe.snapshot || peerProbe.quality?.passed !== true) {
      const failed = peerProbe.quality
        ? Object.entries(peerProbe.quality.checks)
            .filter(([, c]) => !c.passed)
            .map(([n]) => n)
            .join(", ")
        : peerProbe.status;
      outcomes.push({ ...base, reason: `quality gate failed (${failed})` });
      continue;
    }

    if (!topicMatches(identity.pageTopic, peerProbe.snapshot.visibleText)) {
      outcomes.push({
        ...base,
        reason: `page does not relate to "${identity.pageTopic}"`,
      });
      continue;
    }

    const run = await analyze({
      url: equivalentUrl,
      viewport,
      institution: candidate.institution,
      sectorSlug,
    });

    outcomes.push({
      ...base,
      accepted: true,
      reason: "accepted",
      benchmarkId: run.benchmarkId,
    });
    acceptedBenchmarks.push({
      institution: candidate.institution,
      benchmarkId: run.benchmarkId,
    });
  }

  // ---- 3. Cohort ----
  const cohort = await prisma.cohort.upsert({
    where: {
      sectorId_pageRole_viewport_country_version: {
        sectorId: sector.id,
        pageRole: identity.pageRole as PageRole,
        viewport,
        country: identity.country,
        version: "v1",
      },
    },
    update: { packageId: pkg.id },
    create: {
      sectorId: sector.id,
      pageRole: identity.pageRole as PageRole,
      viewport,
      country: identity.country,
      version: "v1",
      packageId: pkg.id,
    },
  });

  // One row per institution: the unique key makes five captures of the same
  // bank impossible to count as five banks.
  for (const m of acceptedBenchmarks) {
    await prisma.cohortMember.upsert({
      where: { cohortId_institution: { cohortId: cohort.id, institution: m.institution } },
      update: { benchmarkId: m.benchmarkId },
      create: {
        cohortId: cohort.id,
        institution: m.institution,
        benchmarkId: m.benchmarkId,
      },
    });
  }

  // ---- 4. Distributions ----
  const memberIds = acceptedBenchmarks.map((m) => m.benchmarkId);
  const criteria = await prisma.criterion.findMany({
    where: { packages: { some: { packageId: pkg.id } } },
    orderBy: { code: "asc" },
  });

  const peerObservations = memberIds.length
    ? await prisma.observation.findMany({
        where: { benchmarkId: { in: memberIds }, packageId: pkg.id },
        select: { criterionId: true, value: true, status: true, awaitingConfirmation: true },
      })
    : [];

  const targetObservations = await prisma.observation.findMany({
    where: { benchmarkId: targetRun.benchmarkId, packageId: pkg.id },
    select: { criterionId: true, value: true, status: true },
  });
  const targetByCriterion = new Map(targetObservations.map((o) => [o.criterionId, o]));

  const distributions: CriterionDistribution[] = criteria.map((c) => {
    // An observation still awaiting model confirmation is not published, so it
    // must not reach the denominator either.
    const rows = peerObservations
      .filter((o) => o.criterionId === c.id && !o.awaitingConfirmation)
      .map((o) => ({ value: o.value, status: o.status }));
    const d = distribution(rows);
    const t = targetByCriterion.get(c.id);
    return {
      code: c.code,
      question: c.question,
      pattern: c.pattern,
      denominator: d.denominator,
      rows: d.rows,
      excluded: d.excluded,
      targetValue: t?.value ?? null,
      targetStatus: t?.status ?? null,
    };
  });

  return {
    identity,
    targetBenchmarkId: targetRun.benchmarkId,
    cohortId: cohort.id,
    peers: outcomes,
    distributions,
    percentagesWithheld: acceptedBenchmarks.length < MIN_DENOMINATOR_FOR_PERCENT,
  };
}

export { prisma as cohortPrisma };
