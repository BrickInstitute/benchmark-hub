"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { UploadDropzone } from "@/components/upload/upload-dropzone";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type UploadData = {
  imagePath: string;
  thumbnailPath: string;
  imageUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  fileSize: number;
  format: string;
  dominantColors: string[];
};

export default function UploadPage() {
  const router = useRouter();
  const { data: categoriesData } = useSWR("/api/categories", fetcher);
  const categories = categoriesData?.data || [];

  const [mode, setMode] = useState<"file" | "url">("file");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [autoScore, setAutoScore] = useState(true);
  const [uploadData, setUploadData] = useState<UploadData | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // URL mode
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const handleCaptureUrl = async () => {
    if (!screenshotUrl) return;
    setIsCapturing(true);
    setCaptureError(null);

    try {
      const response = await fetch("/api/upload/screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: screenshotUrl }),
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      setUploadData(data.data);
      if (!title) setTitle(screenshotUrl.replace(/https?:\/\//, "").split("/")[0]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Screenshot alinamadi";
      setCaptureError(message);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleSave = async () => {
    if (!title || !categoryId || !uploadData) return;

    setIsSaving(true);
    try {
      const response = await fetch("/api/benchmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || undefined,
          categoryId,
          imagePath: uploadData.imagePath,
          thumbnailPath: uploadData.thumbnailPath,
          width: uploadData.width,
          height: uploadData.height,
          fileSize: uploadData.fileSize,
          format: uploadData.format,
          dominantColors: uploadData.dominantColors,
          sourceUrl: mode === "url" ? screenshotUrl : undefined,
          isUploaded: true,
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Auto-score if checked
        if (autoScore) {
          fetch("/api/scoring", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ benchmarkId: data.data.id }),
          }).catch(() => {});
        }
        router.push(`/benchmarks/${data.data.id}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Benchmark Yukle</h1>
        <p className="text-sm text-gray-500 mt-1">
          Dosyadan yukleyin veya URL&apos;den screenshot alin
        </p>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => { setMode("file"); setUploadData(null); }}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            mode === "file"
              ? "bg-brand-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Dosyadan Yukle
        </button>
        <button
          onClick={() => { setMode("url"); setUploadData(null); }}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            mode === "url"
              ? "bg-brand-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          URL&apos;den Screenshot
        </button>
      </div>

      <Card>
        <CardContent className="space-y-6 py-6">
          {mode === "file" ? (
            <UploadDropzone onUploadComplete={setUploadData} />
          ) : (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Website URL
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={screenshotUrl}
                  onChange={(e) => setScreenshotUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="flex-1 px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <Button
                  onClick={handleCaptureUrl}
                  disabled={!screenshotUrl || isCapturing}
                >
                  {isCapturing ? "Aliniyor..." : "Screenshot Al"}
                </Button>
              </div>
              {captureError && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{captureError}</p>
              )}
              {uploadData && (
                <div className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden">
                  <Image
                    src={`/api/files/${uploadData.imagePath}`}
                    alt="Screenshot"
                    fill
                    className="object-contain"
                    sizes="100vw"
                  />
                </div>
              )}
            </div>
          )}

          {uploadData && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Baslik *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Benchmark basligi..."
                  className="w-full px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Aciklama
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Opsiyonel aciklama..."
                  rows={3}
                  className="w-full px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kategori *
                </label>
                <Select
                  options={categories.map((c: { id: string; name: string }) => ({
                    value: c.id,
                    label: c.name,
                  }))}
                  placeholder="Kategori secin..."
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoScore"
                  checked={autoScore}
                  onChange={(e) => setAutoScore(e.target.checked)}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <label htmlFor="autoScore" className="text-sm text-gray-700">
                  Kaydettikten sonra otomatik AI skorlamasi yap
                </label>
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>{uploadData.width}x{uploadData.height}</span>
                <span>-</span>
                <span>{(uploadData.fileSize / 1024).toFixed(0)} KB</span>
                <span>-</span>
                <span>{uploadData.format}</span>
                <div className="flex gap-0.5 ml-2">
                  {uploadData.dominantColors.slice(0, 4).map((c, i) => (
                    <div
                      key={i}
                      className="w-4 h-4 rounded border border-gray-200"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <Button
                onClick={handleSave}
                disabled={!title || !categoryId || isSaving}
              >
                {isSaving ? "Kaydediliyor..." : "Benchmark Kaydet"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
