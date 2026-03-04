import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const sources = await prisma.scrapingSource.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: sources, success: true });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const source = await prisma.scrapingSource.create({
      data: {
        name: body.name,
        url: body.url,
        site: body.site,
        maxItems: body.maxItems || 20,
        categorySlug: body.categorySlug,
        schedule: body.schedule || "daily",
        enabled: body.enabled ?? true,
      },
    });

    return NextResponse.json({ data: source, success: true }, { status: 201 });
  } catch (error) {
    console.error("Error creating source:", error);
    return NextResponse.json({ error: "Failed to create source", success: false }, { status: 500 });
  }
}
