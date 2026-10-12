"use client";

import { cn, formatScore } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
}

export function ScoreBadge({ score, size = "md" }: ScoreBadgeProps) {
  const color =
    score >= 8
      ? "bg-mint-dim text-mint border-mint-dim"
      : score >= 6
      ? "bg-sky-dim text-sky border-sky-dim"
      : score >= 4
      ? "bg-amber-dim text-amber border-amber-dim"
      : "bg-rose-dim text-rose border-rose-dim";

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
