"use client";

import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useScrapingJobs() {
  const { data, error, isLoading, mutate } = useSWR(
    "/api/scraping/jobs",
    fetcher,
    { refreshInterval: 3000 }
  );

  return {
    jobs: data?.data || [],
    isLoading,
    error,
    mutate,
  };
}

export function useScrapingJob(id: string | null) {
  const { data, error, isLoading } = useSWR(
    id ? `/api/scraping/jobs/${id}` : null,
    fetcher,
    { refreshInterval: 2000 }
  );

  return {
    job: data?.data,
    isLoading,
    error,
  };
}

export function useStartScraping() {
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startScraping = async (
    targetUrl: string,
    targetSite: string,
    maxItems: number = 50,
    config?: { category?: string; autoScore?: boolean }
  ) => {
    setIsStarting(true);
    setError(null);

    try {
      const response = await fetch("/api/scraping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl, targetSite, maxItems, config }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to start scraping");
      }

      return data.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      setError(message);
      throw err;
    } finally {
      setIsStarting(false);
    }
  };

  return { startScraping, isStarting, error };
}
