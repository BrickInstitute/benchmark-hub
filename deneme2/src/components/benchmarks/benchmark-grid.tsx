"use client";

import { BenchmarkCard } from "./benchmark-card";
import { Skeleton } from "@/components/ui/skeleton";

interface BenchmarkGridProps {
  benchmarks: Array<{
    id: string;
    title: string;
    thumbnailPath: string | null;
    imagePath: string;
    overallScore: number | null;
    category: { name: string; slug: string };
    sourceSite: string | null;
  }>;
  isLoading?: boolean;
}

export function BenchmarkGrid({ benchmarks, isLoading }: BenchmarkGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <Skeleton className="aspect-[4/3]" />
            <div className="p-4 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-5 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (benchmarks.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-gray-400 text-lg mb-2">Benchmark bulunamadi</div>
        <p className="text-gray-500 text-sm">Yeni benchmark yukleyin veya scraping baslatın.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {benchmarks.map((benchmark) => (
        <BenchmarkCard key={benchmark.id} {...benchmark} />
      ))}
    </div>
  );
}
