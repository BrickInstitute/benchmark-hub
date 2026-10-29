import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, type RegionType } from "@prisma/client";
import { distribution, MIN_DENOMINATOR_FOR_PERCENT } from "@/lib/measurement/patterns";

const prisma = new PrismaClient();
export const dynamic = "force-dynamic";

/**
 * Everything the report needs for one capture: its regions, its observations
 * with evidence, and how each criterion is distributed across the cohort.
 *
 * The distribution is computed here, in SQL plus plain arithmetic, never by a
 * model. Peers still awaiting model confirmation are excluded from the
 * denominator because they are not publishable.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const benchmark = await prisma.benchmark.findUnique({
    where: { id: params.id },
    include: {
      sector: true,
      regions: { orderBy: { order: "asc" } },
      observations: {
        include: { criterion: true, evidence: true, region: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!benchmark) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Peers: other institutions in any cohort this capture belongs to.
  const membership = await prisma.cohortMember.findFirst({
    where: { benchmarkId: benchmark.id },
    include: { cohort: true },
  });

  let peerIds: string[] = [];
  let cohortSize = 0;
  if (membership) {
    const peers = await prisma.cohortMember.findMany({
      where: { cohortId: membership.cohortId, NOT: { benchmarkId: benchmark.id } },
      select: { benchmarkId: true },
    });
    peerIds = peers.map((p) => p.benchmarkId);
    cohortSize = peers.length;
  }

  const peerObservations = peerIds.length
    ? await prisma.observation.findMany({
        where: { benchmarkId: { in: peerIds }, awaitingConfirmation: false },
        include: { evidence: true },
      })
    : [];

  // A peer's own screenshot + size, so a hotspot can show a cropped preview of
  // the SAME feature on the SAME institution rather than a generic thumbnail.
  const peerBenchmarks = peerIds.length
    ? await prisma.benchmark.findMany({
        where: { id: { in: peerIds } },
        select: { id: true, institution: true, imagePath: true, width: true, height: true },
      })
    : [];
  const peerBenchmarkById = new Map(peerBenchmarks.map((b) => [b.id, b]));

  // Fallback box when a peer has no evidence of its own for this criterion
  // (e.g. it is ABSENT, so there is nothing to point at): the peer's own
  // region of the same TYPE as the target's region for this criterion. Region
  // ids never carry across benchmarks, only types do.
  const regionTypes = [
    ...new Set(benchmark.observations.map((o) => o.region?.type).filter((t): t is RegionType => Boolean(t))),
  ];
  const peerRegions = peerIds.length && regionTypes.length
    ? await prisma.region.findMany({
        where: { benchmarkId: { in: peerIds }, type: { in: regionTypes } },
        select: { benchmarkId: true, type: true, x: true, y: true, w: true, h: true },
      })
    : [];
  const peerRegionBox = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const r of peerRegions) {
    peerRegionBox.set(`${r.benchmarkId}:${r.type}`, { x: r.x, y: r.y, w: r.w, h: r.h });
  }

  const items = benchmark.observations.map((o) => {
    const rows = peerObservations.filter((p) => p.criterionId === o.criterionId);
    const d = distribution(rows);

    const peers = rows
      .map((p) => {
        const b = peerBenchmarkById.get(p.benchmarkId);
        if (!b) return null;
        const evidenceBox = p.evidence[0];
        const box =
          evidenceBox?.x !== null && evidenceBox?.x !== undefined
            ? { x: evidenceBox.x, y: evidenceBox.y!, w: evidenceBox.w!, h: evidenceBox.h! }
            : (o.region ? peerRegionBox.get(`${b.id}:${o.region.type}`) : undefined) ?? null;
        return {
          institution: b.institution ?? "Bilinmeyen",
          benchmarkId: b.id,
          status: p.status,
          value: p.value,
          rawCount: p.rawCount,
          image: { path: b.imagePath, width: b.width, height: b.height },
          box,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
      // Institutions that actually show the feature first - that is what a
      // user comparing "who has this" wants to see without scrolling.
      .sort((a, b) => (a.status === "PRESENT" ? -1 : 1) - (b.status === "PRESENT" ? -1 : 1));

    return {
      code: o.criterion.code,
      featureId: o.criterion.featureId,
      question: o.criterion.question,
      rule: o.criterion.rule,
      pattern: o.criterion.pattern,
      steps: (o.criterion.steps as string[]) ?? [],
      value: o.value,
      rawCount: o.rawCount,
      status: o.status,
      note: o.note,
      domMatch: o.domMatch,
      awaitingConfirmation: o.awaitingConfirmation,
      regionId: o.regionId,
      regionName: o.region?.name ?? null,
      evidence: o.evidence.map((e) => ({
        text: e.text,
        box: e.x !== null ? { x: e.x, y: e.y, w: e.w, h: e.h } : null,
        source: e.source,
        ambiguous: e.ambiguous,
      })),
      cohort: {
        denominator: d.denominator,
        rows: d.rows,
        excluded: d.excluded,
        coverage: {
          measured: d.denominator,
          cohortSize,
          percent:
            cohortSize === 0 ? null : Math.round((d.denominator / cohortSize) * 100),
        },
      },
      peers,
    };
  });

  return NextResponse.json({
    data: {
      benchmark: {
        id: benchmark.id,
        title: benchmark.title,
        institution: benchmark.institution,
        sourceUrl: benchmark.sourceUrl,
        viewport: benchmark.viewport,
        captureStatus: benchmark.captureStatus,
        qualityPassed: benchmark.qualityPassed,
        qualityReport: benchmark.qualityReport,
        imagePath: benchmark.imagePath,
        width: benchmark.width,
        height: benchmark.height,
        sector: benchmark.sector?.name ?? null,
        capturedAt: benchmark.capturedAt,
      },
      regions: benchmark.regions.map((r) => ({
        id: r.id,
        type: r.type,
        name: r.name,
        box: { x: r.x, y: r.y, w: r.w, h: r.h },
        source: r.source,
      })),
      observations: items,
      cohort: {
        size: cohortSize,
        percentagesWithheld: cohortSize < MIN_DENOMINATOR_FOR_PERCENT,
      },
    },
  });
}
