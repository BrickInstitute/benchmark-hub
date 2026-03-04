"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const CATEGORIES = [
  { value: "", label: "Otomatik" },
  { value: "website", label: "Website" },
  { value: "mobile-app", label: "Mobil Uygulama" },
  { value: "dashboard", label: "Dashboard" },
  { value: "landing-page", label: "Landing Page" },
  { value: "portfolio", label: "Portfolio" },
  { value: "ui-pattern", label: "UI Pattern" },
];

interface DiscoveryRun {
  id: string;
  strategy: string;
  category: string;
  status: string;
  totalSuggested: number;
  totalValidated: number;
  totalAdded: number;
  addedSources: number;
  aiModel: string;
  inputTokens: number | null;
  outputTokens: number | null;
  errorLog: string | null;
  suggestedUrls: Array<{ url: string; name: string; confidence: number; reason: string }>;
  validatedUrls: Array<{ url: string; valid: boolean; title: string; error?: string }> | null;
  createdAt: string;
  completedAt: string | null;
}

export default function DiscoveryPage() {
  const { data, mutate } = useSWR<{ data: DiscoveryRun[]; success: boolean }>(
    "/api/discovery",
    fetcher,
    { refreshInterval: 5000 }
  );

  const [selectedCategory, setSelectedCategory] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  const startDiscovery = useCallback(async () => {
    setIsRunning(true);
    try {
      const res = await fetch("/api/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: selectedCategory || undefined }),
      });
      const result = await res.json();
      if (!result.success) {
        alert(result.error || "Kesif baslatilamadi");
      }
      mutate();
    } catch {
      alert("Bir hata olustu");
    } finally {
      setIsRunning(false);
    }
  }, [selectedCategory, mutate]);

  const runs = data?.data || [];
  const hasRunning = runs.some((r) => r.status === "running");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Site Kesfi</h1>
        <p className="text-sm text-gray-500 mt-1">
          AI ile otomatik olarak yeni UI design siteleri kesfet ve scraping havuzunu buyut
        </p>
      </div>

      {/* Start Discovery */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Yeni Kesif Baslat</h2>
        <div className="flex items-end gap-4">
          <div className="flex-1 max-w-xs">
            <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={startDiscovery}
            disabled={isRunning || hasRunning}
            className="px-6 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRunning || hasRunning ? "Calisiyooor..." : "Kesif Baslat"}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Otomatik kesif her 6 saatte bir calisir. Manuel tetikleme icin butonu kullanin.
        </p>
      </div>

      {/* Stats */}
      {runs.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            label="Toplam Kesif"
            value={runs.length}
          />
          <StatCard
            label="Onerilen Site"
            value={runs.reduce((sum, r) => sum + r.totalSuggested, 0)}
          />
          <StatCard
            label="Dogrulanan"
            value={runs.reduce((sum, r) => sum + r.totalValidated, 0)}
          />
          <StatCard
            label="Eklenen Kaynak"
            value={runs.reduce((sum, r) => sum + r.totalAdded, 0)}
          />
        </div>
      )}

      {/* Discovery Runs */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Kesif Gecmisi</h2>
        </div>

        {runs.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            Henuz kesif yapilmamis. Ilk kesfi baslatmak icin yukaridaki butonu kullanin.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {runs.map((run) => (
              <div key={run.id} className="p-4">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                >
                  <div className="flex items-center gap-3">
                    <StatusBadge status={run.status} />
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {run.strategy} / {run.category}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(run.createdAt).toLocaleString("tr-TR")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm text-gray-600">
                    <span title="Onerilen">{run.totalSuggested} onerilen</span>
                    <span title="Dogrulanan">{run.totalValidated} dogrulanan</span>
                    <span title="Eklenen" className="font-semibold text-green-600">
                      +{run.totalAdded} eklenen
                    </span>
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform ${expandedRun === run.id ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {expandedRun === run.id && (
                  <div className="mt-4 space-y-3">
                    {run.errorLog && (
                      <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">
                        {run.errorLog}
                      </div>
                    )}

                    <div className="text-xs text-gray-500">
                      Model: {run.aiModel} | Tokens: {run.inputTokens ?? 0} in / {run.outputTokens ?? 0} out
                    </div>

                    {run.suggestedUrls && run.suggestedUrls.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Onerilen Siteler</h4>
                        <div className="space-y-2">
                          {run.suggestedUrls.map((site, idx) => {
                            const validation = run.validatedUrls?.find((v) => v.url === site.url);
                            return (
                              <div
                                key={idx}
                                className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm"
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-gray-900 truncate">{site.name}</div>
                                  <a
                                    href={site.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-brand-600 hover:underline truncate block"
                                  >
                                    {site.url}
                                  </a>
                                  <div className="text-xs text-gray-500 mt-0.5">{site.reason}</div>
                                </div>
                                <div className="flex items-center gap-2 ml-4 shrink-0">
                                  <span className="text-xs text-gray-500">
                                    %{Math.round(site.confidence * 100)}
                                  </span>
                                  {validation && (
                                    <span
                                      className={`text-xs px-2 py-0.5 rounded-full ${validation.valid ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                                    >
                                      {validation.valid ? "Gecerli" : "Gecersiz"}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-green-100 text-green-700",
    running: "bg-blue-100 text-blue-700",
    failed: "bg-red-100 text-red-700",
    pending: "bg-yellow-100 text-yellow-700",
  };

  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium ${styles[status] || "bg-gray-100 text-gray-700"}`}>
      {status}
    </span>
  );
}
