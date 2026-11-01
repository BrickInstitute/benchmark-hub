"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { TargetList } from "@/components/projects/target-list";
import { ProjectResults } from "@/components/projects/project-results";
import { ProjectSettings } from "@/components/projects/project-settings";
import { JOB_LABEL, PAGE_ROLE_LABEL, fetcher, type ProjectDetail } from "@/components/projects/shared";

type Tab = "list" | "results" | "settings";

export default function ProjectPage({ params }: { params: { id: string } }) {
  const [tab, setTab] = useState<Tab>("list");
  const { data: project, error, mutate } = useSWR<ProjectDetail>(`/api/projects/${params.id}`, fetcher, {
    // Poll while a background job is running; stop when idle.
    refreshInterval: (p) => (p?.jobState === "RUNNING" ? 3000 : 0),
  });

  if (error) return <p className="text-rose text-sm">{String(error.message ?? error)}</p>;
  if (!project) return <Skeleton className="h-96 w-full rounded-xl" />;

  const running = project.jobState === "RUNNING";
  // Results refetch when the run progresses.
  const refreshKey = project.targets.map((t) => `${t.id}:${t.runState}`).join(",");

  return (
    <div className="space-y-4">
      <div>
        <Link href="/projects" className="text-xs text-muted hover:text-ink-2">← Projeler</Link>
        <h1 className="text-2xl font-bold text-ink mt-1">{project.name}</h1>
        <p className="text-sm text-ink-2 mt-1 max-w-3xl">{project.brief}</p>
        <div className="flex flex-wrap gap-2 mt-2">
          {project.sector ? <Badge>{project.sector.name}</Badge> : <Badge variant="warning">sektör henüz belirlenmedi</Badge>}
          {project.pageTopic && <Badge>{project.pageTopic}</Badge>}
          {project.pageRole && <Badge>{PAGE_ROLE_LABEL[project.pageRole]}</Badge>}
          <Badge>{project.viewport === "MOBILE" ? "Mobil" : "Masaüstü"}</Badge>
          <Badge>{project.country}</Badge>
          {!project.modelAvailable && <Badge variant="warning">ANTHROPIC_API_KEY yok: öneri ve analiz kapalı</Badge>}
        </div>
      </div>

      {project.jobKind && project.jobState !== "IDLE" && (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            running && "border-sky-dim bg-sky-dim/40 text-sky",
            project.jobState === "DONE" && "border-mint-dim bg-mint-dim/30 text-mint",
            project.jobState === "FAILED" && "border-rose-dim bg-rose-dim/30 text-rose",
          )}
        >
          <span className="font-medium">{JOB_LABEL[project.jobKind] ?? project.jobKind}</span>
          {running ? " çalışıyor" : project.jobState === "DONE" ? " tamamlandı" : " başarısız"}
          {project.jobNote && <span className="text-ink-2"> · {project.jobNote}</span>}
        </div>
      )}

      <div className="flex gap-1 border-b border-line">
        {(
          [
            ["list", `Site listesi (${project.targets.filter((t) => t.included).length})`],
            ["results", "Sonuçlar"],
            ["settings", "Ayarlar"],
          ] as Array<[Tab, string]>
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "px-4 py-2 text-sm -mb-px border-b-2",
              tab === k ? "border-brand-400 text-ink" : "border-transparent text-muted hover:text-ink-2",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "list" && <TargetList project={project} onChange={() => mutate()} />}
      {tab === "results" && <ProjectResults projectId={project.id} refreshKey={refreshKey} />}
      {tab === "settings" && <ProjectSettings project={project} onChange={() => mutate()} />}
    </div>
  );
}
