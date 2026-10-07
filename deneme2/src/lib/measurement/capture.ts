/**
 * Page capture for measurement.
 *
 * Different from the scrapers in src/lib/scraping: those collect many examples
 * from gallery sites. This one captures ONE page under controlled conditions
 * so its regions, criteria and evidence can be measured and compared.
 *
 * Nothing downstream may run until this stage is trustworthy - a bad capture
 * that is treated as good turns into a false "the feature is missing".
 */
import type { Browser, Page } from "playwright";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { collectDomSnapshot, type DomSnapshot } from "./dom-snapshot";
import { evaluateQuality, type QualityReport } from "./quality-gate";
import { checkRobots } from "./robots";
import { getStorageProvider } from "../storage/storage-provider";

export type ViewportName = "DESKTOP" | "MOBILE";

export const VIEWPORTS: Record<ViewportName, { width: number; height: number }> = {
  DESKTOP: { width: 1440, height: 900 },
  MOBILE: { width: 390, height: 844 },
};

export type CaptureStatusValue =
  | "SUCCESS"
  | "BLOCKED"
  | "ERROR"
  | "TIMEOUT"
  | "ROBOTS_DENIED";

export interface CaptureRequest {
  url: string;
  viewport: ViewportName;
  skipRobots?: boolean;
}

export interface CaptureResult {
  captureId: string;
  url: string;
  finalUrl: string | null;
  status: CaptureStatusValue;
  httpStatus: number | null;
  viewport: { w: number; h: number };
  quality: QualityReport | null;
  snapshot: DomSnapshot | null;
  keys: {
    full?: string;
    fold?: string;
    foldWithBanner?: string;
    dom?: string;
  };
  /**
   * sha256 of the screenshot. NOT reliable for change detection - carousels
   * and animations move pixels on every load. Use `contentSignature`.
   */
  imageHash: string | null;
  contentSignature: string | null;
  durationMs: number;
  error?: string;
}

const USER_AGENT =
  process.env.CRAWLER_USER_AGENT ??
  "BenchmarkHubBot/0.1 (+https://brick.institute/bot)";
const MIN_DELAY_MS = Number(process.env.CRAWL_MIN_DELAY_MS ?? 2000);

/** One request at a time per host, with a gap between requests. */
const lastRequest = new Map<string, number>();
async function rateLimit(url: string): Promise<void> {
  const host = new URL(url).hostname;
  const previous = lastRequest.get(host);
  if (previous !== undefined) {
    const wait = MIN_DELAY_MS - (Date.now() - previous);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  lastRequest.set(host, Date.now());
}

/**
 * Bundlers that preserve function names wrap functions in a `__name` helper,
 * which is undefined inside the page and breaks page.evaluate. Writing the
 * helper onto globalThis would pollute the page under measurement, so it is
 * defined only inside the call's own scope.
 */
async function runInPage<T>(page: Page, fn: () => T | Promise<T>): Promise<T> {
  const source = fn.toString();
  return page.evaluate(
    `(() => { const __name = (f) => f; return (${source})(); })()`,
  ) as Promise<T>;
}

/** Triggers lazy content, then returns to the top. */
async function scrollThrough(page: Page): Promise<void> {
  await runInPage(page, async () => {
    const step = window.innerHeight * 0.8;
    const limit = Math.min(document.body.scrollHeight, 30000);
    for (let y = 0; y < limit; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 300));
    return true;
  });
}

// Reject first, accept second: the bot should not grant more consent than it
// has to.
const REJECT_PATTERNS = [
  /yaln[ıi]zca gerekli/i, /sadece gerekli/i, /zorunlu çerez/i,
  /reddet/i, /kabul etmiyorum/i, /reject all/i, /only necessary/i, /necessary only/i,
];
const ACCEPT_PATTERNS = [
  /t[üu]m[üu]n[üu] kabul/i, /kabul et/i, /onayl[ıi]yorum/i,
  /accept all/i, /accept/i, /allow all/i,
];

async function dismissCookieBanner(page: Page): Promise<void> {
  for (const patterns of [REJECT_PATTERNS, ACCEPT_PATTERNS]) {
    for (const pattern of patterns) {
      const button = page.getByRole("button", { name: pattern }).first();
      try {
        if (await button.isVisible({ timeout: 700 })) {
          await button.click({ timeout: 2000 });
          await page.waitForTimeout(600);
          return;
        }
      } catch {
        /* not this pattern */
      }
    }
  }
}

export async function capturePage(request: CaptureRequest): Promise<CaptureResult> {
  const startedAt = Date.now();
  const captureId = randomUUID();
  const vp = VIEWPORTS[request.viewport];

  const base: CaptureResult = {
    captureId,
    url: request.url,
    finalUrl: null,
    status: "ERROR",
    httpStatus: null,
    viewport: { w: vp.width, h: vp.height },
    quality: null,
    snapshot: null,
    keys: {},
    imageHash: null,
    contentSignature: null,
    durationMs: 0,
  };

  if (!request.skipRobots) {
    const verdict = await checkRobots(request.url, USER_AGENT);
    if (!verdict.allowed) {
      return {
        ...base,
        status: "ROBOTS_DENIED",
        error: `robots.txt disallows this path (rule: ${verdict.matchedRule})`,
        durationMs: Date.now() - startedAt,
      };
    }
  }

  await rateLimit(request.url);

  let browser: Browser | null = null;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: vp,
      locale: "tr-TR",
      timezoneId: "Europe/Istanbul",
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    let httpStatus: number | null = null;
    try {
      const response = await page.goto(request.url, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
      httpStatus = response?.status() ?? null;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        ...base,
        status: /timeout/i.test(message) ? "TIMEOUT" : "ERROR",
        error: message,
        durationMs: Date.now() - startedAt,
      };
    }

    await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => {});
    await scrollThrough(page);

    // 1) With the consent dialog visible - U12 needs this measurement.
    const withBanner = await runInPage(page, collectDomSnapshot);
    const foldWithBanner = await page.screenshot({ type: "png" });

    // 2) Dismiss it; the real measurement happens on this state.
    await dismissCookieBanner(page);
    await page.waitForTimeout(400);
    await scrollThrough(page);

    const clean = await runInPage(page, collectDomSnapshot);
    const fold = await page.screenshot({ type: "png" });
    const full = await page.screenshot({ type: "png", fullPage: true });
    const finalUrl = page.url();

    // Cookie measurement comes from the pre-dismissal state.
    const snapshot: DomSnapshot = { ...clean, cookieBanner: withBanner.cookieBanner };

    const quality = evaluateQuality({
      httpStatus,
      snapshot,
      requestedUrl: request.url,
      finalUrl,
    });

    const storage = getStorageProvider();
    const prefix = `captures/${captureId}`;
    const keys = {
      full: await storage.save(`${prefix}/full.png`, full, "image/png"),
      fold: await storage.save(`${prefix}/fold.png`, fold, "image/png"),
      foldWithBanner: await storage.save(
        `${prefix}/fold-with-banner.png`,
        foldWithBanner,
        "image/png",
      ),
      dom: await storage.save(
        `${prefix}/dom.json`,
        Buffer.from(JSON.stringify(snapshot)),
        "application/json",
      ),
    };

    const blocked =
      quality.checks.noCaptcha?.passed === false ||
      httpStatus === 403 ||
      httpStatus === 429;

    return {
      ...base,
      finalUrl,
      status: blocked ? "BLOCKED" : "SUCCESS",
      httpStatus,
      quality,
      snapshot,
      keys,
      imageHash: createHash("sha256").update(full).digest("hex"),
      contentSignature: snapshot.contentSignature,
      durationMs: Date.now() - startedAt,
    };
  } catch (e) {
    return {
      ...base,
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await browser?.close();
  }
}
