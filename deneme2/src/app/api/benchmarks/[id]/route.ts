import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const benchmark = await prisma.benchmark.findUnique({
    where: { id: params.id },
    include: {
      category: true,
      tags: { include: { tag: true } },
      scores: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  if (!benchmark) {
    return NextResponse.json({ error: "Not found", success: false }, { status: 404 });
  }

  return NextResponse.json({ data: benchmark, success: true });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();

    const benchmark = await prisma.benchmark.update({
      where: { id: params.id },
      data: body,
      include: {
        category: true,
        tags: { include: { tag: true } },
      },
    });

    return NextResponse.json({ data: benchmark, success: true });
  } catch {
    return NextResponse.json({ error: "Update failed", success: false }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  await prisma.benchmark.update({
    where: { id: params.id },
    data: { status: "ARCHIVED" },
  });

  return NextResponse.json({ success: true });
}
