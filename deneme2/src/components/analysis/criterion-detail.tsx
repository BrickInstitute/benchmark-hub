"use client";

import type { CSSProperties } from "react";
import type { Observation, PeerObservation, Status } from "@/types/analysis";

/**
 * One criterion's full story, in one place.
 *
 * This is deliberately the ONLY place that renders a criterion's detail -
 * both the screenshot hotspot popup and the flat list below use this exact
 * component, so neither can drift into showing a thinner or different story
 * than the other. A single raw status word ("Var.") answered nothing; this
 * answers what it is, how it compares, and shows it.
 */

export const STATUS_LABEL: Record<Status, string> = {
  PRESENT: "Var",
  ABSENT: "Yok",
  UNKNOWN: "Belirsiz",
  NOT_APPLICABLE: "Kapsam dışı",
};

export const STATUS_CHIP: Record<Status, string> = {
  PRESENT: "bg-mint-dim text-mint",
  ABSENT: "bg-peach-dim text-peach",
  UNKNOWN: "bg-sky-dim text-sky",
  NOT_APPLICABLE: "bg-surface-3 text-muted",
};

export const STATUS_RING: Record<Status, string> = {
  PRESENT: "border-mint bg-mint-dim",
  ABSENT: "border-peach bg-peach-dim",
  UNKNOWN: "border-sky bg-sky-dim",
  NOT_APPLICABLE: "border-line-strong bg-surface-3",
};

export function Ladder({ steps, value }: { steps: string[]; value: string | null }) {
  if (steps.length < 3 || !value) return null;
  const index = steps.indexOf(value);
  if (index < 0) return null;
  return (
    <div className="mt-2 flex items-center gap-1">
      {steps.map((s, i) => (
        <span
          key={s}
          title={s}
          className={`h-1.5 w-6 rounded-full ${i === index ? "bg-brand-400" : "bg-surface-3"}`}
        />
      ))}
      <span className="ml-2 text-xs text-muted">{value}</span>
    </div>
  );
}

/** The raw, neutral "who has what" bars - always shown, regardless of
 * whether a verdict (Rating) could also be computed. Prevalence is a fact;
 * a verdict is an interpretation of it, and interpretations can be missing. */
export function CohortBars({ o }: { o: Observation }) {
  const { denominator, rows, excluded, coverage } = o.cohort;
  if (denominator === 0) {
    return (
      <p className="text-xs text-muted-2">Bu ölçüt için karşılaştırılabilir muadil kaydı yok.</p>
    );
  }
  return (
    <div className="space-y-1.5">
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
                className={`block h-full rounded-full ${mine ? "bg-brand-400" : "bg-line-strong"}`}
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

/**
 * The verdict sentence. Only renders when the dictionary has a reviewed
 * opinion about direction AND at least 5 peers could actually be compared -
 * below that, computeRating() (route.ts) already returned null and this
 * renders nothing rather than guess.
 */
function RatingLine({ o }: { o: Observation }) {
  const r = o.rating;
  if (!r) return null;
  const verb =
    r.percentile >= 70 ? "iyi bir konumda" : r.percentile >= 40 ? "ortalama düzeyde" : "geride";
  return (
    <div className="rounded-lg border border-brand-400/30 bg-brand-400/5 p-3">
      <p className="text-sm font-medium text-ink">
        Ölçülebilen {r.comparableCount} muadile göre {verb}:{" "}
        <span className="font-semibold text-brand-300">%{r.percentile}</span> yüzdelik dilim
      </p>
      <p className="mt-1 text-[11px] text-muted-2">
        {r.peersWorseCount} muadilden daha iyi · {r.peersSameCount} muadille aynı seviyede ·{" "}
        {r.peersBetterCount} muadilden geride
      </p>
    </div>
  );
}

const CROP_W = 128;
const CROP_H = 76;

/** A small window of the peer's OWN screenshot, zoomed to the spot where it
 * has (or lacks) the same feature. Pure CSS - no server-side cropping. */
function peerCropStyle(peer: PeerObservation): CSSProperties {
  const src = `/api/files/${peer.image.path}`;
  if (!peer.box || !peer.image.width || !peer.image.height) {
    return { backgroundImage: `url(${src})`, backgroundSize: "cover", backgroundPosition: "top center" };
  }
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
          peer.status === "PRESENT" ? "bg-mint" : peer.status === "ABSENT" ? "bg-peach" : "bg-sky"
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

export function PeerGallery({ peers }: { peers: PeerObservation[] }) {
  if (peers.length === 0) {
    return <p className="text-[11px] text-muted-2">Karşılaştırılabilir muadil kaydı yok.</p>;
  }
  const present = peers.filter((p) => p.status === "PRESENT");
  const others = peers.filter((p) => p.status !== "PRESENT");
  return (
    <div>
      <p className="mb-1.5 text-[11px] text-muted-2">
        {present.length}/{peers.length} muadilde var - muadilin kendi sayfasının aynı noktası
      </p>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {[...present, ...others].map((p) => (
          <PeerCard key={p.benchmarkId} peer={p} />
        ))}
      </div>
    </div>
  );
}

export function CriterionDetail({ o }: { o: Observation }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-muted">
              {o.code}
            </span>
            {o.regionName && (
              <span className="rounded bg-lavender-dim px-1.5 py-0.5 text-[11px] text-lavender">
                {o.regionName}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm font-medium text-ink">{o.question}</p>
          {o.description && <p className="mt-1 text-sm text-ink-2">{o.description}</p>}
        </div>
        <span
          className={`shrink-0 rounded-lg px-2.5 py-1 text-xs ${STATUS_CHIP[o.status]} ${
            o.awaitingConfirmation ? "opacity-45 line-through decoration-1" : ""
          }`}
          title={o.awaitingConfirmation ? "Teyit bekliyor, yayınlanmıyor" : undefined}
        >
          {STATUS_LABEL[o.status]}
          {o.rawCount !== null && ` · ${o.rawCount}`}
        </span>
      </div>

      <Ladder steps={o.steps} value={o.value} />

      {o.evidence.length > 0 && (
        <div className="rounded-lg border border-line bg-surface-2 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-2">Kanıt</p>
          {o.evidence.map((e, i) => (
            <p key={i} className="mt-1 text-sm text-ink-2">
              “{e.text.slice(0, 180)}”
              <span className="ml-2 text-[11px] text-muted-2">
                {e.source === "DOM_ELEMENT" ? "DOM öğesi" : "model alıntısı"}
                {e.ambiguous && " · birden çok yerde geçiyor"}
              </span>
            </p>
          ))}
        </div>
      )}

      {o.note && (
        <p className="text-xs text-sky">
          {o.note}
          {o.awaitingConfirmation && " · model teyidi bekliyor, yayınlanmıyor"}
        </p>
      )}
      {!o.note && o.awaitingConfirmation && (
        <p className="text-xs text-sky">Model teyidi bekliyor, yayınlanmıyor.</p>
      )}

      <RatingLine o={o} />
      <CohortBars o={o} />
      <PeerGallery peers={o.peers} />
    </div>
  );
}
