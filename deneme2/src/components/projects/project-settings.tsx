"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PAGE_ROLE_LABEL, api, type PageRole, type ProjectDetail } from "./shared";

const input =
  "w-full px-3 py-2 text-sm bg-surface-2 border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500";

export function ProjectSettings({ project, onChange }: { project: ProjectDetail; onChange: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [brief, setBrief] = useState(project.brief);
  const [pageTopic, setPageTopic] = useState(project.pageTopic ?? "");
  const [pageRole, setPageRole] = useState<PageRole | "">(project.pageRole ?? "");
  const [sectorSlug, setSectorSlug] = useState(project.sector?.slug ?? "");
  const [viewport, setViewport] = useState(project.viewport);
  const [targetCount, setTargetCount] = useState(project.targetCount);
  const [msg, setMsg] = useState<string | null>(null);
  const busy = project.jobState === "RUNNING";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await api(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          brief,
          pageTopic: pageTopic || null,
          pageRole: pageRole || null,
          sectorSlug: sectorSlug || null,
          viewport,
          targetCount,
        }),
      });
      setMsg("Kaydedildi.");
      onChange();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    }
  }

  async function remove() {
    if (!confirm("Proje ve site listesi silinsin mi? Yakalanan ekran görüntüleri Benchmarks altında kalır.")) return;
    await api(`/api/projects/${project.id}`, { method: "DELETE" });
    router.push("/projects");
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-ink">Proje ayarları</h2>
        <p className="text-xs text-muted mt-1">
          Sayfa konusu, türü, sektör ya da görünüm değişirse mevcut sonuçlar kendiliğinden yeniden yorumlanmaz;
          tutarlılık için &quot;Hepsini yeniden çalıştır&quot; kullanın.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="block text-xs text-muted mb-1">Proje adı</label>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Tanım</label>
            <textarea className={`${input} min-h-[80px]`} value={brief} onChange={(e) => setBrief(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-muted mb-1">Sayfa konusu</label>
              <input className={input} value={pageTopic} onChange={(e) => setPageTopic(e.target.value)} placeholder="ilk öneride tanımdan çıkarılır" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Sayfa türü</label>
              <select className={input} value={pageRole} onChange={(e) => setPageRole(e.target.value as PageRole | "")}>
                <option value="">Tanımdan çıkarılsın</option>
                {Object.entries(PAGE_ROLE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Sektör (ölçüt kataloğunu belirler)</label>
              <select className={input} value={sectorSlug} onChange={(e) => setSectorSlug(e.target.value)}>
                <option value="">Tanımdan çıkarılsın</option>
                {project.sectors.map((s) => (
                  <option key={s.slug} value={s.slug}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Görünüm</label>
              <select className={input} value={viewport} onChange={(e) => setViewport(e.target.value as "DESKTOP" | "MOBILE")}>
                <option value="DESKTOP">Masaüstü (1440px)</option>
                <option value="MOBILE">Mobil (390px)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Varsayılan öneri sayısı</label>
              <input type="number" min={1} max={40} className={input} value={targetCount} onChange={(e) => setTargetCount(Number(e.target.value))} />
            </div>
          </div>
          {msg && <p className="text-sm text-ink-2">{msg}</p>}
          <div className="flex justify-between">
            <Button type="button" variant="danger" disabled={busy} onClick={remove}>Projeyi sil</Button>
            <Button type="submit" disabled={busy}>Kaydet</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
