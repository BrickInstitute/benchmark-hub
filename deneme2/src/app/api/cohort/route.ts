import { NextRequest, NextResponse } from "next/server";
import { buildPeerCohort } from "@/lib/measurement/cohort";

export const maxDuration = 800;
export const dynamic = "force-dynamic";

/**
 * Given ONE company URL, finds comparable institutions by itself, locates the
 * page on each that plays the same role, and returns the distributions.
 */
export async function POST(request: NextRequest) {
  try {
    const { url, viewport, peerCount, sectorSlug } = (await request.json()) ?? {};
    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    const result = await buildPeerCohort({
      url,
      viewport: viewport === "MOBILE" ? "MOBILE" : "DESKTOP",
      peerCount: typeof peerCount === "number" ? peerCount : 5,
      sectorSlug,
    });

    return NextResponse.json({ data: result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
