import { NextRequest, NextResponse } from "next/server";
import { startResolve } from "@/lib/projects/jobs";
import { fail, requireProject } from "@/lib/projects/http";

export const dynamic = "force-dynamic";

/** Finds the page for every included target that has a domain but no URL yet. */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireProject(params.id);
    await startResolve(params.id);
    return NextResponse.json({ data: { started: "resolve" } }, { status: 202 });
  } catch (e) {
    return fail(e);
  }
}
