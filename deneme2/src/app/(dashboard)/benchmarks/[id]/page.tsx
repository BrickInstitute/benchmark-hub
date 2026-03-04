"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { useBenchmark } from "@/hooks/use-benchmarks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatScore } from "@/lib/utils";
import { ScoreBreakdown } from "@/components/scoring/score-breakdown";

export default function BenchmarkDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { benchmark, isLoading, mutate } = useBenchmark(params.id as string);
  const [isScoring, setIsScoring] = useState(false);

  const handleScore = async () => {
    if (!benchmark) return;
    setIsScoring(true);
    try {
      await fetch("/api/scoring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ benchmarkId: benchmark.id }),
      });
      mutate();
    } catch {
      // Error handled
    } finally {
      setIsScoring(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  if (!benchmark) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Benchmark bulunamadi.</p>
        <Button variant="secondary" className="mt-4" onClick={() => router.back()}>
          Geri Don
        </Button>
      </div>
    );
  }

  const latestScore = benchmark.scores?.[0];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => router.back()}
            className="text-sm text-gray-500 hover:text-gray-700 mb-2 flex items-center gap-1"
          >
            &#8592; Geri
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{benchmark.title}</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="info">{benchmark.category.name}</Badge>
            {benchmark.sourceSite && (
              <Badge>{benchmark.sourceSite}</Badge>
            )}
            {benchmark.isUploaded && (
              <Badge variant="success">Yuklendi</Badge>
            )}
            <span className="text-sm text-gray-400">
              {formatDate(benchmark.createdAt)}
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant="primary"
            onClick={handleScore}
            disabled={isScoring}
          >
            {isScoring ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Skorlaniyor...
              </span>
            ) : latestScore ? (
              "Tekrar Skorla"
            ) : (
              "AI ile Skorla"
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <div className="relative aspect-video bg-gray-100 rounded-t-xl overflow-hidden">
              <Image
                src={`/api/files/${benchmark.imagePath}`}
                alt={benchmark.title}
                fill
                className="object-contain"
                sizes="(max-width: 1024px) 100vw, 66vw"
              />
            </div>
            {benchmark.description && (
              <CardContent>
                <p className="text-gray-600">{benchmark.description}</p>
              </CardContent>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {/* Score */}
          {latestScore && (
            <Card>
              <CardHeader>
                <h2 className="font-semibold text-gray-900">AI Skoru</h2>
              </CardHeader>
              <CardContent>
                <div className="text-center mb-4">
                  <span className="text-4xl font-bold text-brand-600">
                    {formatScore(latestScore.overallScore)}
                  </span>
                  <span className="text-gray-400 text-lg">/10</span>
                </div>
                <ScoreBreakdown score={latestScore} />
                <p className="text-xs text-gray-400 mt-3 text-center">
                  {latestScore.aiModel} - {formatDate(latestScore.createdAt)}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Metadata */}
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-gray-900">Detaylar</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              {benchmark.sourceUrl && (
                <div>
                  <span className="text-xs text-gray-500">Kaynak URL</span>
                  <a
                    href={benchmark.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-brand-600 hover:underline truncate"
                  >
                    {benchmark.sourceUrl}
                  </a>
                </div>
              )}
              {benchmark.width && benchmark.height && (
                <div>
                  <span className="text-xs text-gray-500">Boyut</span>
                  <p className="text-sm">{benchmark.width} x {benchmark.height}</p>
                </div>
              )}
              {benchmark.layoutType && (
                <div>
                  <span className="text-xs text-gray-500">Layout Tipi</span>
                  <p className="text-sm">{benchmark.layoutType}</p>
                </div>
              )}
              {benchmark.dominantColors && (
                <div>
                  <span className="text-xs text-gray-500">Renkler</span>
                  <div className="flex gap-1 mt-1">
                    {(benchmark.dominantColors as string[]).map((color: string, i: number) => (
                      <div
                        key={i}
                        className="w-6 h-6 rounded border border-gray-200"
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              )}
              {benchmark.tags?.length > 0 && (
                <div>
                  <span className="text-xs text-gray-500">Etiketler</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {benchmark.tags.map((t: { tag: { id: string; name: string } }) => (
                      <Badge key={t.tag.id}>{t.tag.name}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Feedback */}
          {latestScore?.feedback && (
            <Card>
              <CardHeader>
                <h2 className="font-semibold text-gray-900">AI Analizi</h2>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">
                  {latestScore.feedback}
                </p>
                {latestScore.strengths && (
                  <div className="mt-4">
                    <h3 className="text-xs font-semibold text-green-600 uppercase mb-2">Guclu Yonler</h3>
                    <ul className="space-y-1">
                      {(latestScore.strengths as string[]).map((s: string, i: number) => (
                        <li key={i} className="text-sm text-gray-600 flex items-start gap-1">
                          <span className="text-green-500 mt-0.5">+</span> {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {latestScore.improvements && (
                  <div className="mt-4">
                    <h3 className="text-xs font-semibold text-orange-600 uppercase mb-2">Gelistirme Alanlari</h3>
                    <ul className="space-y-1">
                      {(latestScore.improvements as string[]).map((s: string, i: number) => (
                        <li key={i} className="text-sm text-gray-600 flex items-start gap-1">
                          <span className="text-orange-500 mt-0.5">!</span> {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Score history */}
          {benchmark.scores?.length > 1 && (
            <Card>
              <CardHeader>
                <h2 className="font-semibold text-gray-900">Skor Gecmisi</h2>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {benchmark.scores.map((score: { id: string; overallScore: number; aiModel: string; createdAt: string }, i: number) => (
                    <div key={score.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">
                        {i === 0 ? "Son" : `#${benchmark.scores.length - i}`} - {formatDate(score.createdAt)}
                      </span>
                      <span className="font-medium">{formatScore(score.overallScore)}/10</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
