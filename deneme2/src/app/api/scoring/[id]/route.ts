import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const score = await prisma.score.findUnique({
    where: { id: params.id },
    include: {
      benchmark: {
        select: { id: true, title: true, thumbnailPath: true },
      },
    },
  });

  if (!score) {
    return NextResponse.json({ error: "Score not found", success: false }, { status: 404 });
  }

  return NextResponse.json({ data: score, success: true });
}
