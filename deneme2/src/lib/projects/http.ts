/**
 * Small helpers shared by the /api/projects routes.
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "../db";
import { JobConflictError } from "./jobs";

export function fail(e: unknown) {
  if (e instanceof ZodError) {
    return NextResponse.json({ error: "geçersiz istek", issues: e.issues }, { status: 400 });
  }
  if (e instanceof JobConflictError) {
    return NextResponse.json({ error: e.message }, { status: 409 });
  }
  if (e instanceof HttpError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Turkish-aware slug: "Kredi Kartı Sayfaları" -> "kredi-karti-sayfalari". */
export function trSlug(text: string): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u" };
  return text
    .replace(/[çğıİöşüÇĞÖŞÜ]/g, (c) => map[c.toLocaleLowerCase("tr")] ?? map[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export async function uniqueProjectSlug(name: string): Promise<string> {
  const base = trSlug(name) || "proje";
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    if (!(await prisma.project.findUnique({ where: { slug } }))) return slug;
  }
  return `${base}-${Date.now()}`;
}

/** 404 unless the project exists. */
export async function requireProject(id: string) {
  const p = await prisma.project.findUnique({ where: { id } });
  if (!p) throw new HttpError(404, "proje bulunamadı");
  return p;
}
