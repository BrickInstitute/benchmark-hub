"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  RESOLVE_LABEL,
  RUN_LABEL,
  api,
  type ProjectDetail,
  type RunState,
  type Target,
} from "./shared";

const input =
  "px-3 py-2 text-sm bg-surface-2 border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500";

const RUN_VARIANT: Record<RunState, "default" | "success" | "warning" | "danger" | "info"> = {
  IDLE: "default",
  QUEUED: "info",
  CAPTURING: "info",
  ANALYZING: "info",
  DONE: "success",
  FAILED: "danger",
};

function TargetRow({
  t,
  projectId,
  busy,
  onChange,
}: {
  t: Target;
  projectId: string;
  busy: boolean;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(t.url ?? "");
  const [name, setName] = useState(t.institution);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: object) {
    setError(null);
    try {
      await api(`/api/projects/${projectId}/targets/${t.id}`, { method: "PATCH", body: JSON.stringify(body) });
      onChange();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  async function remove() {
    if (!confirm(`${t.institution} listeden silinsin mi?`)) return;
    await api(`/api/projects/${projectId}/targets/${t.id}`, { method: "DELETE" }).catch(() => {});
    onChange();
  }

  const thumb = t.benchmark?.thumbnailPath ? `/api/files/${t.benchmark.thumbnailPath}` : null;
  const note = t.runNote ?? (t.resolveState === "FAILED" ? t.resolveNote : null);

  return (
    <tr className={cn("border-t border-line align-top", !t.included && "opacity-50")}>
      <td className="py-3 pr-3">
        <input
          type="checkbox"
          checked={t.included}
          disabled={busy && t.runState !== "IDLE" && t.runState !== "DONE" && t.runState !== "FAILED"}
          onChange={(e) => patch({ included: e.target.checked })}
          title={t.included ? "Hariç tut" : "Dahil et"}
          className="mt-1 accent-[var(--color-brand-400)]"
        />
      </td>
      <td className="py-3 pr-3 w-24">
        {thumb ? (
          <Link href={`/benchmarks/${t.benchmark!.id}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb} alt="" className="w-24 h-14 object-cover object-top rounded border border-line" />
          </Link>
        ) : (
          <div className="w-24 h-14 rounded border border-dashed border-line" />
        )}
      </td>
      <td className="py-3 pr-3">
        {editing ? (
          <div className="space-y-2">
            <input className={cn(input, "w-full")} value={name} onChange={(e) => setName(e.target.value)} />
            <input className={cn(input, "w-full")} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://... (boş bırakırsanız adres yeniden aranır)" />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  const ok = await patch({
                    ...(name !== t.institution ? { institution: name } : {}),
                    ...(url !== (t.url ?? "") ? { url } : {}),
                  });
                  if (ok) setEditing(false);
                }}
              >
                Kaydet
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setUrl(t.url ?? ""); setName(t.institution); }}>
                Vazgeç
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="font-medium text-ink">{t.institution}</span>
              <span className="text-xs text-muted">{t.domain}</span>
              {t.source === "AI_SUGGESTED" ? <Badge variant="info">öneri</Badge> : <Badge>elle</Badge>}
            </div>
            {t.url ? (
              <a href={t.url} target="_blank" rel="noreferrer" className="text-xs text-brand-300 hover:underline break-all">
                {t.url}
              </a>
            ) : (
              <span className="text-xs text-muted">{RESOLVE_LABEL[t.resolveState]}</span>
            )}
            {t.resolveNote && t.resolveState !== "FAILED" && (
              <p className="text-xs text-muted-2 mt-0.5">{t.resolveNote}</p>
            )}
            {t.rationale && <p className="text-xs text-muted-2 mt-0.5">Neden: {t.rationale}</p>}
          </>
        )}
        {error && <p className="text-xs text-rose mt-1">{error}</p>}
      </td>
      <td className="py-3 pr-3 whitespace-nowrap">
        <Badge variant={RUN_VARIANT[t.runState]}>{RUN_LABEL[t.runState]}</Badge>
        {t.resolveState === "FAILED" && !t.url && (
          <div className="mt-1"><Badge variant="warning">adres yok</Badge></div>
        )}
        {note && <p className="text-xs text-peach mt-1 max-w-[260px] whitespace-normal">{note}</p>}
        {t.benchmark?.pageAnalysis?.status === "SKIPPED" && t.runState === "DONE" && (
          <p className="text-xs text-muted mt-1 max-w-[260px] whitespace-normal">{t.benchmark.pageAnalysis.note}</p>
        )}
      </td>
      <td className="py-3 text-right whitespace-nowrap">
        {!editing && (
          <>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Düzenle</Button>
            <Button size="sm" variant="ghost" onClick={remove}>Sil</Button>
          </>
        )}
      </td>
    </tr>
  );
}

export function TargetList({ project, onChange }: { project: ProjectDetail; onChange: () => void }) {
  const [addInput, setAddInput] = useState("");
  const [addName, setAddName] = useState("");
  const [count, setCount] = useState(project.targetCount);
  const [error, setError] = useState<string | null>(null);
  const busy = project.jobState === "RUNNING";

  async function call(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const included = project.targets.filter((t) => t.included);
  const ready = included.filter((t) => t.url);
  const pendingResolve = included.filter((t) => !t.url && t.resolveState === "PENDING");
  const notDone = ready.filter((t) => t.runState !== "DONE");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-ink">1. Site listesi</h2>
          <p className="text-xs text-muted mt-1">
            Model önerir, liste sizindir. Önerileri hariç tutun ya da silin, eksik siteleri ekleyin, yanlış bulunan
            sayfa adreslerini düzeltin. Hariç tutulan öneri bir sonraki öneride geri gelmez; silinen gelebilir.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-end gap-2">
              <div>
                <label className="block text-xs text-muted mb-1">Kaç site önerilsin</label>
                <input type="number" min={1} max={40} className={cn(input, "w-24")} value={count} onChange={(e) => setCount(Number(e.target.value))} />
              </div>
              <Button
                disabled={busy || !project.modelAvailable}
                title={project.modelAvailable ? undefined : "ANTHROPIC_API_KEY tanımlı değil"}
                onClick={() => call(() => api(`/api/projects/${project.id}/discover`, { method: "POST", body: JSON.stringify({ count }) }))}
              >
                {project.targets.length ? "Daha fazla site öner" : "Site öner"}
              </Button>
            </div>
            <div className="flex-1" />
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                call(async () => {
                  await api(`/api/projects/${project.id}/targets`, {
                    method: "POST",
                    body: JSON.stringify({ input: addInput, institution: addName || undefined }),
                  });
                  setAddInput("");
                  setAddName("");
                });
              }}
            >
              <div>
                <label className="block text-xs text-muted mb-1">Site ekle (alan adı ya da tam adres)</label>
                <input className={cn(input, "w-72")} value={addInput} onChange={(e) => setAddInput(e.target.value)} placeholder="enpara.com ya da https://..." />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Kurum adı (isteğe bağlı)</label>
                <input className={cn(input, "w-40")} value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Enpara" />
              </div>
              <Button type="submit" variant="secondary" disabled={!addInput.trim()}>Ekle</Button>
            </form>
          </div>

          {error && <p className="text-sm text-rose">{error}</p>}

          {project.targets.length === 0 ? (
            <p className="text-sm text-muted py-6 text-center">
              Liste boş. &quot;Site öner&quot; ile başlayın ya da siteleri elle ekleyin.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="pb-2 pr-3 font-normal">Dahil</th>
                    <th className="pb-2 pr-3 font-normal" />
                    <th className="pb-2 pr-3 font-normal">Kurum / sayfa</th>
                    <th className="pb-2 pr-3 font-normal">Durum</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {project.targets.map((t) => (
                    <TargetRow key={t.id} t={t} projectId={project.id} busy={busy} onChange={onChange} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-ink">2. Yakalama ve analiz</h2>
          <p className="text-xs text-muted mt-1">
            Listedeki her sayfanın ekran görüntüsü alınır, kalite kapısından geçirilir; hero, modüller, değer
            önerileri ve sektör ölçütleri analiz edilir. Site başına yaklaşık 1 dakika sürer.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-ink-2">
            {included.length} dahil site · {ready.length} adresi hazır · {notDone.length} çalıştırılmayı bekliyor
          </span>
          <div className="flex-1" />
          {pendingResolve.length > 0 && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => call(() => api(`/api/projects/${project.id}/resolve`, { method: "POST" }))}
            >
              {pendingResolve.length} sitenin adresini bul
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={busy || notDone.length === 0}
            title="Model çağrısı yapmaz: yalnızca ekran görüntüsü ve yazılımın kendi ölçtükleri"
            onClick={() => call(() => api(`/api/projects/${project.id}/run`, { method: "POST", body: JSON.stringify({ mode: "capture_only" }) }))}
          >
            Sadece yakala
          </Button>
          <Button
            disabled={busy || notDone.length === 0 || !project.modelAvailable}
            title={project.modelAvailable ? undefined : "ANTHROPIC_API_KEY tanımlı değil"}
            onClick={() => call(() => api(`/api/projects/${project.id}/run`, { method: "POST", body: JSON.stringify({ mode: "full" }) }))}
          >
            Analizi başlat ({notDone.length})
          </Button>
          <Button
            variant="ghost"
            disabled={busy || ready.length === 0 || !project.modelAvailable}
            onClick={() => {
              if (confirm("Tamamlanmış siteler dahil hepsi yeniden yakalanıp analiz edilsin mi?")) {
                call(() => api(`/api/projects/${project.id}/run`, { method: "POST", body: JSON.stringify({ mode: "full", force: true }) }));
              }
            }}
          >
            Hepsini yeniden çalıştır
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
