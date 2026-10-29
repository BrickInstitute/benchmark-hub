"use client";

import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { useBenchmark } from "@/hooks/use-benchmarks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";
import { AnalysisPanel } from "@/components/analysis/analysis-panel";

export default function BenchmarkDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { benchmark, isLoading } = useBenchmark(params.id as string);

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
        <p className="text-muted">Benchmark bulunamadi.</p>
        <Button variant="secondary" className="mt-4" onClick={() => router.back()}>
          Geri Don
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => router.back()}
            className="text-sm text-muted hover:text-ink-2 mb-2 flex items-center gap-1"
          >
            &#8592; Geri
          </button>
          <h1 className="text-2xl font-bold text-ink">{benchmark.title}</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="info">{benchmark.category.name}</Badge>
            {benchmark.sourceSite && (
              <Badge>{benchmark.sourceSite}</Badge>
            )}
            <span className="text-sm text-muted-2">
              {formatDate(benchmark.createdAt)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <div className="capture-mat relative aspect-video rounded-t-xl overflow-hidden">
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
                <p className="text-ink-2">{benchmark.description}</p>
              </CardContent>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-ink">Detaylar</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              {benchmark.sourceUrl && (
                <div>
                  <span className="text-xs text-muted">Kaynak URL</span>
                  <a
                    href={benchmark.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-brand-300 hover:underline truncate"
                  >
                    {benchmark.sourceUrl}
                  </a>
                </div>
              )}
              {benchmark.width && benchmark.height && (
                <div>
                  <span className="text-xs text-muted">Boyut</span>
                  <p className="text-sm">{benchmark.width} x {benchmark.height}</p>
                </div>
              )}
              {benchmark.tags?.length > 0 && (
                <div>
                  <span className="text-xs text-muted">Etiketler</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {benchmark.tags.map((t: { tag: { id: string; name: string } }) => (
                      <Badge key={t.tag.id}>{t.tag.name}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AnalysisPanel benchmarkId={benchmark.id} />
    </div>
  );
}
