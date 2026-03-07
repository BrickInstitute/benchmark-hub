import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const jobs = await prisma.scrapingJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      _count: { select: { benchmarks: true } },
    },
  });

  return NextResponse.json({ data: jobs, success: true });
}

// DELETE: Clean up old PENDING/FAILED jobs
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "PENDING";

  const { count } = await prisma.scrapingJob.deleteMany({
    where: { status: status as "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" },
  });

  return NextResponse.json({
    data: { deleted: count, status },
    success: true,
  });
}
