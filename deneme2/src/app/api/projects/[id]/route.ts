import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { activeJob, reconcile } from "@/lib/projects/jobs";
import { fail, HttpError, requireProject } from "@/lib/projects/http";

export const dynamic = "force-dynamic";

const PAGE_ROLES = ["ENTRY", "LISTING", "DECISION", "CONVERSION", "TRUST"] as const;

const PatchBody = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  brief: z.string().trim().min(5).max(4000).optional(),
  pageTopic: z.string().trim().max(200).nullable().optional(),
  pageRole: z.enum(PAGE_ROLES).nullable().optional(),
  viewport: z.enum(["DESKTOP", "MOBILE"]).optional(),
  country: z.string().trim().length(2).optional(),
  sectorSlug: z.string().trim().nullable().optional(),
  targetCount: z.number().int().min(1).max(40).optional(),
});

type Params = { params: { id: string } };

/** Project + its URL list + job state. Polled by the UI while a job runs. */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await reconcile(params.id);
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        sector: { select: { slug: true, name: true } },
        targets: {
          orderBy: { order: "asc" },
          include: {
            benchmark: {
              select: {
                id: true,
                thumbnailPath: true,
                qualityPassed: true,
                captureStatus: true,
                pageAnalysis: { select: { status: true, note: true } },
              },
            },
          },
        },
      },
    });
    if (!project) return NextResponse.json({ error: "proje bulunamadı" }, { status: 404 });
    const sectors = await prisma.sector.findMany({ select: { slug: true, name: true }, orderBy: { name: "asc" } });
    return NextResponse.json({
      data: {
        ...project,
        activeJob: activeJob(project.id),
        modelAvailable: Boolean(process.env.ANTHROPIC_API_KEY),
        sectors,
      },
    });
  } catch (e) {
    return fail(e);
  }
}

/**
 * Edits project settings. Topic / role / sector / viewport change what later
 * runs measure; results already stored are NOT re-interpreted - re-run with
 * force to bring them in line (docs/projeler.md).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    await requireProject(params.id);
    if (activeJob(params.id)) throw new HttpError(409, "iş çalışırken proje ayarları değiştirilemez");
    const body = PatchBody.parse(await request.json());
    let sectorId: string | null | undefined;
    if (body.sectorSlug !== undefined) {
      if (body.sectorSlug === null || body.sectorSlug === "") sectorId = null;
      else {
        const s = await prisma.sector.findUnique({ where: { slug: body.sectorSlug } });
        if (!s) throw new HttpError(400, `bilinmeyen sektör: ${body.sectorSlug}`);
        sectorId = s.id;
      }
    }
    const project = await prisma.project.update({
      where: { id: params.id },
      data: {
        name: body.name,
        brief: body.brief,
        pageTopic: body.pageTopic === undefined ? undefined : body.pageTopic || null,
        pageRole: body.pageRole,
        viewport: body.viewport,
        country: body.country?.toUpperCase(),
        targetCount: body.targetCount,
        ...(sectorId !== undefined ? { sectorId } : {}),
      },
    });
    return NextResponse.json({ data: project });
  } catch (e) {
    return fail(e);
  }
}

/** Deletes the project and its list. Captures (Benchmark rows) are kept. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requireProject(params.id);
    if (activeJob(params.id)) throw new HttpError(409, "iş çalışırken proje silinemez");
    await prisma.project.delete({ where: { id: params.id } });
    return NextResponse.json({ data: { deleted: true } });
  } catch (e) {
    return fail(e);
  }
}
