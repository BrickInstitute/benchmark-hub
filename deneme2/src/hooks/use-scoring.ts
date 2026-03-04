"use client";

import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useScore(id: string | null) {
  const { data, error, isLoading } = useSWR(
    id ? `/api/scoring/${id}` : null,
    fetcher
  );

  return {
    score: data?.data,
    isLoading,
    error,
  };
}

export function useTriggerScoring() {
  const [isScoring, setIsScoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const triggerScoring = async (benchmarkId: string, provider?: string, model?: string) => {
    setIsScoring(true);
    setError(null);

    try {
      const response = await fetch("/api/scoring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ benchmarkId, provider, model }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error);
      }

      return data.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Scoring failed";
      setError(message);
      throw err;
    } finally {
      setIsScoring(false);
    }
  };

  return { triggerScoring, isScoring, error };
}
