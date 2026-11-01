"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PAGE_ROLE_LABEL, api, fetcher, type PageRole } from "@/components/projects/shared";

interface ProjectListItem {
  id: string;
  name: string;
  brief: string;
  pageTopic: string | null;
  pageRole: PageRole | null;
  viewport: string;
  jobState: string;
  jobKind: string | null;
  sector: { slug: string; name: string } | null;
  counts: { targets: number; excluded: number; done: number };
  createdAt: string;
}

const input =
  "w-full px-3 py-2 text-sm bg-surface-2 border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500";

function NewProjectForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [pageTopic, setPageTopic] = useState("");
  const [pageRole, setPageRole] = useState<"" | PageRole>("");
  const [viewport, setViewport] = useState<"DESKTOP" | "MOBILE">("DESKTOP");
  const [targetCount, setTargetCount] = useState(15);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const p = await api<{ id: string }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name,
          brief,
          pageTopic: pageTopic || null,
          pageRole: pageRole || null,
          viewport,
          targetCount,
        }),
      });
      router.push(`/projects/${p.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <h2 className="font-semibold text-ink">Yeni proje</h2>
        <p className="text-xs text-muted mt-1">
          Proje, hangi sayfaların karşılaştırılacağını tanımlar. Site listesi bir sonraki adımda oluşturulur.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-muted mb-1">Proje adı</label>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Kredi kartı landing sayfaları" required />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Ne karşılaştırılacak? (model bu metni okuyarak site önerir)</label>
            <textarea
              className={`${input} min-h-[80px]`}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Türkiye'deki bankaların kredi kartı başvuru/landing sayfaları. Dijital bankalar da dahil."
              required
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-muted mb-1">Sayfa konusu (boşsa tanımdan çıkarılır)</label>
              <input className={input} value={pageTopic} onChange={(e) => setPageTopic(e.target.value)} placeholder="kredi kartı" />
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
              <label className="block text-xs text-muted mb-1">Görünüm</label>
              <select className={input} value={viewport} onChange={(e) => setViewport(e.target.value as "DESKTOP" | "MOBILE")}>
                <option value="DESKTOP">Masaüstü (1440px)</option>
                <option value="MOBILE">Mobil (390px)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Önerilecek site sayısı</label>
              <input type="number" min={1} max={40} className={input} value={targetCount} onChange={(e) => setTargetCount(Number(e.target.value))} />
            </div>
          </div>
          {error && <p className="text-sm text-rose">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" onClick={onCancel}>Vazgeç</Button>
            <Button type="submit" disabled={busy}>{busy ? "Oluşturuluyor..." : "Projeyi oluştur"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ProjectsPage() {
  const { data, isLoading } = useSWR<ProjectListItem[]>("/api/projects", fetcher);
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Projeler</h1>
          <p className="text-sm text-muted mt-1">
            Her proje bir benchmark çalışmasıdır: site listesi, yakalamalar ve karşılaştırmalı analiz.
          </p>
        </div>
        {!creating && <Button onClick={() => setCreating(true)}>Yeni proje</Button>}
      </div>

      {creating && <NewProjectForm onCancel={() => setCreating(false)} />}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      )}

      {data && data.length === 0 && !creating && (
        <Card>
          <CardContent className="py-12 text-center text-muted text-sm">
            Henüz proje yok. &quot;Yeni proje&quot; ile başlayın.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data?.map((p) => (
          <Link key={p.id} href={`/projects/${p.id}`}>
            <Card className="hover:border-line-strong transition-colors h-full">
              <CardContent>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-ink">{p.name}</h3>
                  {p.jobState === "RUNNING" && <Badge variant="info">Çalışıyor</Badge>}
                </div>
                <p className="text-sm text-ink-2 mt-1 line-clamp-2">{p.brief}</p>
                <div className="flex flex-wrap gap-2 mt-3 text-xs">
                  {p.sector && <Badge>{p.sector.name}</Badge>}
                  {p.pageTopic && <Badge>{p.pageTopic}</Badge>}
                  {p.pageRole && <Badge>{PAGE_ROLE_LABEL[p.pageRole]}</Badge>}
                  <Badge>{p.viewport === "MOBILE" ? "Mobil" : "Masaüstü"}</Badge>
                </div>
                <p className="text-xs text-muted mt-3">
                  {p.counts.targets} site · {p.counts.done} analiz edildi
                  {p.counts.excluded > 0 && ` · ${p.counts.excluded} hariç`}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
