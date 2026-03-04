import { NextResponse } from "next/server";
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
