"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { BenchmarkGrid } from "@/components/benchmarks/benchmark-grid";
import { BenchmarkFilters } from "@/components/benchmarks/benchmark-filters";
import { useBenchmarks } from "@/hooks/use-benchmarks";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

function BenchmarksContent() {
  const searchParams = useSearchParams();

  const filters = {
    category: searchParams.get("category") || undefined,
    search: searchParams.get("search") || undefined,
    sort: searchParams.get("sort") || undefined,
    page: parseInt(searchParams.get("page") || "1"),
  };

  const { benchmarks, total, totalPages, isLoading } = useBenchmarks(filters);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Benchmarks</h1>
          <p className="text-sm text-gray-500 mt-1">
            Toplam {total} benchmark
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/upload">
            <Button variant="primary">Yukle</Button>
          </Link>
          <Link href="/scraping">
            <Button variant="secondary">Scrape</Button>
          </Link>
        </div>
      </div>

      <BenchmarkFilters />
      <BenchmarkGrid benchmarks={benchmarks} isLoading={isLoading} />

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <Link
              key={page}
              href={`/benchmarks?${new URLSearchParams({
                ...Object.fromEntries(searchParams.entries()),
                page: String(page),
              }).toString()}`}
            >
              <Button
                variant={page === filters.page ? "primary" : "secondary"}
                size="sm"
              >
                {page}
              </Button>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BenchmarksPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-12 w-full" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-64 w-full rounded-xl" />
            ))}
          </div>
        </div>
      }
    >
      <BenchmarksContent />
    </Suspense>
  );
}
