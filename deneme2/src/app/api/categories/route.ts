import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const categories = await prisma.category.findMany({
    include: {
      _count: { select: { benchmarks: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ data: categories, success: true });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const category = await prisma.category.create({
      data: {
        name: body.name,
        slug: body.slug,
        description: body.description,
        icon: body.icon,
      },
    });
    return NextResponse.json({ data: category, success: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create category", success: false }, { status: 500 });
  }
}
