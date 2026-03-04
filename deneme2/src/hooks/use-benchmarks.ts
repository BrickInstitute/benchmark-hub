"use client";

import useSWR from "swr";
import type { BenchmarkFilters } from "@/types/benchmark";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useBenchmarks(filters: BenchmarkFilters = {}) {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  if (filters.search) params.set("search", filters.search);
  if (filters.sourceSite) params.set("sourceSite", filters.sourceSite);
  if (filters.minScore) params.set("minScore", String(filters.minScore));
  if (filters.maxScore) params.set("maxScore", String(filters.maxScore));
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.tags?.length) params.set("tags", filters.tags.join(","));

  const query = params.toString();
  const { data, error, isLoading, mutate } = useSWR(
    `/api/benchmarks${query ? `?${query}` : ""}`,
    fetcher
  );

  return {
    benchmarks: data?.data || [],
    total: data?.total || 0,
    totalPages: data?.totalPages || 0,
    isLoading,
    error,
    mutate,
  };
}

export function useBenchmark(id: string) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? `/api/benchmarks/${id}` : null,
    fetcher
  );

  return {
    benchmark: data?.data,
    isLoading,
    error,
    mutate,
  };
}
