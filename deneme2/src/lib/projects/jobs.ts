/**
 * Background jobs for projects.
 *
 * A project run captures 15+ sites and makes two model calls per site; that
 * takes many minutes and cannot live inside one HTTP request. So an API route
 * starts a job and returns immediately; the job writes its progress to the
 * database (Project.job*, ProjectTarget.resolveState / runState) and the UI
 * polls.
 *
 * Jobs run inside the Next.js server process. That is enough for a single
 * Railway instance, with two consequences handled here:
 *   - one job per project at a time (in-memory registry + DB state)
 *   - a restart kills running jobs silently; reconcile() notices a project
 *     whose DB state says RUNNING while no job exists in this process, and
 *     marks it interrupted instead of leaving it "running" forever
 * Running more than one app instance would break the registry - see
 * docs/projeler.md before scaling out.
 */
import type { Project } from "@prisma/client";
import { prisma } from "../db";
import { analyze } from "../measurement/analyze";
import { generateSectorCatalogue } from "../measurement/catalogue-generation";
import type { TargetIdentity } from "../measurement/peer-discovery";
import { getStorageProvider } from "../storage/storage-provider";
import {
  interpretBrief,
  proposeInstitutions,
  resolveTargetPage,
  topicMatches,
  type BriefReading,
} from "./discovery";
import { describePage, savePageAnalysis } from "./page-analysis";

export type JobKind = "discover" | "resolve" | "run";

export interface RunOptions {
  /** Re-run targets that already have a result. */
  force?: boolean;
  /** Restrict the run to these targets. */
  targetIds?: string[];
  /**
   * "full": capture + criteria + descriptive analysis (two model calls/site).
   * "capture_only": capture + deterministic criteria, no model calls. Useful
   * to check the list cheaply before spending on the full run.
   */
  mode?: "full" | "capture_only";
}

const g = globalThis as unknown as { __bhProjectJobs?: Map<string, JobKind> };
const running: Map<string, JobKind> = (g.__bhProjectJobs ??= new Map());

export class JobConflictError extends Error {}

export function activeJob(projectId: string): JobKind | null {
  return running.get(projectId) ?? null;
}

function hasModel(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Fixes DB state left behind by a job that died with the server. */
export async function reconcile(projectId: string): Promise<void> {
  if (running.has(projectId)) return;
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { jobState: true } });
  if (p?.jobState !== "RUNNING") return;
  await prisma.$transaction([
    prisma.project.update({
      where: { id: projectId },
      data: {
        jobState: "FAILED",
        jobNote: "İş yarıda kaldı (sunucu yeniden başlamış olabilir). Yeniden başlatın; tamamlananlar korunur.",
        jobFinishedAt: new Date(),
      },
    }),
    prisma.projectTarget.updateMany({
      where: { projectId, resolveState: "RESOLVING" },
      data: { resolveState: "PENDING" },
    }),
    prisma.projectTarget.updateMany({
      where: { projectId, runState: { in: ["QUEUED", "CAPTURING", "ANALYZING"] } },
      data: { runState: "IDLE", runNote: "önceki çalıştırma yarıda kaldı" },
    }),
  ]);
}

/**
 * Starts `work` in the background. Throws JobConflictError synchronously-ish
 * (before anything runs) if the project already has a job.
 */
async function startJob(
  projectId: string,
  kind: JobKind,
  work: (progress: (note: string) => Promise<void>) => Promise<string>,
): Promise<void> {
  await reconcile(projectId);
  if (running.has(projectId)) {
    throw new JobConflictError(`bu projede zaten bir iş çalışıyor (${running.get(projectId)})`);
  }
  running.set(projectId, kind);
  await prisma.project.update({
    where: { id: projectId },
    data: { jobKind: kind, jobState: "RUNNING", jobNote: null, jobStartedAt: new Date(), jobFinishedAt: null },
  });

  const progress = async (note: string) => {
    await prisma.project.update({ where: { id: projectId }, data: { jobNote: note } });
  };

  void (async () => {
    try {
      const summary = await work(progress);
      await prisma.project.update({
        where: { id: projectId },
        data: { jobState: "DONE", jobNote: summary, jobFinishedAt: new Date() },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[project ${projectId}] ${kind} failed:`, e);
      await prisma.project
        .update({
          where: { id: projectId },
          data: { jobState: "FAILED", jobNote: message, jobFinishedAt: new Date() },
        })
        .catch(() => {});
    } finally {
      running.delete(projectId);
    }
  })();
}

// ---------------------------------------------------------------------------
// Brief reading / sector
// ---------------------------------------------------------------------------

/**
 * The project's sector, topic and role. Fields the user already set win; the
 * model fills only what is missing, and only once - the result is saved.
 */
async function ensureReading(project: Project): Promise<BriefReading> {
  let sector = project.sectorId
    ? await prisma.sector.findUnique({ where: { id: project.sectorId } })
    : null;

  if (sector && project.pageTopic && project.pageRole) {
    return {
      sectorName: sector.name,
      sectorSlug: sector.slug,
      country: project.country,
      pageTopic: project.pageTopic,
      pageRole: project.pageRole,
    };
  }

  if (!hasModel()) {
    throw new Error(
      "Projenin sektörü, sayfa konusu ve sayfa rolü eksik; bunları çıkarmak için ANTHROPIC_API_KEY gerekli. Ya anahtarı tanımlayın ya da proje ayarlarından üçünü de elle girin.",
    );
  }
  const sectors = await prisma.sector.findMany({ select: { slug: true, name: true } });
  const reading = await interpretBrief(project.brief, sectors);
  if (!reading) throw new Error("Proje tanımı yorumlanamadı; sektör, konu ve rolü elle girin.");

  if (!sector) {
    sector = await prisma.sector.upsert({
      where: { slug: reading.sectorSlug },
      update: {},
      create: { slug: reading.sectorSlug, name: reading.sectorName, country: reading.country },
    });
  }
  const final: BriefReading = {
    sectorName: sector.name,
    sectorSlug: sector.slug,
    country: project.country || reading.country,
    pageTopic: project.pageTopic ?? reading.pageTopic,
    pageRole: project.pageRole ?? reading.pageRole,
  };
  await prisma.project.update({
    where: { id: project.id },
    data: { sectorId: sector.id, pageTopic: final.pageTopic, pageRole: final.pageRole },
  });
  return final;
}

/** The criteria package for the project's sector; generated on first use. */
async function ensurePackage(project: Project, reading: BriefReading): Promise<void> {
  const sector = await prisma.sector.findUnique({ where: { slug: reading.sectorSlug } });
  const pkg = sector
    ? await prisma.criteriaPackage.findFirst({ where: { sectorId: sector.id } })
    : null;
  if (pkg) return;
  if (!hasModel()) {
    throw new Error(
      `"${reading.sectorSlug}" sektörünün ölçüt kataloğu yok. scripts/seed-criteria.ts ile yükleyin ya da ANTHROPIC_API_KEY tanımlayın (katalog canlı üretilir).`,
    );
  }
  const identity: TargetIdentity = {
    institution: project.name,
    sectorName: reading.sectorName,
    sectorSlug: reading.sectorSlug,
    country: reading.country,
    pageTopic: reading.pageTopic,
    pageRole: reading.pageRole,
  };
  await generateSectorCatalogue(identity);
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

async function resolvePendingTargets(
  projectId: string,
  reading: BriefReading,
  progress: (note: string) => Promise<void>,
): Promise<{ resolved: number; failed: number }> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const pending = await prisma.projectTarget.findMany({
    where: { projectId, included: true, resolveState: "PENDING", url: null },
    orderBy: { order: "asc" },
  });
  let resolved = 0;
  let failed = 0;
  for (const [i, t] of pending.entries()) {
    await progress(`Sayfa adresleri bulunuyor: ${i + 1}/${pending.length} (${t.institution})`);
    await prisma.projectTarget.update({ where: { id: t.id }, data: { resolveState: "RESOLVING" } });
    let outcome;
    try {
      outcome = await resolveTargetPage({
        domain: t.domain,
        institution: t.institution,
        reading,
        viewport: project.viewport,
      });
    } catch (e) {
      outcome = { ok: false as const, note: e instanceof Error ? e.message : String(e) };
    }
    // The user may have typed a URL while this was running - theirs wins.
    const fresh = await prisma.projectTarget.findUnique({ where: { id: t.id } });
    if (!fresh) continue;
    if (fresh.url) {
      await prisma.projectTarget.update({ where: { id: t.id }, data: { resolveState: "RESOLVED" } });
      resolved++;
      continue;
    }
    if (outcome.ok) {
      resolved++;
      await prisma.projectTarget.update({
        where: { id: t.id },
        data: { url: outcome.url, foundVia: outcome.foundVia, resolveState: "RESOLVED", resolveNote: outcome.note },
      });
    } else {
      failed++;
      await prisma.projectTarget.update({
        where: { id: t.id },
        data: { resolveState: "FAILED", resolveNote: outcome.note },
      });
    }
  }
  return { resolved, failed };
}

/** Model suggests institutions, then each one's page is resolved. */
export async function startDiscovery(projectId: string, count?: number): Promise<void> {
  if (!hasModel()) throw new Error("Öneri almak için ANTHROPIC_API_KEY gerekli. Siteleri elle ekleyebilirsiniz.");
  await startJob(projectId, "discover", async (progress) => {
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    await progress("Proje tanımı yorumlanıyor");
    const reading = await ensureReading(project);

    const existing = await prisma.projectTarget.findMany({
      where: { projectId },
      select: { domain: true, order: true },
    });
    await progress("Kurum önerileri alınıyor");
    const candidates = await proposeInstitutions({
      brief: project.brief,
      reading,
      count: count ?? project.targetCount,
      excludeDomains: existing.map((e) => e.domain),
    });
    let order = existing.reduce((m, e) => Math.max(m, e.order), -1) + 1;
    for (const c of candidates) {
      await prisma.projectTarget.upsert({
        where: { projectId_domain: { projectId, domain: c.domain } },
        update: {},
        create: {
          projectId,
          institution: c.institution,
          domain: c.domain,
          source: "AI_SUGGESTED",
          rationale: c.why,
          order: order++,
        },
      });
    }

    const r = await resolvePendingTargets(projectId, reading, progress);
    return `${candidates.length} kurum önerildi; ${r.resolved} sayfa bulundu, ${r.failed} için adres bulunamadı.`;
  });
}

/** Finds pages for targets added by domain only. */
export async function startResolve(projectId: string): Promise<void> {
  await startJob(projectId, "resolve", async (progress) => {
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    const reading = await ensureReading(project);
    if (reading.pageRole !== "ENTRY" && !hasModel()) {
      throw new Error("Sayfa seçimi model gerektirir; ANTHROPIC_API_KEY yoksa tam adresi elle girin.");
    }
    const r = await resolvePendingTargets(projectId, reading, progress);
    return `${r.resolved} sayfa bulundu, ${r.failed} için adres bulunamadı.`;
  });
}

/** Captures and analyses every included, resolved target. */
export async function startRun(projectId: string, options: RunOptions = {}): Promise<void> {
  const mode = options.mode ?? "full";
  if (mode === "full" && !hasModel()) {
    throw new Error('Tam analiz için ANTHROPIC_API_KEY gerekli. Anahtarsız yalnızca "Sadece yakalama" çalışır.');
  }
  await startJob(projectId, "run", async (progress) => {
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    const reading = await ensureReading(project);
    await progress("Ölçüt kataloğu hazırlanıyor");
    await ensurePackage(project, reading);

    const targets = await prisma.projectTarget.findMany({
      where: {
        projectId,
        included: true,
        url: { not: null },
        ...(options.targetIds?.length ? { id: { in: options.targetIds } } : {}),
        ...(options.force ? {} : { runState: { not: "DONE" } }),
      },
      orderBy: { order: "asc" },
    });
    if (targets.length === 0) return "Çalıştırılacak site yok (hepsi tamamlanmış ya da adresi eksik).";

    await prisma.projectTarget.updateMany({
      where: { id: { in: targets.map((t) => t.id) } },
      data: { runState: "QUEUED", runNote: null },
    });

    const storage = getStorageProvider();
    let done = 0;
    let failed = 0;

    for (const [i, t] of targets.entries()) {
      const label = `${i + 1}/${targets.length} ${t.institution}`;
      // The target may have been excluded or deleted while queued.
      const fresh = await prisma.projectTarget.findUnique({ where: { id: t.id } });
      if (!fresh || !fresh.included || !fresh.url) {
        if (fresh) await prisma.projectTarget.update({ where: { id: t.id }, data: { runState: "IDLE" } });
        continue;
      }

      try {
        await progress(`Yakalanıyor: ${label}`);
        await prisma.projectTarget.update({ where: { id: t.id }, data: { runState: "CAPTURING" } });
        const result = await analyze({
          url: fresh.url,
          viewport: project.viewport,
          institution: fresh.institution,
          sectorSlug: reading.sectorSlug,
          deterministicOnly: mode === "capture_only",
        });
        await prisma.projectTarget.update({
          where: { id: t.id },
          data: { benchmarkId: result.benchmarkId, lastRunAt: new Date() },
        });

        const snap = result.capture.snapshot;
        const qualityPassed = result.capture.quality?.passed === true;
        if (!snap || !qualityPassed) {
          const failedChecks = result.capture.quality
            ? Object.entries(result.capture.quality.checks)
                .filter(([, c]) => !c.passed)
                .map(([n]) => n)
                .join(", ")
            : "";
          const note = `yakalama kalite kapısından geçmedi (${result.capture.status}${failedChecks ? `: ${failedChecks}` : ""})`;
          await savePageAnalysis(prisma, result.benchmarkId, { status: "SKIPPED", note });
          await prisma.projectTarget.update({ where: { id: t.id }, data: { runState: "FAILED", runNote: note } });
          failed++;
          continue;
        }

        // A page the SOFTWARE chose must actually be about the topic; an
        // unrelated page in the list would distort every percentage. A URL
        // the user typed is taken as their deliberate choice.
        if (fresh.foundVia !== "manual" && reading.pageTopic && !topicMatches(reading.pageTopic, snap.visibleText)) {
          const note = `sayfa "${reading.pageTopic}" konusuyla ilgili görünmüyor; doğru adresi elle girin`;
          await savePageAnalysis(prisma, result.benchmarkId, { status: "SKIPPED", note });
          await prisma.projectTarget.update({ where: { id: t.id }, data: { runState: "FAILED", runNote: note } });
          failed++;
          continue;
        }

        if (mode === "capture_only") {
          await savePageAnalysis(prisma, result.benchmarkId, {
            status: "SKIPPED",
            note: "yalnızca yakalama çalıştırıldı; hero/modül/değer önerisi analizi yapılmadı",
          });
        } else {
          await progress(`Analiz ediliyor: ${label}`);
          await prisma.projectTarget.update({ where: { id: t.id }, data: { runState: "ANALYZING" } });
          try {
            const full = await storage.get(result.capture.keys.full!);
            const description = await describePage(snap, full, reading.pageTopic);
            await savePageAnalysis(prisma, result.benchmarkId, { status: "DONE", description });
          } catch (e) {
            const note = `sayfa analizi başarısız: ${e instanceof Error ? e.message : String(e)}`;
            await savePageAnalysis(prisma, result.benchmarkId, { status: "FAILED", note });
            await prisma.projectTarget.update({ where: { id: t.id }, data: { runState: "FAILED", runNote: note } });
            failed++;
            continue;
          }
        }

        await prisma.projectTarget.update({ where: { id: t.id }, data: { runState: "DONE", runNote: null } });
        done++;
      } catch (e) {
        failed++;
        await prisma.projectTarget.update({
          where: { id: t.id },
          data: { runState: "FAILED", runNote: e instanceof Error ? e.message : String(e) },
        });
      }
    }
    return `${done} site tamamlandı, ${failed} site başarısız.`;
  });
}
