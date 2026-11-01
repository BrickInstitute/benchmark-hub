/**
 * Client-side types and labels for the project screens. Mirrors the JSON the
 * /api/projects routes return.
 */

export type PageRole = "ENTRY" | "LISTING" | "DECISION" | "CONVERSION" | "TRUST";
export type RunState = "IDLE" | "QUEUED" | "CAPTURING" | "ANALYZING" | "DONE" | "FAILED";
export type ResolveState = "PENDING" | "RESOLVING" | "RESOLVED" | "FAILED";

export interface Target {
  id: string;
  institution: string;
  domain: string;
  url: string | null;
  source: "AI_SUGGESTED" | "MANUAL";
  included: boolean;
  rationale: string | null;
  resolveState: ResolveState;
  resolveNote: string | null;
  foundVia: string | null;
  runState: RunState;
  runNote: string | null;
  lastRunAt: string | null;
  benchmark: {
    id: string;
    thumbnailPath: string | null;
    qualityPassed: boolean;
    captureStatus: string;
    pageAnalysis: { status: "DONE" | "SKIPPED" | "FAILED"; note: string | null } | null;
  } | null;
}

export interface ProjectDetail {
  id: string;
  name: string;
  slug: string;
  brief: string;
  pageTopic: string | null;
  pageRole: PageRole | null;
  viewport: "DESKTOP" | "MOBILE";
  country: string;
  targetCount: number;
  sector: { slug: string; name: string } | null;
  jobKind: "discover" | "resolve" | "run" | null;
  jobState: "IDLE" | "RUNNING" | "DONE" | "FAILED";
  jobNote: string | null;
  jobStartedAt: string | null;
  jobFinishedAt: string | null;
  activeJob: string | null;
  modelAvailable: boolean;
  sectors: Array<{ slug: string; name: string }>;
  targets: Target[];
}

export const PAGE_ROLE_LABEL: Record<PageRole, string> = {
  ENTRY: "Ana sayfa",
  LISTING: "Ürün listeleme",
  DECISION: "Ürün / landing sayfası",
  CONVERSION: "Başvuru / form ekranı",
  TRUST: "Kurumsal sayfa",
};

export const JOB_LABEL: Record<string, string> = {
  discover: "Site önerisi",
  resolve: "Sayfa adresi bulma",
  run: "Yakalama ve analiz",
};

export const RUN_LABEL: Record<RunState, string> = {
  IDLE: "Çalıştırılmadı",
  QUEUED: "Sırada",
  CAPTURING: "Yakalanıyor",
  ANALYZING: "Analiz ediliyor",
  DONE: "Tamamlandı",
  FAILED: "Başarısız",
};

export const RESOLVE_LABEL: Record<ResolveState, string> = {
  PENDING: "Adres bekleniyor",
  RESOLVING: "Adres aranıyor",
  RESOLVED: "Adres hazır",
  FAILED: "Adres bulunamadı",
};

export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
  return body.data as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fetcher = (url: string): Promise<any> => api(url);
