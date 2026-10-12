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
        <h1 className="text-2xl font-bold text-ink">Site Kesfi</h1>
        <p className="text-sm text-muted mt-1">
          AI ile otomatik olarak yeni UI design siteleri kesfet ve scraping havuzunu buyut
        </p>
      </div>

      {/* Start Discovery */}
      <div className="bg-surface rounded-xl border border-line p-6">
        <h2 className="text-lg font-semibold text-ink mb-4">Yeni Kesif Baslat</h2>
        <div className="flex items-end gap-4">
          <div className="flex-1 max-w-xs">
            <label className="block text-sm font-medium text-ink-2 mb-1">Kategori</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 border border-line-strong rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
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
            className="px-6 py-2 bg-brand-400 text-base text-sm font-medium rounded-lg hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRunning || hasRunning ? "Calisiyooor..." : "Kesif Baslat"}
          </button>
        </div>
        <p className="text-xs text-muted-2 mt-3">
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
      <div className="bg-surface rounded-xl border border-line">
        <div className="p-4 border-b border-line">
          <h2 className="text-lg font-semibold text-ink">Kesif Gecmisi</h2>
        </div>

        {runs.length === 0 ? (
          <div className="p-12 text-center text-muted">
            Henuz kesif yapilmamis. Ilk kesfi baslatmak icin yukaridaki butonu kullanin.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {runs.map((run) => (
              <div key={run.id} className="p-4">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                >
                  <div className="flex items-center gap-3">
                    <StatusBadge status={run.status} />
                    <div>
                      <div className="text-sm font-medium text-ink">
                        {run.strategy} / {run.category}
                      </div>
                      <div className="text-xs text-muted">
                        {new Date(run.createdAt).toLocaleString("tr-TR")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm text-ink-2">
                    <span title="Onerilen">{run.totalSuggested} onerilen</span>
                    <span title="Dogrulanan">{run.totalValidated} dogrulanan</span>
                    <span title="Eklenen" className="font-semibold text-mint">
                      +{run.totalAdded} eklenen
                    </span>
                    <svg
                      className={`w-5 h-5 text-muted-2 transition-transform ${expandedRun === run.id ? "rotate-180" : ""}`}
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
                      <div className="p-3 bg-rose-dim text-rose text-sm rounded-lg">
                        {run.errorLog}
                      </div>
                    )}

                    <div className="text-xs text-muted">
                      Model: {run.aiModel} | Tokens: {run.inputTokens ?? 0} in / {run.outputTokens ?? 0} out
                    </div>

                    {run.suggestedUrls && run.suggestedUrls.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-ink-2 mb-2">Onerilen Siteler</h4>
                        <div className="space-y-2">
                          {run.suggestedUrls.map((site, idx) => {
                            const validation = run.validatedUrls?.find((v) => v.url === site.url);
                            return (
                              <div
                                key={idx}
                                className="flex items-center justify-between p-2 bg-surface-2 rounded-lg text-sm"
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-ink truncate">{site.name}</div>
                                  <a
                                    href={site.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-brand-300 hover:underline truncate block"
                                  >
                                    {site.url}
                                  </a>
                                  <div className="text-xs text-muted mt-0.5">{site.reason}</div>
                                </div>
                                <div className="flex items-center gap-2 ml-4 shrink-0">
                                  <span className="text-xs text-muted">
                                    %{Math.round(site.confidence * 100)}
                                  </span>
                                  {validation && (
                                    <span
                                      className={`text-xs px-2 py-0.5 rounded-full ${validation.valid ? "bg-mint-dim text-mint" : "bg-rose-dim text-rose"}`}
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
    <div className="bg-surface rounded-xl border border-line p-4">
      <div className="text-2xl font-bold text-ink">{value}</div>
      <div className="text-xs text-muted mt-1">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-mint-dim text-mint",
    running: "bg-sky-dim text-sky",
    failed: "bg-rose-dim text-rose",
    pending: "bg-amber-dim text-amber",
  };

  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium ${styles[status] || "bg-surface-3 text-ink-2"}`}>
      {status}
    </span>
  );
}
