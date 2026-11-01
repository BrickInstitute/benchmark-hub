import { NextRequest, NextResponse } from "next/server";
import { projectSummary } from "@/lib/projects/summary";
import { fail, requireProject } from "@/lib/projects/http";

export const dynamic = "force-dynamic";

/** Cross-site results: module / value-prop prevalence, hero table, criteria. */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireProject(params.id);
    return NextResponse.json({ data: await projectSummary(params.id) });
  } catch (e) {
    return fail(e);
  }
}
