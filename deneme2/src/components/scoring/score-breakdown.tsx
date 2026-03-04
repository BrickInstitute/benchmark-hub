"use client";

import { SCORE_CRITERIA } from "@/lib/constants";
import { cn, formatScore } from "@/lib/utils";

interface ScoreBreakdownProps {
  score: {
    visualConsistency: number;
    layoutQuality: number;
    typography: number;
    colorHarmony: number;
    whitespaceUsage: number;
    accessibilityScore: number;
  };
}

function getBarColor(value: number): string {
  if (value >= 8) return "bg-green-500";
  if (value >= 6) return "bg-blue-500";
  if (value >= 4) return "bg-yellow-500";
  return "bg-red-500";
}

export function ScoreBreakdown({ score }: ScoreBreakdownProps) {
  const scoreMap: Record<string, number> = {
    visualConsistency: score.visualConsistency,
    layoutQuality: score.layoutQuality,
    typography: score.typography,
    colorHarmony: score.colorHarmony,
    whitespaceUsage: score.whitespaceUsage,
    accessibilityScore: score.accessibilityScore,
  };

  return (
    <div className="space-y-3">
      {SCORE_CRITERIA.map((criteria) => {
        const value = scoreMap[criteria.key];
        return (
          <div key={criteria.key}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-600">{criteria.label}</span>
              <span className="font-medium">{formatScore(value)}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className={cn("h-2 rounded-full transition-all", getBarColor(value))}
                style={{ width: `${(value / 10) * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
