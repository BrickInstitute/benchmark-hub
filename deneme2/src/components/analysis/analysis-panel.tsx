"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";

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
 */

type Status = "PRESENT" | "ABSENT" | "UNKNOWN" | "NOT_APPLICABLE";

interface Observation {
  code: string;
  featureId: string | null;
  question: string;
  rule: string;
  pattern: string;
  steps: string[];
  value: string | null;
  rawCount: number | null;
  status: Status;
  note: string | null;
  domMatch: string;
  awaitingConfirmation: boolean;
  regionId: string | null;
  regionName: string | null;
  evidence: Array<{
    text: string;
    box: { x: number; y: number; w: number; h: number } | null;
    source: string;
    ambiguous: boolean;
  }>;
  cohort: {
    denominator: number;
    rows: Array<{ value: string; count: number; percent: number | null }>;
    excluded: { unknown: number; notApplicable: number };
    coverage: { measured: number; cohortSize: number; percent: number | null };
  };
}

interface AnalysisData {
  benchmark: {
    institution: string | null;
    viewport: string;
    captureStatus: string;
    qualityPassed: boolean;
    sector: string | null;
  };
  regions: Array<{
    id: string;
    type: string;
    name: string;
    box: { x: number; y: number; w: number; h: number };
  }>;
  observations: Observation[];
  cohort: { size: number; percentagesWithheld: boolean };
}

const STATUS_STYLE: Record<Status, { label: string; className: string }> = {
  // Deliberately not a traffic light: this reports prevalence, not quality.
  PRESENT: { label: "Var", className: "bg-mint-dim text-mint" },
  ABSENT: { label: "Yok", className: "bg-peach-dim text-peach" },
  UNKNOWN: { label: "Belirsiz", className: "bg-sky-dim text-sky" },
  NOT_APPLICABLE: { label: "Kapsam dışı", className: "bg-surface-3 text-muted" },
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function Ladder({ steps, value }: { steps: string[]; value: string | null }) {
  if (steps.length < 3 || !value) return null;
  const index = steps.indexOf(value);
  if (index < 0) return null;
  return (
    <div className="mt-2 flex items-center gap-1">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <span
            title={s}
            className={`h-1.5 w-6 rounded-full ${
              i === index ? "bg-brand-400" : "bg-surface-3"
            }`}
          />
        </div>
      ))}
      <span className="ml-2 text-xs text-muted">{value}</span>
    </div>
  );
}

function CohortBars({ o }: { o: Observation }) {
  const { denominator, rows, excluded, coverage } = o.cohort;
  if (denominator === 0) {
    return (
      <p className="mt-3 text-xs text-muted-2">
        Bu ölçüt için karşılaştırılabilir muadil kaydı yok.
      </p>
    );
  }
  return (
    <div className="mt-3 space-y-1.5">
      {rows.map((r) => {
        const mine = r.value === (o.status === "ABSENT" ? "yok" : o.value);
        return (
          <div key={r.value} className="flex items-center gap-2 text-xs">
            <span className={`w-28 shrink-0 ${mine ? "text-ink" : "text-muted"}`}>
              {r.value}
              {mine && <span className="ml-1 text-brand-300">· siz</span>}
            </span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
              <span
                className={`block h-full rounded-full ${
                  mine ? "bg-brand-400" : "bg-line-strong"
                }`}
                style={{ width: `${(r.count / denominator) * 100}%` }}
              />
            </span>
            <span className="w-16 shrink-0 text-right tabular-nums text-muted">
              {r.count}/{denominator}
              {r.percent !== null && ` ·%${r.percent}`}
            </span>
          </div>
        );
      })}
      <p className="pt-1 text-[11px] text-muted-2">
        İnceleme kapsamı: {coverage.measured}/{coverage.cohortSize} muadil
        {coverage.percent !== null && ` (%${coverage.percent})`}
        {excluded.unknown > 0 && ` · ${excluded.unknown} belirsiz`}
        {excluded.notApplicable > 0 && ` · ${excluded.notApplicable} kapsam dışı`}
      </p>
    </div>
  );
}

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
          {(Object.keys(STATUS_STYLE) as Status[]).map((s) => (
            <span
              key={s}
              className={`rounded-lg px-2.5 py-1 text-xs ${STATUS_STYLE[s].className}`}
            >
              {STATUS_STYLE[s].label} {counts[s]}
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
          <div key={o.code} className="rounded-xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-muted">
                    {o.code}
                  </span>
                  {o.featureId && (
                    <span className="truncate font-mono text-[11px] text-muted-2">
                      {o.featureId}
                    </span>
                  )}
                  {o.regionName && (
                    <span className="rounded bg-lavender-dim px-1.5 py-0.5 text-[11px] text-lavender">
                      {o.regionName}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-ink">{o.question}</p>
              </div>

              {/* An observation still waiting for model confirmation must not
                  look settled - it is not published and must not be read as a
                  finding about the institution. */}
              <span
                className={`shrink-0 rounded-lg px-2.5 py-1 text-xs ${
                  STATUS_STYLE[o.status].className
                } ${o.awaitingConfirmation ? "opacity-45 line-through decoration-1" : ""}`}
                title={o.awaitingConfirmation ? "Teyit bekliyor, yayınlanmıyor" : undefined}
              >
                {STATUS_STYLE[o.status].label}
                {o.rawCount !== null && ` · ${o.rawCount}`}
              </span>
            </div>

            <Ladder steps={o.steps} value={o.value} />

            {o.evidence.length > 0 && (
              <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-2">Kanıt</p>
                {o.evidence.map((e, i) => (
                  <p key={i} className="mt-1 text-sm text-ink-2">
                    “{e.text.slice(0, 180)}”
                    <span className="ml-2 text-[11px] text-muted-2">
                      {e.source === "DOM_ELEMENT" ? "DOM öğesi" : "model alıntısı"}
                      {e.box && ` · [${e.box.x}, ${e.box.y}]`}
                      {e.ambiguous && " · birden çok yerde geçiyor"}
                    </span>
                  </p>
                ))}
              </div>
            )}

            {o.note && (
              <p className="mt-2 text-xs text-sky">
                {o.note}
                {o.awaitingConfirmation && " · model teyidi bekliyor, yayınlanmıyor"}
              </p>
            )}
            {!o.note && o.awaitingConfirmation && (
              <p className="mt-2 text-xs text-sky">
                Model teyidi bekliyor, yayınlanmıyor.
              </p>
            )}

            <CohortBars o={o} />
          </div>
        ))}
      </div>
    </div>
  );
}
