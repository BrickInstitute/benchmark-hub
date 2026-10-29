"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisData, Box, Observation, Status } from "@/types/analysis";
import { CriterionDetail, STATUS_LABEL, STATUS_RING } from "./criterion-detail";

/**
 * The screenshot itself as the comparison surface.
 *
 * A flat list of criteria answers "what was measured". It does not answer
 * "where on the page, and who else has it" - a user has to read a code, then
 * go look. Here the box IS the question: hover (or tap) the spot on the
 * screenshot, and a panel opens RIGHT THERE with the full story for that
 * spot - description, rating against peers, evidence, and a crop of the same
 * spot on every peer. Clicking never sends the user looking for the "real"
 * answer somewhere else on the page; this panel IS the answer.
 *
 * Positioning is done in percentages of the ORIGINAL capture size, not
 * pixels, so it stays correct at any render width without a resize
 * observer - the overlay and the image scale together because both are
 * children of the same percentage-sized box.
 */

type Group = { key: string; box: Box; observations: Observation[] };

function dominantStatus(group: Observation[]): Status {
  const order: Status[] = ["PRESENT", "ABSENT", "UNKNOWN", "NOT_APPLICABLE"];
  const counts = new Map<Status, number>();
  for (const o of group) counts.set(o.status, (counts.get(o.status) ?? 0) + 1);
  return order.find((s) => counts.get(s) === Math.max(...counts.values())) ?? "UNKNOWN";
}

function boxKey(b: Box) {
  return `${Math.round(b.x)}:${Math.round(b.y)}:${Math.round(b.w)}:${Math.round(b.h)}`;
}

const PANEL_W = 420;

const LEGEND: Array<{ status: Status; dot: string }> = [
  { status: "PRESENT", dot: "bg-mint" },
  { status: "ABSENT", dot: "bg-peach" },
  { status: "UNKNOWN", dot: "bg-sky" },
  { status: "NOT_APPLICABLE", dot: "bg-muted-2" },
];

export function InteractiveScreenshot({ analysis }: { analysis: AnalysisData }) {
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(
    analysis.benchmark.width && analysis.benchmark.height
      ? { w: analysis.benchmark.width, h: analysis.benchmark.height }
      : null,
  );
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);
  const [containerPx, setContainerPx] = useState<{ w: number; h: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentBoxSize?.[0];
      setContainerPx(
        box
          ? { w: box.inlineSize, h: box.blockSize }
          : { w: entry.contentRect.width, h: entry.contentRect.height },
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [naturalSize]);

  const regionBoxById = useMemo(() => {
    const m = new Map<string, Box>();
    for (const r of analysis.regions) m.set(r.id, r.box);
    return m;
  }, [analysis.regions]);

  const groups = useMemo(() => {
    const byKey = new Map<string, Group>();
    for (const o of analysis.observations) {
      const box = o.evidence[0]?.box ?? (o.regionId ? regionBoxById.get(o.regionId) ?? null : null);
      if (!box || !naturalSize) continue;
      const key = boxKey(box);
      const existing = byKey.get(key);
      if (existing) existing.observations.push(o);
      else byKey.set(key, { key, box, observations: [o] });
    }
    return [...byKey.values()];
  }, [analysis.observations, regionBoxById, naturalSize]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPinnedKey(null);
    }
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPinnedKey(null);
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClickOutside);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClickOutside);
    };
  }, []);

  if (!naturalSize) {
    return (
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/files/${analysis.benchmark.imagePath}`}
          alt={analysis.benchmark.institution ?? "Ekran görüntüsü"}
          className="block w-full"
          onLoad={(e) => {
            const img = e.currentTarget;
            setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
          }}
        />
      </div>
    );
  }

  const activeKey = pinnedKey ?? hoverKey;
  const active = groups.find((g) => g.key === activeKey) ?? null;
  const isPinned = pinnedKey !== null;

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-[11px] text-muted-2">
          Ölçülen her nokta bir işaretçi. Üzerine gelin veya tıklayın: o noktadaki özelliğin
          açıklaması, muadillere göre durumu ve muadillerin aynı noktası burada açılır.
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          {LEGEND.map((l) => (
            <span key={l.status} className="flex items-center gap-1 text-[11px] text-muted-2">
              <span className={`h-2 w-2 rounded-full ${l.dot}`} />
              {STATUS_LABEL[l.status]}
            </span>
          ))}
        </div>
      </div>
      <div
        ref={containerRef}
        className="relative"
        style={{ aspectRatio: `${naturalSize.w} / ${naturalSize.h}` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/files/${analysis.benchmark.imagePath}`}
          alt={analysis.benchmark.institution ?? "Ekran görüntüsü"}
          className="absolute inset-0 h-full w-full rounded-lg object-contain"
        />

        {groups.map((g) => {
          const status = dominantStatus(g.observations);
          const left = (g.box.x / naturalSize.w) * 100;
          const top = (g.box.y / naturalSize.h) * 100;
          const width = (g.box.w / naturalSize.w) * 100;
          const height = (g.box.h / naturalSize.h) * 100;
          const isActive = g.key === activeKey;
          return (
            <div key={g.key}>
              {/* The actual measured box - only drawn while active, so the
                  resting state stays a quiet set of markers, not a page
                  covered in rectangles. */}
              {isActive && (
                <div
                  className="pointer-events-none absolute rounded-sm border-2 border-brand-400/80 bg-brand-400/10"
                  style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
                />
              )}
              <button
                type="button"
                onMouseEnter={() => setHoverKey(g.key)}
                onMouseLeave={() => setHoverKey((k) => (k === g.key ? null : k))}
                onClick={() => setPinnedKey((k) => (k === g.key ? null : g.key))}
                className={`absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-[10px] font-semibold text-ink shadow-sm transition-transform hover:scale-110 ${STATUS_RING[status]} ${
                  isActive ? "scale-110" : "animate-pulse"
                }`}
                style={{ left: `${left + width / 2}%`, top: `${top + height / 2}%` }}
              >
                {g.observations.length > 1 ? g.observations.length : ""}
              </button>
            </div>
          );
        })}

        {active && containerPx && (
          <div
            data-testid="criterion-popup"
            className="absolute z-20 max-h-[85vh] max-w-[90vw] space-y-4 overflow-y-auto rounded-xl border border-line bg-surface p-4 shadow-xl"
            style={{
              width: PANEL_W,
              left: Math.max(
                8,
                Math.min((active.box.x / naturalSize.w) * containerPx.w, containerPx.w - PANEL_W - 8),
              ),
              top: ((active.box.y + active.box.h) / naturalSize.h) * containerPx.h + 12,
            }}
            onMouseEnter={() => setHoverKey(active.key)}
            onMouseLeave={() => setHoverKey((k) => (k === active.key ? null : k))}
          >
            {isPinned && (
              <div className="-mx-4 -mt-4 mb-1 flex items-center justify-between border-b border-line bg-surface-2 px-3 py-1.5">
                <span className="text-[11px] text-muted-2">
                  {active.observations.length > 1 ? `${active.observations.length} ölçüt` : "Ölçüt"}{" "}
                  bu noktada
                </span>
                <button
                  type="button"
                  onClick={() => setPinnedKey(null)}
                  className="rounded-md px-1.5 py-0.5 text-xs text-muted hover:bg-surface-3 hover:text-ink"
                  aria-label="Kapat"
                >
                  ✕
                </button>
              </div>
            )}
            {active.observations.map((o, i) => (
              <div key={o.code} className={i > 0 ? "border-t border-line pt-4" : ""}>
                <CriterionDetail o={o} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
