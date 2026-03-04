"use client";

import { useState } from "react";
import useSWR from "swr";
import Image from "next/image";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "@/components/scoring/score-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function ScoringPage() {
  const { data, isLoading, mutate } = useSWR("/api/benchmarks?sort=overallScore:desc&limit=100", fetcher);
  const benchmarks = data?.data || [];
  const scored = benchmarks.filter((b: { overallScore: number | null }) => b.overallScore !== null);
  const unscored = benchmarks.filter((b: { overallScore: number | null }) => b.overallScore === null);

  const [isBatchScoring, setIsBatchScoring] = useState(false);
  const [scoringProgress, setScoringProgress] = useState("");
  const [isSingleScoring, setIsSingleScoring] = useState<string | null>(null);

  const handleBatchScore = async () => {
    if (unscored.length === 0) return;
    setIsBatchScoring(true);

    const ids = unscored.slice(0, 10).map((b: { id: string }) => b.id);
    setScoringProgress(`0/${ids.length} skorlaniyor...`);

    for (let i = 0; i < ids.length; i++) {
      setScoringProgress(`${i + 1}/${ids.length} skorlaniyor...`);
      try {
        await fetch("/api/scoring", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ benchmarkId: ids[i] }),
        });
      } catch {
        // Continue with next
      }
    }

    setScoringProgress("");
    setIsBatchScoring(false);
    mutate();
  };

  const handleSingleScore = async (benchmarkId: string) => {
    setIsSingleScoring(benchmarkId);
    try {
      await fetch("/api/scoring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ benchmarkId }),
      });
      mutate();
    } catch {
      // Error silently handled
    } finally {
      setIsSingleScoring(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Skorlama</h1>
          <p className="text-sm text-gray-500 mt-1">
            {scored.length} skorlanmis, {unscored.length} bekleyen benchmark
          </p>
        </div>

        {unscored.length > 0 && (
          <Button
            variant="primary"
            onClick={handleBatchScore}
            disabled={isBatchScoring}
          >
            {isBatchScoring
              ? scoringProgress
              : `Toplu Skorla (${Math.min(unscored.length, 10)} adet)`}
          </Button>
        )}
      </div>

      {/* Unscored benchmarks */}
      {unscored.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Skorlanmamis ({unscored.length})
          </h2>
          <div className="space-y-2">
            {unscored.slice(0, 20).map((benchmark: {
              id: string;
              title: string;
              thumbnailPath: string | null;
              imagePath: string;
              category: { name: string };
              sourceSite: string | null;
              createdAt: string;
            }) => (
              <Card key={benchmark.id}>
                <CardContent className="flex items-center gap-4 py-3">
                  <div className="relative w-16 h-12 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                    <Image
                      src={`/api/files/${benchmark.thumbnailPath || benchmark.imagePath}`}
                      alt={benchmark.title}
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/benchmarks/${benchmark.id}`} className="font-medium text-sm text-gray-900 hover:text-brand-600 truncate block">
                      {benchmark.title}
                    </Link>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">{benchmark.category.name}</span>
                      {benchmark.sourceSite && (
                        <span className="text-xs text-gray-400">- {benchmark.sourceSite}</span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => handleSingleScore(benchmark.id)}
                    disabled={isSingleScoring === benchmark.id || isBatchScoring}
                  >
                    {isSingleScoring === benchmark.id ? "Skorlaniyor..." : "Skorla"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Scored benchmarks */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Skorlanmis ({scored.length})
        </h2>
        {scored.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-500">Henuz skorlanmis benchmark yok.</p>
              <p className="text-sm text-gray-400 mt-1">
                Yukaridaki &quot;Toplu Skorla&quot; butonunu veya tek tek &quot;Skorla&quot; butonlarini kullanin.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {scored.map((benchmark: {
              id: string;
              title: string;
              thumbnailPath: string | null;
              imagePath: string;
              overallScore: number;
              category: { name: string };
              sourceSite: string | null;
              createdAt: string;
            }) => (
              <Link key={benchmark.id} href={`/benchmarks/${benchmark.id}`}>
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="flex items-center gap-4 py-3">
                    <div className="relative w-16 h-12 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                      <Image
                        src={`/api/files/${benchmark.thumbnailPath || benchmark.imagePath}`}
                        alt={benchmark.title}
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm text-gray-900 truncate">{benchmark.title}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400">{benchmark.category.name}</span>
                        {benchmark.sourceSite && (
                          <span className="text-xs text-gray-400">- {benchmark.sourceSite}</span>
                        )}
                        <span className="text-xs text-gray-300">{formatDate(benchmark.createdAt)}</span>
                      </div>
                    </div>
                    <ScoreBadge score={benchmark.overallScore} size="lg" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
