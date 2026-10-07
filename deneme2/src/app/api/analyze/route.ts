import { NextRequest, NextResponse } from "next/server";
import { analyze } from "@/lib/measurement/analyze";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Runs the measurement pipeline on the server.
 *
 * This has to run here, not on a developer's laptop: the screenshots must land
 * on the same storage the app serves from, otherwise the dashboard shows a
 * database row whose image does not exist.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, institution, sectorSlug, viewport, deterministicOnly } = body ?? {};

    if (!url || !institution) {
      return NextResponse.json(
        { error: "url and institution are required" },
        { status: 400 },
      );
    }

    const result = await analyze({
      url,
      institution,
      sectorSlug: sectorSlug ?? "bankacilik",
      viewport: viewport === "MOBILE" ? "MOBILE" : "DESKTOP",
      deterministicOnly: Boolean(deterministicOnly),
    });

    const counts = result.observations.reduce<Record<string, number>>((acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      data: {
        benchmarkId: result.benchmarkId,
        captureStatus: result.capture.status,
        qualityPassed: result.capture.quality?.passed ?? false,
        regionCount: result.regionCount,
        observationCount: result.observations.length,
        counts,
        publishable: result.observations.filter(
          (o) =>
            (o.status === "PRESENT" || o.status === "ABSENT") && !o.awaitingConfirmation,
        ).length,
        modelUsage: result.modelUsage,
        discardedClaims: result.discardedClaims,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
