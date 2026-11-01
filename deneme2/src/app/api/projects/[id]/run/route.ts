import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { startRun } from "@/lib/projects/jobs";
import { fail, requireProject } from "@/lib/projects/http";

export const dynamic = "force-dynamic";

const Body = z.object({
  /** Re-run targets that already finished. */
  force: z.boolean().optional(),
  targetIds: z.array(z.string()).optional(),
  mode: z.enum(["full", "capture_only"]).optional(),
});

/**
 * Captures and analyses the project's included targets in the background.
 * By default only targets without a finished result are run.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireProject(params.id);
    const body = Body.parse(await request.json().catch(() => ({})));
    await startRun(params.id, body);
    return NextResponse.json({ data: { started: "run" } }, { status: 202 });
  } catch (e) {
    return fail(e);
  }
}
