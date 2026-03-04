"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import useSWR from "swr";
import { useDropzone } from "react-dropzone";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { SCORE_CRITERIA } from "@/lib/constants";
import { cn, formatScore } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type SideSource = "db" | "upload";

type UploadData = {
  imagePath: string;
  imageUrl: string;
  base64?: string;
  width: number;
  height: number;
};

type ComparisonScores = {
  visualConsistency: number;
  layoutQuality: number;
  typography: number;
  colorHarmony: number;
  whitespaceUsage: number;
  accessibilityScore: number;
  overallScore: number;
};

type ComparisonResult = {
  left: ComparisonScores;
  right: ComparisonScores;
  winner: "left" | "right" | "tie";
  comparison: string;
  leftStrengths: string[];
  leftWeaknesses: string[];
  rightStrengths: string[];
  rightWeaknesses: string[];
  recommendation: string;
};

function ImageUploadZone({
  onUpload,
  preview,
}: {
  onUpload: (data: UploadData, base64: string) => void;
  preview: string | null;
}) {
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setIsUploading(true);

      try {
        // Get base64 for AI comparison
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]); // Remove data:image/...;base64, prefix
          };
          reader.readAsDataURL(file);
        });

        // Upload to server
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await response.json();

        if (!data.success) throw new Error(data.error);

        const base64 = await base64Promise;
        onUpload(data.data, base64);
      } catch {
        // silently handle
      } finally {
        setIsUploading(false);
      }
    },
    [onUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "border-2 border-dashed rounded-xl cursor-pointer transition-colors overflow-hidden",
        isDragActive
          ? "border-brand-500 bg-brand-50"
          : "border-gray-300 hover:border-brand-400 hover:bg-gray-50"
      )}
    >
      <input {...getInputProps()} />
      {preview ? (
        <div className="relative aspect-video">
          <img src={preview} alt="Preview" className="w-full h-full object-contain bg-gray-50" />
          {isUploading && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      ) : (
        <div className="aspect-video flex flex-col items-center justify-center text-gray-400 p-4">
          <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p className="text-sm">
            {isUploading ? "Yukleniyor..." : "Gorsel surukleyin veya tiklayin"}
          </p>
          <p className="text-xs mt-1">PNG, JPG, WebP - Maks 10MB</p>
        </div>
      )}
    </div>
  );
}

function ScoreBar({ label, leftVal, rightVal }: { label: string; leftVal: number; rightVal: number }) {
  const leftWins = leftVal > rightVal;
  const rightWins = rightVal > leftVal;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={cn("w-6 text-right font-bold", leftWins ? "text-green-600" : "text-gray-600")}>
        {formatScore(leftVal)}
      </span>
      <div className="flex-1 flex h-3 rounded-full overflow-hidden bg-gray-100 gap-0.5">
        <div className="flex-1 flex justify-end">
          <div
            className={cn("h-full rounded-l-full", leftWins ? "bg-green-500" : "bg-gray-300")}
            style={{ width: `${(leftVal / 10) * 100}%` }}
          />
        </div>
        <div className="flex-1">
          <div
            className={cn("h-full rounded-r-full", rightWins ? "bg-green-500" : "bg-gray-300")}
            style={{ width: `${(rightVal / 10) * 100}%` }}
          />
        </div>
      </div>
      <span className={cn("w-6 font-bold", rightWins ? "text-green-600" : "text-gray-600")}>
        {formatScore(rightVal)}
      </span>
      <span className="w-28 text-gray-500 truncate">{label}</span>
    </div>
  );
}

export default function ComparePage() {
  // Source modes
  const [leftSource, setLeftSource] = useState<SideSource>("db");
  const [rightSource, setRightSource] = useState<SideSource>("upload");

  // DB selections
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");

  // Upload data
  const [leftUpload, setLeftUpload] = useState<UploadData | null>(null);
  const [leftBase64, setLeftBase64] = useState<string | null>(null);
  const [leftPreview, setLeftPreview] = useState<string | null>(null);

  const [rightUpload, setRightUpload] = useState<UploadData | null>(null);
  const [rightBase64, setRightBase64] = useState<string | null>(null);
  const [rightPreview, setRightPreview] = useState<string | null>(null);

  // Comparison
  const [isComparing, setIsComparing] = useState(false);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  // Benchmark data from DB
  const { data: benchmarksData } = useSWR("/api/benchmarks?limit=100&sort=createdAt:desc", fetcher);
  const benchmarks = benchmarksData?.data || [];

  const { data: leftData } = useSWR(
    leftSource === "db" && leftId ? `/api/benchmarks/${leftId}` : null,
    fetcher
  );
  const { data: rightData } = useSWR(
    rightSource === "db" && rightId ? `/api/benchmarks/${rightId}` : null,
    fetcher
  );

  const left = leftData?.data;
  const right = rightData?.data;

  const options = benchmarks.map((b: { id: string; title: string; overallScore: number | null }) => ({
    value: b.id,
    label: `${b.title.slice(0, 60)}${b.overallScore !== null ? ` (${formatScore(b.overallScore)})` : ""}`,
  }));

  // Check if both sides are ready
  const leftReady = leftSource === "db" ? !!leftId : !!leftUpload;
  const rightReady = rightSource === "db" ? !!rightId : !!rightUpload;
  const canCompare = leftReady && rightReady && !isComparing;

  const handleCompare = async () => {
    setIsComparing(true);
    setResult(null);
    setCompareError(null);

    try {
      const payload: Record<string, string | undefined> = {};

      if (leftSource === "db") {
        payload.leftBenchmarkId = leftId;
      } else {
        payload.leftImageBase64 = leftBase64 || undefined;
      }

      if (rightSource === "db") {
        payload.rightBenchmarkId = rightId;
      } else {
        payload.rightImageBase64 = rightBase64 || undefined;
      }

      const response = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      setResult(data.data);
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : "Karsilastirma basarisiz");
    } finally {
      setIsComparing(false);
    }
  };

  const handleLeftUpload = useCallback((data: UploadData, base64: string) => {
    setLeftUpload(data);
    setLeftBase64(base64);
    setLeftPreview(`/api/files/${data.imagePath}`);
    setResult(null);
  }, []);

  const handleRightUpload = useCallback((data: UploadData, base64: string) => {
    setRightUpload(data);
    setRightBase64(base64);
    setRightPreview(`/api/files/${data.imagePath}`);
    setResult(null);
  }, []);

  const renderSideSelector = (
    side: "left" | "right",
    source: SideSource,
    setSource: (s: SideSource) => void,
    selectedId: string,
    setSelectedId: (id: string) => void,
    upload: UploadData | null,
    preview: string | null,
    onUpload: (data: UploadData, base64: string) => void,
    dbData: typeof left
  ) => (
    <div className="space-y-3">
      {/* Source tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
        <button
          onClick={() => { setSource("db"); setResult(null); }}
          className={cn(
            "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
            source === "db" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
          )}
        >
          Mevcut Benchmark
        </button>
        <button
          onClick={() => { setSource("upload"); setResult(null); }}
          className={cn(
            "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
            source === "upload" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
          )}
        >
          Gorsel Yukle
        </button>
      </div>

      {source === "db" ? (
        <div className="space-y-3">
          <Select
            options={options}
            placeholder="Benchmark secin..."
            value={selectedId}
            onChange={(e) => { setSelectedId(e.target.value); setResult(null); }}
          />
          {dbData ? (
            <Card>
              <div className="relative aspect-video bg-gray-100 rounded-t-xl overflow-hidden">
                <Image
                  src={`/api/files/${dbData.imagePath}`}
                  alt={dbData.title}
                  fill
                  className="object-contain"
                  sizes="50vw"
                />
              </div>
              <CardContent>
                <h3 className="font-medium text-gray-900 text-sm truncate">{dbData.title}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {dbData.category?.name}
                  {dbData.overallScore != null && ` - Skor: ${formatScore(dbData.overallScore)}`}
                </p>
              </CardContent>
            </Card>
          ) : selectedId ? (
            <div className="aspect-video bg-gray-50 rounded-xl animate-pulse" />
          ) : (
            <div className="aspect-video border-2 border-dashed rounded-xl flex items-center justify-center text-gray-400 text-sm">
              {side === "left" ? "Sol" : "Sag"} tarafi secin
            </div>
          )}
        </div>
      ) : (
        <ImageUploadZone onUpload={onUpload} preview={preview} />
      )}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Karsilastir</h1>
        <p className="text-sm text-gray-500 mt-1">
          Iki tasarimi yan yana karsilastirin - mevcut benchmark veya kendi gorselinizi yukleyin
        </p>
      </div>

      {/* Side-by-side selection */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Sol Tasarim</h2>
          {renderSideSelector("left", leftSource, setLeftSource, leftId, setLeftId, leftUpload, leftPreview, handleLeftUpload, left)}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Sag Tasarim</h2>
          {renderSideSelector("right", rightSource, setRightSource, rightId, setRightId, rightUpload, rightPreview, handleRightUpload, right)}
        </div>
      </div>

      {/* Compare button */}
      <div className="text-center mb-8">
        <Button
          variant="primary"
          onClick={handleCompare}
          disabled={!canCompare}
          className="px-8 py-3 text-base"
        >
          {isComparing ? (
            <span className="flex items-center gap-2">
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              AI Karsilastiriyor...
            </span>
          ) : (
            "AI ile Karsilastir"
          )}
        </Button>
        {compareError && (
          <p className="text-sm text-red-600 mt-2">{compareError}</p>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Winner banner */}
          <div className={cn(
            "p-5 rounded-xl text-center",
            result.winner === "tie"
              ? "bg-gray-100"
              : "bg-gradient-to-r from-brand-50 to-brand-100"
          )}>
            {result.winner === "tie" ? (
              <p className="font-bold text-lg text-gray-700">
                Berabere! Her iki tasarim da {formatScore(result.left.overallScore)} puan aldi.
              </p>
            ) : (
              <div>
                <p className="text-sm text-brand-600 font-medium mb-1">Kazanan</p>
                <p className="font-bold text-xl text-brand-700">
                  {result.winner === "left" ? "Sol Tasarim" : "Sag Tasarim"}
                </p>
                <p className="text-brand-600 mt-1">
                  {formatScore(result.left.overallScore)} vs {formatScore(result.right.overallScore)}
                </p>
              </div>
            )}
          </div>

          {/* Score comparison */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">Kriter Bazli Karsilastirma</h2>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-brand-200" /> Sol
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-brand-200" /> Sag
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {SCORE_CRITERIA.map((criteria) => {
                const leftVal = result.left[criteria.key as keyof ComparisonScores];
                const rightVal = result.right[criteria.key as keyof ComparisonScores];
                if (leftVal == null || rightVal == null) return null;
                return (
                  <ScoreBar
                    key={criteria.key}
                    label={criteria.label}
                    leftVal={leftVal}
                    rightVal={rightVal}
                  />
                );
              })}
              {/* Overall */}
              <div className="border-t pt-3 mt-3">
                <ScoreBar
                  label="Genel Skor"
                  leftVal={result.left.overallScore}
                  rightVal={result.right.overallScore}
                />
              </div>
            </CardContent>
          </Card>

          {/* Strengths & Weaknesses side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left analysis */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">Sol Tasarim</h2>
                  <span className={cn(
                    "text-lg font-bold px-3 py-1 rounded-lg",
                    result.left.overallScore >= 7 ? "bg-green-100 text-green-700" :
                    result.left.overallScore >= 5 ? "bg-blue-100 text-blue-700" :
                    "bg-yellow-100 text-yellow-700"
                  )}>
                    {formatScore(result.left.overallScore)}/10
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {result.leftStrengths?.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-green-600 uppercase mb-2">Guclu Yonler</h3>
                    <ul className="space-y-1.5">
                      {result.leftStrengths.map((s, i) => (
                        <li key={i} className="text-sm text-gray-600 flex items-start gap-1.5">
                          <span className="text-green-500 mt-0.5 shrink-0">+</span> {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.leftWeaknesses?.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-orange-600 uppercase mb-2">Zayif Yonler</h3>
                    <ul className="space-y-1.5">
                      {result.leftWeaknesses.map((s, i) => (
                        <li key={i} className="text-sm text-gray-600 flex items-start gap-1.5">
                          <span className="text-orange-500 mt-0.5 shrink-0">!</span> {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Right analysis */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">Sag Tasarim</h2>
                  <span className={cn(
                    "text-lg font-bold px-3 py-1 rounded-lg",
                    result.right.overallScore >= 7 ? "bg-green-100 text-green-700" :
                    result.right.overallScore >= 5 ? "bg-blue-100 text-blue-700" :
                    "bg-yellow-100 text-yellow-700"
                  )}>
                    {formatScore(result.right.overallScore)}/10
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {result.rightStrengths?.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-green-600 uppercase mb-2">Guclu Yonler</h3>
                    <ul className="space-y-1.5">
                      {result.rightStrengths.map((s, i) => (
                        <li key={i} className="text-sm text-gray-600 flex items-start gap-1.5">
                          <span className="text-green-500 mt-0.5 shrink-0">+</span> {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.rightWeaknesses?.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-orange-600 uppercase mb-2">Zayif Yonler</h3>
                    <ul className="space-y-1.5">
                      {result.rightWeaknesses.map((s, i) => (
                        <li key={i} className="text-sm text-gray-600 flex items-start gap-1.5">
                          <span className="text-orange-500 mt-0.5 shrink-0">!</span> {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Detailed comparison text */}
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-gray-900">Detayli AI Analizi</h2>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {result.comparison}
              </p>
              {result.recommendation && (
                <div className="mt-4 p-3 bg-brand-50 rounded-lg border border-brand-200">
                  <h3 className="text-xs font-semibold text-brand-700 uppercase mb-1">Oneri</h3>
                  <p className="text-sm text-brand-800">{result.recommendation}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty state */}
      {!result && !leftReady && !rightReady && (
        <div className="text-center py-16 text-gray-400">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
          <p className="text-lg mb-2">Karsilastirmak icin iki tasarim secin</p>
          <p className="text-sm">Mevcut benchmarklardan secin veya kendi gorsellerinizi yukleyin</p>
        </div>
      )}
    </div>
  );
}
