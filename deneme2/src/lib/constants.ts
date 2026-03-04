export const ITEMS_PER_PAGE = 24;

export const SCORE_CRITERIA = [
  { key: "visualConsistency", label: "Visual Consistency", description: "Gorsel tutarlilik" },
  { key: "layoutQuality", label: "Layout Quality", description: "Sayfa duzeni kalitesi" },
  { key: "typography", label: "Typography", description: "Tipografi kullanimi" },
  { key: "colorHarmony", label: "Color Harmony", description: "Renk uyumu" },
  { key: "whitespaceUsage", label: "Whitespace Usage", description: "Bosluk kullanimi" },
  { key: "accessibilityScore", label: "Accessibility", description: "Erisebilirlik" },
] as const;

export const SUPPORTED_SITES = [
  { value: "generic", label: "Generic URL" },
  { value: "mobbin", label: "Mobbin" },
  { value: "dribbble", label: "Dribbble (Browser)" },
  { value: "dribbble-api", label: "Dribbble (API)" },
  { value: "landingfolio", label: "Landingfolio" },
  { value: "awwwards", label: "Awwwards" },
  { value: "behance", label: "Behance" },
  { value: "collectui", label: "Collect UI" },
  { value: "siteinspire", label: "SiteInspire" },
  { value: "lapa", label: "Lapa.ninja" },
  { value: "webinspo", label: "WebInspo" },
] as const;

export const BENCHMARK_STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "ARCHIVED", label: "Archived" },
  { value: "PENDING_REVIEW", label: "Pending Review" },
  { value: "FLAGGED", label: "Flagged" },
] as const;

export const IMAGE_MAX_WIDTH = 2000;
export const THUMBNAIL_WIDTH = 400;
export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB
