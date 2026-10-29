"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
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

  const [imgError, setImgError] = useState(false);

  return (
    <Link href={`/benchmarks/${id}`}>
      <div className="group bg-surface rounded-xl border border-line overflow-hidden hover:shadow-lg transition-all duration-200">
        <div className="relative aspect-[4/3] bg-surface-3 overflow-hidden">
          {imgError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-2 text-muted-2">
              <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs">Gorsel yuklenemiyor</span>
            </div>
          ) : (
            <Image
              src={imageUrl}
              alt={title}
              fill
              unoptimized
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              onError={() => setImgError(true)}
            />
          )}
          {overallScore !== null && (
            <div className="absolute top-3 right-3">
              <Badge variant={getScoreVariant(overallScore)}>
                {formatScore(overallScore)}
              </Badge>
            </div>
          )}
        </div>

        <div className="p-4">
          <h3 className="font-medium text-ink text-sm truncate">{title}</h3>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="info">{category.name}</Badge>
            {sourceSite && (
              <span className="text-xs text-muted-2">{sourceSite}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
