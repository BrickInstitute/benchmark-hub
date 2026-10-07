/**
 * Capture quality gate.
 *
 * A capture that fails this gate can never enter a cohort, and every
 * observation derived from it is UNKNOWN. The rule it enforces is the single
 * most important one in the product: a crawl failure must never be reported as
 * "the feature is missing".
 */
import type { DomSnapshot } from "./dom-snapshot";

export interface QualityInput {
  httpStatus: number | null;
  snapshot: DomSnapshot;
  requestedUrl: string;
  finalUrl: string;
}

export interface QualityCheck {
  passed: boolean;
  value?: unknown;
  note?: string;
}

export interface QualityReport {
  passed: boolean;
  checks: Record<string, QualityCheck>;
  warnings: string[];
}

const ERROR_TRACES = [
  "sayfa bulunamadı", "page not found", "404 not found", "404 -", "403 -",
  "file or directory not found", "not found", "erişim engellendi",
  "access denied", "forbidden", "hizmet dışı", "bakım çalışması",
  "under maintenance", "geçici olarak hizmet",
];

const CAPTCHA_TRACES = [
  "captcha", "recaptcha", "cloudflare", "robot olmadığınızı", "are you a human",
  "doğrulama gerekiyor", "checking your browser", "bot koruması",
];

const MIN_TEXT = 500;

export function evaluateQuality(input: QualityInput): QualityReport {
  const s = input.snapshot;
  // The title is scanned too: some error pages have an empty body and the only
  // trace lives in <title>.
  const haystack = (s.visibleText + " " + s.title).toLowerCase();
  const checks: Record<string, QualityCheck> = {};
  const warnings: string[] = [];

  checks.httpStatus = {
    passed:
      input.httpStatus !== null && input.httpStatus >= 200 && input.httpStatus < 400,
    value: input.httpStatus,
  };

  checks.enoughText = {
    passed: s.visibleTextLength >= MIN_TEXT,
    value: s.visibleTextLength,
    note: `at least ${MIN_TEXT} characters`,
  };

  checks.hasTitle = { passed: s.title.trim().length > 0, value: s.title };

  const errorTrace = ERROR_TRACES.find((t) => haystack.includes(t));
  checks.notAnErrorPage = { passed: !errorTrace, note: errorTrace };

  const captchaTrace = CAPTCHA_TRACES.find((t) => haystack.includes(t));
  checks.noCaptcha = { passed: !captchaTrace, note: captchaTrace };

  const coverage = s.cookieBanner.coveragePercent;
  checks.contentNotObscured = {
    passed: coverage < 60,
    value: coverage,
    note: "a consent dialog covering 60%+ of the first screen hides the content",
  };

  checks.pageHasBody = {
    passed: s.pageHeight >= s.viewport.h,
    value: s.pageHeight,
  };

  checks.hasInteractiveElements = {
    passed: s.interactive.length >= 3,
    value: s.interactive.length,
  };

  try {
    const a = new URL(input.requestedUrl);
    const b = new URL(input.finalUrl);
    if (a.href !== b.href) {
      warnings.push(`redirected: ${a.href} -> ${b.href}`);
      if (a.hostname.replace(/^www\./, "") !== b.hostname.replace(/^www\./, "")) {
        warnings.push("host changed - page-type check required");
      }
    }
  } catch {
    /* an invalid URL is already caught by the other checks */
  }

  // Pixel-level blankness is not checked; no image library is wired in yet.
  // The DOM-based checks above stand in for it.
  warnings.push("no pixel-level blank-image check yet");

  return {
    passed: Object.values(checks).every((c) => c.passed),
    checks,
    warnings,
  };
}
