import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runDiscovery } from "@/lib/discovery/discovery-engine";

const SIX_HOURS = 6 * 60 * 60 * 1000;

export async function GET() {
  try {
    // Check if enough time passed since last discovery
    const lastRun = await prisma.discoveryRun.findFirst({
      where: { status: { in: ["completed", "running"] } },
      orderBy: { createdAt: "desc" },
    });

    if (lastRun) {
      const timeSince = Date.now() - lastRun.createdAt.getTime();
      if (timeSince < SIX_HOURS) {
        return NextResponse.json({
          message: "Too soon for another discovery run",
          lastRunAt: lastRun.createdAt,
          nextRunIn: Math.round((SIX_HOURS - timeSince) / 60000) + " minutes",
          success: true,
        });
      }
    }

    // Run discovery (don't await - let it run in background)
    runDiscovery().catch((err) => {
      console.error("[Discovery Cron] Error:", err);
    });

    return NextResponse.json({
      message: "Discovery triggered",
      success: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron trigger failed";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
