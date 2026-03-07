"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Select } from "@/components/ui/select";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const sortOptions = [
  { value: "createdAt:desc", label: "En Yeni" },
  { value: "createdAt:asc", label: "En Eski" },
  { value: "overallScore:desc", label: "En Yuksek Skor" },
  { value: "overallScore:asc", label: "En Dusuk Skor" },
  { value: "title:asc", label: "A-Z" },
];

export function BenchmarkFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get("search") || "";
  const [search, setSearch] = useState(initialSearch);
  const [isUserTyping, setIsUserTyping] = useState(false);

  const { data: categoriesData } = useSWR("/api/categories", fetcher);
  const categories = categoriesData?.data || [];

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page"); // Reset to page 1 when filter changes
      router.push(`/benchmarks?${params.toString()}`);
    },
    [router, searchParams]
  );

  useEffect(() => {
    if (!isUserTyping) return;
    const timeout = setTimeout(() => {
      updateFilter("search", search);
      setIsUserTyping(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, isUserTyping, updateFilter]);

  return (
    <div className="flex flex-wrap items-center gap-4 mb-6">
      <div className="flex-1 min-w-[200px]">
        <input
          type="text"
          placeholder="Benchmark ara..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setIsUserTyping(true); }}
          className="w-full px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <Select
        options={categories.map((c: { slug: string; name: string }) => ({
          value: c.slug,
          label: c.name,
        }))}
        placeholder="Tum Kategoriler"
        value={searchParams.get("category") || ""}
        onChange={(e) => updateFilter("category", e.target.value)}
        className="w-48"
      />

      <Select
        options={sortOptions}
        value={searchParams.get("sort") || "createdAt:desc"}
        onChange={(e) => updateFilter("sort", e.target.value)}
        className="w-48"
      />
    </div>
  );
}
