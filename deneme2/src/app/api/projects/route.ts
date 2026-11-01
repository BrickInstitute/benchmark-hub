import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { fail, uniqueProjectSlug } from "@/lib/projects/http";

export const dynamic = "force-dynamic";

const PAGE_ROLES = ["ENTRY", "LISTING", "DECISION", "CONVERSION", "TRUST"] as const;

const CreateBody = z.object({
  name: z.string().trim().min(2).max(120),
  brief: z.string().trim().min(5).max(4000),
  pageTopic: z.string().trim().max(200).optional().nullable(),
  pageRole: z.enum(PAGE_ROLES).optional().nullable(),
  viewport: z.enum(["DESKTOP", "MOBILE"]).optional(),
  country: z.string().trim().length(2).optional(),
  sectorSlug: z.string().trim().optional().nullable(),
  targetCount: z.number().int().min(1).max(40).optional(),
});

/** Project list with target and run counts. */
export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        sector: { select: { slug: true, name: true } },
        targets: { select: { included: true, runState: true } },
      },
    });
    return NextResponse.json({
      data: projects.map(({ targets, ...p }) => ({
        ...p,
        counts: {
          targets: targets.filter((t) => t.included).length,
          excluded: targets.filter((t) => !t.included).length,
          done: targets.filter((t) => t.included && t.runState === "DONE").length,
        },
      })),
    });
  } catch (e) {
    return fail(e);
  }
}

/** Creates an empty project. The URL list is built afterwards (discover / add). */
export async function POST(request: NextRequest) {
  try {
    const body = CreateBody.parse(await request.json());
    let sectorId: string | null = null;
    if (body.sectorSlug) {
      const sector = await prisma.sector.findUnique({ where: { slug: body.sectorSlug } });
      if (!sector) return NextResponse.json({ error: `bilinmeyen sektör: ${body.sectorSlug}` }, { status: 400 });
      sectorId = sector.id;
    }
    const project = await prisma.project.create({
      data: {
        name: body.name,
        slug: await uniqueProjectSlug(body.name),
        brief: body.brief,
        pageTopic: body.pageTopic || null,
        pageRole: body.pageRole ?? null,
        viewport: body.viewport ?? "DESKTOP",
        country: (body.country ?? "TR").toUpperCase(),
        sectorId,
        targetCount: body.targetCount ?? 15,
        createdBy: request.headers.get("x-bh-user"),
      },
    });
    return NextResponse.json({ data: project }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
