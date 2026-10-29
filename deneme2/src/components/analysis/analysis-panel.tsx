"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { InteractiveScreenshot } from "./interactive-screenshot";
import { CriterionDetail, STATUS_CHIP, STATUS_LABEL } from "./criterion-detail";
import type { AnalysisData, Status } from "@/types/analysis";

/**
 * The analysis view.
 *
 * Three rules shape how this renders:
 *
 * 1. UNKNOWN never looks like ABSENT. They are different colours and the
 *    reason for UNKNOWN is printed verbatim. Conflating them is how a report
 *    ends up claiming a competitor lacks something nobody ever checked.
 * 2. No percentage below a denominator of 8. Raw counts only.
 * 3. Coverage is shown next to prevalence: "4 of 5 measured" is how much to
 *    trust "3 of 4 have it".
 *
 * This list and the screenshot's hotspot popups render the exact same
 * CriterionDetail for a given code - this is the full story either way, not
 * a teaser that sends you looking for the "real" version somewhere else.
 */

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function AnalysisPanel({ benchmarkId }: { benchmarkId: string }) {
  const { data, isLoading } = useSWR<{ data: AnalysisData }>(
    `/api/benchmarks/${benchmarkId}/analysis`,
    fetcher,
  );
  const [regionFilter, setRegionFilter] = useState<string | null>(null);

  const analysis = data?.data;

  const counts = useMemo(() => {
    const c: Record<Status, number> = {
      PRESENT: 0,
      ABSENT: 0,
      UNKNOWN: 0,
      NOT_APPLICABLE: 0,
    };
    for (const o of analysis?.observations ?? []) c[o.status]++;
    return c;
  }, [analysis]);

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-xl bg-surface" />;
  }
  if (!analysis || analysis.observations.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface p-6">
        <h2 className="text-sm font-semibold text-ink">Analiz</h2>
        <p className="mt-2 text-sm text-muted">
          Bu yakalama için henüz ölçüm yapılmamış.
        </p>
      </div>
    );
  }

  const visible = regionFilter
    ? analysis.observations.filter((o) => o.regionId === regionFilter)
    : analysis.observations;

  const publishable = analysis.observations.filter(
    (o) => (o.status === "PRESENT" || o.status === "ABSENT") && !o.awaitingConfirmation,
  ).length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Analiz</h2>
          <span className="text-xs text-muted">
            {analysis.benchmark.sector} · {analysis.benchmark.viewport} ·{" "}
            {analysis.benchmark.qualityPassed ? "kalite geçti" : "kalite kaldı"}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
            <span key={s} className={`rounded-lg px-2.5 py-1 text-xs ${STATUS_CHIP[s]}`}>
              {STATUS_LABEL[s]} {counts[s]}
            </span>
          ))}
        </div>

        <p className="mt-3 text-xs text-muted-2">
          {analysis.observations.length} ölçütün {publishable} tanesi yayınlanabilir.
          Kohort {analysis.cohort.size} muadil
          {analysis.cohort.percentagesWithheld &&
            " · payda 8'in altında olduğu için yüzde gösterilmiyor"}
          .
        </p>
      </div>

      <InteractiveScreenshot analysis={analysis} />

      {analysis.regions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setRegionFilter(null)}
            className={`rounded-lg px-3 py-1.5 text-xs ${
              regionFilter === null
                ? "bg-brand-400 text-base"
                : "bg-surface text-ink-2 hover:bg-surface-2"
            }`}
          >
            Tümü
          </button>
          {analysis.regions.map((r) => {
            const n = analysis.observations.filter((o) => o.regionId === r.id).length;
            if (n === 0) return null;
            return (
              <button
                key={r.id}
                onClick={() => setRegionFilter(r.id)}
                className={`rounded-lg px-3 py-1.5 text-xs ${
                  regionFilter === r.id
                    ? "bg-brand-400 text-base"
                    : "bg-surface text-ink-2 hover:bg-surface-2"
                }`}
              >
                {r.name} <span className="text-muted-2">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-3">
        {visible.map((o) => (
          <div
            key={o.code}
            id={`obs-${o.code}`}
            className="scroll-mt-24 rounded-xl border border-line bg-surface p-5 transition-shadow"
          >
            <CriterionDetail o={o} />
          </div>
        ))}
      </div>
    </div>
  );
}
