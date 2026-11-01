import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseTargetInput } from "@/lib/projects/discovery";
import { fail, HttpError } from "@/lib/projects/http";

export const dynamic = "force-dynamic";

const Body = z.object({
  institution: z.string().trim().min(1).max(120).optional(),
  included: z.boolean().optional(),
  /** New page URL; empty string clears it so /resolve can look again. */
  url: z.string().trim().max(2000).optional(),
});

type Params = { params: { id: string; targetId: string } };

async function requireTarget(projectId: string, targetId: string) {
  const t = await prisma.projectTarget.findUnique({ where: { id: targetId } });
  if (!t || t.projectId !== projectId) throw new HttpError(404, "site bulunamadı");
  return t;
}

/**
 * Edit one list entry: rename, include/exclude, or change its page URL.
 * Changing the URL resets the run state - the old result belonged to a
 * different page and is no longer counted until the target is re-run.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const target = await requireTarget(params.id, params.targetId);
    const body = Body.parse(await request.json());
    const data: Record<string, unknown> = {};
    if (body.institution !== undefined) data.institution = body.institution;
    if (body.included !== undefined) data.included = body.included;

    if (body.url !== undefined) {
      if (body.url === "") {
        Object.assign(data, {
          url: null,
          foundVia: null,
          resolveState: "PENDING",
          resolveNote: null,
          runState: "IDLE",
          runNote: null,
          benchmarkId: null,
        });
      } else {
        const parsed = parseTargetInput(body.url);
        if (!parsed) throw new HttpError(400, "geçerli bir adres girin");
        const url = parsed.url ?? `https://${parsed.domain}/`;
        if (parsed.domain !== target.domain) {
          const clash = await prisma.projectTarget.findUnique({
            where: { projectId_domain: { projectId: params.id, domain: parsed.domain } },
          });
          if (clash) throw new HttpError(409, `${parsed.domain} listede başka bir satırda var`);
          data.domain = parsed.domain;
        }
        if (url !== target.url) {
          Object.assign(data, {
            url,
            foundVia: "manual",
            resolveState: "RESOLVED",
            resolveNote: "adres elle girildi",
            runState: "IDLE",
            runNote: target.benchmarkId ? "adres değişti; yeniden çalıştırın" : null,
            benchmarkId: null,
          });
        }
      }
    }
    const updated = await prisma.projectTarget.update({ where: { id: target.id }, data });
    return NextResponse.json({ data: updated });
  } catch (e) {
    return fail(e);
  }
}

/**
 * Removes the entry. Prefer excluding (included = false) for a model
 * suggestion: a deleted suggestion can come back on the next discovery, an
 * excluded one cannot.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const target = await requireTarget(params.id, params.targetId);
    await prisma.projectTarget.delete({ where: { id: target.id } });
    return NextResponse.json({ data: { deleted: true } });
  } catch (e) {
    return fail(e);
  }
}
