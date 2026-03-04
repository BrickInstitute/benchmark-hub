import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const job = await prisma.scrapingJob.findUnique({
    where: { id: params.id },
    include: {
      _count: { select: { benchmarks: true } },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found", success: false }, { status: 404 });
  }

  return NextResponse.json({ data: job, success: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  await prisma.scrapingJob.update({
    where: { id: params.id },
    data: { status: "CANCELLED" },
  });

  return NextResponse.json({ success: true });
}
