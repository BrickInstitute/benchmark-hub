"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { BenchmarkGrid } from "@/components/benchmarks/benchmark-grid";
import { BenchmarkFilters } from "@/components/benchmarks/benchmark-filters";
import { useBenchmarks } from "@/hooks/use-benchmarks";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  _count: { benchmarks: number };
}

const CATEGORY_COLORS: Record<string, string> = {
  "landing-pages": "from-blue-500 to-blue-600",
  "mobile-screens": "from-purple-500 to-purple-600",
  dashboards: "from-green-500 to-green-600",
  "e-commerce": "from-orange-500 to-orange-600",
  saas: "from-cyan-500 to-cyan-600",
  portfolio: "from-pink-500 to-pink-600",
  blog: "from-yellow-500 to-yellow-600",
  components: "from-indigo-500 to-indigo-600",
  "web-design": "from-teal-500 to-teal-600",
  "ui-components": "from-violet-500 to-violet-600",
  "mobile-app": "from-rose-500 to-rose-600",
  dashboard: "from-emerald-500 to-emerald-600",
  "landing-page": "from-sky-500 to-sky-600",
};

const CATEGORY_ICONS: Record<string, string> = {
  "landing-pages": "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z",
  "mobile-screens": "M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z",
  dashboards: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  "e-commerce": "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z",
  saas: "M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z",
  portfolio: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01",
  blog: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  components: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
};

function CategoryFolders() {
  const { data } = useSWR<{ data: Category[]; success: boolean }>("/api/categories", fetcher);
  const categories = (data?.data || []).filter((c) => c._count.benchmarks > 0);
  const totalBenchmarks = categories.reduce((sum, c) => sum + c._count.benchmarks, 0);

  if (!data) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Benchmarks</h1>
          <p className="text-sm text-gray-500 mt-1">
            {categories.length} kategori, toplam {totalBenchmarks} benchmark
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/benchmarks?category=all">
            <Button variant="secondary" size="sm">Tumunu Gor</Button>
          </Link>
          <Link href="/upload">
            <Button variant="primary" size="sm">Yukle</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {categories.map((cat) => {
          const gradient = CATEGORY_COLORS[cat.slug] || "from-gray-500 to-gray-600";
          const iconPath = CATEGORY_ICONS[cat.slug];

          return (
            <Link
              key={cat.id}
              href={`/benchmarks?category=${cat.slug}`}
              className="group relative overflow-hidden rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-lg transition-all duration-200"
            >
              <div className={`h-24 bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                {iconPath ? (
                  <svg
                    className="w-10 h-10 text-white/80 group-hover:text-white group-hover:scale-110 transition-all"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={iconPath} />
                  </svg>
                ) : (
                  <svg
                    className="w-10 h-10 text-white/80 group-hover:text-white group-hover:scale-110 transition-all"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                )}
              </div>
              <div className="p-3 bg-white">
                <h3 className="font-semibold text-sm text-gray-900 truncate">{cat.name}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{cat._count.benchmarks} benchmark</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function CategoryView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const categorySlug = searchParams.get("category");
  const isAllView = categorySlug === "all";
  const currentPage = parseInt(searchParams.get("page") || "1");

  const filters = {
    category: isAllView ? undefined : categorySlug || undefined,
    search: searchParams.get("search") || undefined,
    sort: searchParams.get("sort") || undefined,
    page: currentPage,
  };

  const { benchmarks, total, totalPages, isLoading } = useBenchmarks(filters);

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    router.push(`/benchmarks?${params.toString()}`);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/benchmarks"
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isAllView ? "Tum Benchmarklar" : categorySlug}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {total} benchmark
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Link href="/upload">
            <Button variant="primary" size="sm">Yukle</Button>
          </Link>
          <Link href="/scraping">
            <Button variant="secondary" size="sm">Scrape</Button>
          </Link>
        </div>
      </div>

      <BenchmarkFilters />
      <BenchmarkGrid benchmarks={benchmarks} isLoading={isLoading} />

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-8">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            Onceki
          </Button>

          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
            // Show pages around current page
            let page: number;
            if (totalPages <= 10) {
              page = i + 1;
            } else if (currentPage <= 5) {
              page = i + 1;
            } else if (currentPage >= totalPages - 4) {
              page = totalPages - 9 + i;
            } else {
              page = currentPage - 4 + i;
            }

            return (
              <Button
                key={page}
                variant={page === currentPage ? "primary" : "secondary"}
                size="sm"
                onClick={() => goToPage(page)}
              >
                {page}
              </Button>
            );
          })}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            Sonraki
          </Button>

          <span className="text-xs text-gray-500 ml-2">
            {currentPage}/{totalPages}
          </span>
        </div>
      )}
    </div>
  );
}

function BenchmarksContent() {
  const searchParams = useSearchParams();
  const hasCategory = searchParams.has("category");

  if (hasCategory) {
    return <CategoryView />;
  }

  return <CategoryFolders />;
}

export default function BenchmarksPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-36 w-full rounded-xl" />
            ))}
          </div>
        </div>
      }
    >
      <BenchmarksContent />
    </Suspense>
  );
}
