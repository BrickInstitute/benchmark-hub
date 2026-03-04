import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");

  const tags = await prisma.tag.findMany({
    where: search
      ? { name: { contains: search, mode: "insensitive" } }
      : undefined,
    include: {
      _count: { select: { benchmarks: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ data: tags, success: true });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tag = await prisma.tag.create({
      data: {
        name: body.name,
        slug: body.slug,
      },
    });
    return NextResponse.json({ data: tag, success: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create tag", success: false }, { status: 500 });
  }
}
