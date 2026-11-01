import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { startDiscovery } from "@/lib/projects/jobs";
import { fail, requireProject } from "@/lib/projects/http";

export const dynamic = "force-dynamic";

const Body = z.object({ count: z.number().int().min(1).max(40).optional() });

/**
 * Starts discovery in the background: the model suggests institutions not
 * already on the list, then each one's page is located. Returns 202
 * immediately; poll GET /api/projects/[id].
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireProject(params.id);
    const body = Body.parse(await request.json().catch(() => ({})));
    await startDiscovery(params.id, body.count);
    return NextResponse.json({ data: { started: "discover" } }, { status: 202 });
  } catch (e) {
    return fail(e);
  }
}
