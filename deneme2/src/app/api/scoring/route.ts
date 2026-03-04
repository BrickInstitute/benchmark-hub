import { NextRequest, NextResponse } from "next/server";
import { scoreBenchmark } from "@/lib/scoring/scoring-engine";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { benchmarkId, provider, model } = body;

    if (!benchmarkId) {
      return NextResponse.json(
        { error: "benchmarkId is required", success: false },
        { status: 400 }
      );
    }

    const score = await scoreBenchmark(benchmarkId, provider, model);

    return NextResponse.json({
      data: score,
      success: true,
    });
  } catch (error) {
    console.error("Scoring error:", error);
    const message = error instanceof Error ? error.message : "Scoring failed";
    return NextResponse.json(
      { error: message, success: false },
      { status: 500 }
    );
  }
}
