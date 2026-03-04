"use client";

import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn, formatScore } from "@/lib/utils";

interface BenchmarkCardProps {
  id: string;
  title: string;
  thumbnailPath: string | null;
  imagePath: string;
  overallScore: number | null;
  category: { name: string; slug: string };
  sourceSite: string | null;
}

function getScoreVariant(score: number): "success" | "warning" | "danger" {
  if (score >= 7) return "success";
  if (score >= 5) return "warning";
  return "danger";
}

export function BenchmarkCard({
  id,
  title,
  thumbnailPath,
  imagePath,
  overallScore,
  category,
  sourceSite,
}: BenchmarkCardProps) {
  const imageUrl = thumbnailPath
    ? `/api/files/${thumbnailPath}`
    : `/api/files/${imagePath}`;

  return (
    <Link href={`/benchmarks/${id}`}>
      <div className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-200">
        <div className="relative aspect-[4/3] bg-gray-100 overflow-hidden">
          <Image
            src={imageUrl}
            alt={title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
          {overallScore !== null && (
            <div className="absolute top-3 right-3">
              <Badge variant={getScoreVariant(overallScore)}>
                {formatScore(overallScore)}
              </Badge>
            </div>
          )}
        </div>

        <div className="p-4">
          <h3 className="font-medium text-gray-900 text-sm truncate">{title}</h3>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="info">{category.name}</Badge>
            {sourceSite && (
              <span className="text-xs text-gray-400">{sourceSite}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
