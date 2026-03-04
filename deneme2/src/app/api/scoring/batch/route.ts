import { NextRequest, NextResponse } from "next/server";
import { scoreBenchmark } from "@/lib/scoring/scoring-engine";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { benchmarkIds, provider, model } = body;

    if (!benchmarkIds || !Array.isArray(benchmarkIds) || benchmarkIds.length === 0) {
      return NextResponse.json(
        { error: "benchmarkIds array is required", success: false },
        { status: 400 }
      );
    }

    // Process sequentially to respect API rate limits
    const results = [];
    const errors = [];

    for (const id of benchmarkIds) {
      try {
        const score = await scoreBenchmark(id, provider, model);
        results.push({ benchmarkId: id, scoreId: score.id, success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed";
        errors.push({ benchmarkId: id, error: message });
      }
    }

    return NextResponse.json({
      data: { results, errors },
      success: true,
    });
  } catch (error) {
    console.error("Batch scoring error:", error);
    return NextResponse.json(
      { error: "Batch scoring failed", success: false },
      { status: 500 }
    );
  }
}
