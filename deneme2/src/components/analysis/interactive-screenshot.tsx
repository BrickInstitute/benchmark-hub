"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { AnalysisData, Box, Observation, PeerObservation, Status } from "@/types/analysis";

/**
 * The screenshot itself as the comparison surface.
 *
 * A flat list of criteria answers "what was measured". It does not answer
 * "where on the page, and who else has it" - a user has to read a code, then
 * go look. Here the box IS the question: hover (or tap) the spot on the
 * screenshot, and the popup shows this institution's status plus a crop of
 * the same spot on every peer that has an observation for it.
 *
 * Positioning is done in percentages of the ORIGINAL capture size, not
 * pixels, so it stays correct at any render width without a resize
 * observer - the overlay and the image scale together because both are
 * children of the same percentage-sized box.
 */

type Group = { key: string; box: Box; observations: Observation[] };

const STATUS_RING: Record<Status, string> = {
  PRESENT: "border-mint bg-mint-dim",
  ABSENT: "border-peach bg-peach-dim",
  UNKNOWN: "border-sky bg-sky-dim",
  NOT_APPLICABLE: "border-line-strong bg-surface-3",
};

const STATUS_LABEL: Record<Status, string> = {
  PRESENT: "Var",
  ABSENT: "Yok",
  UNKNOWN: "Belirsiz",
  NOT_APPLICABLE: "Kapsam dışı",
};

function dominantStatus(group: Observation[]): Status {
  const order: Status[] = ["PRESENT", "ABSENT", "UNKNOWN", "NOT_APPLICABLE"];
  const counts = new Map<Status, number>();
  for (const o of group) counts.set(o.status, (counts.get(o.status) ?? 0) + 1);
  return order.find((s) => counts.get(s) === Math.max(...counts.values())) ?? "UNKNOWN";
}

function boxKey(b: Box) {
  return `${Math.round(b.x)}:${Math.round(b.y)}:${Math.round(b.w)}:${Math.round(b.h)}`;
}

const CROP_W = 128;
const CROP_H = 76;
const POPUP_W = 352; // matches the w-[22rem] class on the popup

/** A small window of the peer's OWN screenshot, zoomed to the spot where it
 * has (or lacks) the same feature. Pure CSS - no server-side cropping. */
function peerCropStyle(peer: PeerObservation): CSSProperties {
  const src = `/api/files/${peer.image.path}`;
  if (!peer.box || !peer.image.width || !peer.image.height) {
    return {
      backgroundImage: `url(${src})`,
      backgroundSize: "cover",
      backgroundPosition: "top center",
    };
  }
  // Show roughly 2.2x the box's own height of surrounding context, centred
  // on the box, so the crop reads as "this part of the page" rather than a
  // meaningless sliver.
  const scale = CROP_H / (peer.box.h * 2.2 || peer.image.height);
  const bgW = peer.image.width * scale;
  const bgH = peer.image.height * scale;
  const cx = (peer.box.x + peer.box.w / 2) * scale;
  const cy = (peer.box.y + peer.box.h / 2) * scale;
  return {
    backgroundImage: `url(${src})`,
    backgroundSize: `${bgW}px ${bgH}px`,
    backgroundPosition: `${-(cx - CROP_W / 2)}px ${-(cy - CROP_H / 2)}px`,
    backgroundRepeat: "no-repeat",
  };
}

function PeerCard({ peer }: { peer: PeerObservation }) {
  return (
    <a
      href={`/benchmarks/${peer.benchmarkId}`}
      target="_blank"
      rel="noreferrer"
      title={`${peer.institution} · ${STATUS_LABEL[peer.status]}${peer.value ? ` · ${peer.value}` : ""}`}
      className="group/peer relative block shrink-0 overflow-hidden rounded-md border border-line bg-surface-3"
      style={{ width: CROP_W, height: CROP_H }}
    >
      <span className="absolute inset-0" style={peerCropStyle(peer)} />
      <span
        className={`absolute right-1 top-1 h-2 w-2 rounded-full ${
          peer.status === "PRESENT"
            ? "bg-mint"
            : peer.status === "ABSENT"
              ? "bg-peach"
              : "bg-sky"
        }`}
      />
      <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-[10px] leading-tight text-white">
        {peer.institution}
      </span>
      <span className="absolute inset-0 hidden items-center justify-center bg-black/40 text-[10px] text-white group-hover/peer:flex">
        Sayfayı aç ↗
      </span>
    </a>
  );
}

function CriterionPopupSection({ o }: { o: Observation }) {
  const present = o.peers.filter((p) => p.status === "PRESENT");
  const others = o.peers.filter((p) => p.status !== "PRESENT");
  return (
    <div className="border-t border-line pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-muted">
            {o.code}
          </span>
          <p className="mt-1 text-xs font-medium text-ink">{o.question}</p>
        </div>
        <span
          className={`shrink-0 rounded-lg border px-2 py-0.5 text-[11px] ${STATUS_RING[o.status]}`}
        >
          {STATUS_LABEL[o.status]}
          {o.value && ` · ${o.value}`}
        </span>
      </div>

      {o.peers.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted-2">Karşılaştırılabilir muadil kaydı yok.</p>
      ) : (
        <>
          <p className="mb-1.5 mt-2 text-[11px] text-muted-2">
            {present.length}/{o.peers.length} muadilde var
          </p>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {[...present, ...others].map((p) => (
              <PeerCard key={p.benchmarkId} peer={p} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

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

  function focusListEntries(group: Group) {
    for (const o of group.observations) {
      const el = document.getElementById(`obs-${o.code}`);
      if (!el) continue;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-brand-400");
      setTimeout(() => el.classList.remove("ring-2", "ring-brand-400"), 1600);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <p className="mb-2 px-1 text-[11px] text-muted-2">
        Ekran görüntüsündeki noktaların üzerine gelin: her biri bu özelliği hangi muadillerde
        bulduğumuzu gösterir. Tıklayınca aşağıdaki listede ilgili ölçüte iner.
      </p>
      <div ref={containerRef} className="relative" style={{ aspectRatio: `${naturalSize.w} / ${naturalSize.h}` }}>
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
                onClick={() => {
                  setPinnedKey((k) => (k === g.key ? null : g.key));
                  focusListEntries(g);
                }}
                className={`absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-[10px] font-semibold text-ink shadow-sm transition-transform hover:scale-110 ${STATUS_RING[status]} ${isActive ? "scale-110" : ""}`}
                style={{ left: `${left + width / 2}%`, top: `${top + height / 2}%` }}
              >
                {g.observations.length > 1 ? g.observations.length : ""}
              </button>
            </div>
          );
        })}

        {active && containerPx && (
          <div
            className="absolute z-20 w-[22rem] max-w-[85vw] space-y-3 rounded-xl border border-line bg-surface p-4 shadow-xl"
            style={{
              left: Math.max(
                8,
                Math.min(
                  (active.box.x / naturalSize.w) * containerPx.w,
                  containerPx.w - POPUP_W - 8,
                ),
              ),
              top: ((active.box.y + active.box.h) / naturalSize.h) * containerPx.h + 12,
            }}
            onMouseEnter={() => setHoverKey(active.key)}
            onMouseLeave={() => setHoverKey((k) => (k === active.key ? null : k))}
          >
            {active.observations.map((o) => (
              <CriterionPopupSection key={o.code} o={o} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
