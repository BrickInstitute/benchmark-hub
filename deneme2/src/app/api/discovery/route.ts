import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runDiscovery } from "@/lib/discovery/discovery-engine";

export async function GET() {
  try {
    const runs = await prisma.discoveryRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({ data: runs, success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch discovery runs";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { category } = body as { category?: string };

    // Check if there's already a running discovery
    const running = await prisma.discoveryRun.findFirst({
      where: { status: "running" },
    });

    if (running) {
      return NextResponse.json(
        { error: "A discovery run is already in progress", success: false },
        { status: 409 }
      );
    }

    // Run discovery in background (don't await)
    const runPromise = runDiscovery(category);

    // Wait briefly to get the run ID
    const run = await Promise.race([
      runPromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);

    if (run) {
      return NextResponse.json({
        data: run,
        message: "Discovery completed",
        success: true,
      });
    }

    // If it didn't complete in 2s, it's running in background
    // Get the latest running run
    const latestRun = await prisma.discoveryRun.findFirst({
      where: { status: "running" },
      orderBy: { createdAt: "desc" },
    });

    // Let it continue in background
    runPromise.catch((err) => {
      console.error("[Discovery API] Background run failed:", err);
    });

    return NextResponse.json({
      data: latestRun,
      message: "Discovery started in background",
      success: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discovery failed";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
