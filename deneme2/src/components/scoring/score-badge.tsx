"use client";

import { cn, formatScore } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
}

export function ScoreBadge({ score, size = "md" }: ScoreBadgeProps) {
  const color =
    score >= 8
      ? "bg-green-100 text-green-700 border-green-200"
      : score >= 6
      ? "bg-blue-100 text-blue-700 border-blue-200"
      : score >= 4
      ? "bg-yellow-100 text-yellow-700 border-yellow-200"
      : "bg-red-100 text-red-700 border-red-200";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-bold rounded-lg border",
        color,
        {
          "text-xs px-1.5 py-0.5": size === "sm",
          "text-sm px-2 py-1": size === "md",
          "text-lg px-3 py-1.5": size === "lg",
        }
      )}
    >
      {formatScore(score)}
    </span>
  );
}
