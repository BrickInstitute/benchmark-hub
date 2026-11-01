import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { institutionFromDomain, parseTargetInput } from "@/lib/projects/discovery";
import { fail, HttpError, requireProject } from "@/lib/projects/http";

export const dynamic = "force-dynamic";

const Body = z.object({
  /** A bare domain ("enpara.com") or a full page URL. */
  input: z.string().trim().min(3).max(2000),
  institution: z.string().trim().max(120).optional(),
});

/**
 * Adds a site by hand. A full URL is used as-is (the user chose that page);
 * a bare domain waits for /resolve to find the right page.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireProject(params.id);
    const body = Body.parse(await request.json());
    const parsed = parseTargetInput(body.input);
    if (!parsed) throw new HttpError(400, "geçerli bir alan adı ya da adres girin");

    const existing = await prisma.projectTarget.findUnique({
      where: { projectId_domain: { projectId: params.id, domain: parsed.domain } },
    });
    if (existing) {
      throw new HttpError(
        409,
        existing.included
          ? `${parsed.domain} zaten listede (${existing.institution})`
          : `${parsed.domain} listede ama hariç tutulmuş; listeden yeniden dahil edin`,
      );
    }
    const last = await prisma.projectTarget.findFirst({
      where: { projectId: params.id },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const target = await prisma.projectTarget.create({
      data: {
        projectId: params.id,
        institution: body.institution || institutionFromDomain(parsed.domain),
        domain: parsed.domain,
        url: parsed.url,
        source: "MANUAL",
        foundVia: parsed.url ? "manual" : null,
        resolveState: parsed.url ? "RESOLVED" : "PENDING",
        resolveNote: parsed.url ? "adres elle girildi" : null,
        order: (last?.order ?? -1) + 1,
      },
    });
    return NextResponse.json({ data: target }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
