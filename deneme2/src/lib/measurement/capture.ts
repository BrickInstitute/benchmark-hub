/**
 * Page capture for measurement.
 *
 * Historically there were also scrapers that collected many examples
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
  /**
   * Browser language and time zone. Default tr-TR / Europe/Istanbul. A foreign
   * site captured with a Turkish browser may redirect to a Turkish version or
   * show a language picker instead of the page being compared.
   */
  locale?: string;
  timezoneId?: string;
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

/**
 * The page navigated away while we were reading it: a JS redirect, a consent
 * wall reloading the page, a language redirect. The evaluation is lost, not
 * wrong - the right move is to let the new page settle and read again.
 */
function isNavigationRace(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /Execution context was destroyed|Cannot find context with specified id|frame was detached|because of a navigation/i.test(m);
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
}

/**
 * runInPage, retried when the page navigates mid-evaluation. After the last
 * attempt the error propagates and the capture is reported as ERROR, never
 * as a page with missing content.
 */
async function runInPageStable<T>(page: Page, fn: () => T | Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await runInPage(page, fn);
    } catch (e) {
      if (!isNavigationRace(e) || i >= attempts) throw e;
      await settle(page);
    }
  }
}

/** Pages whose load was stopped: Playwright's screenshot would only time out. */
const stoppedPages = new WeakSet<Page>();

/**
 * Opens the page. A slow site that never reaches DOMContentLoaded within the
 * first timeout gets a second, more lenient attempt: continue as soon as the
 * response starts arriving, then give the DOM a bounded wait. Whatever loaded
 * is captured and the quality gate decides whether it is usable - a heavy
 * page that renders in 60s is still a real page.
 */
async function openPage(page: Page, url: string) {
  try {
    return await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!/timeout/i.test(message)) throw e;
    const response = await page.goto(url, { waitUntil: "commit", timeout: 30_000 });
    const loaded = await page
      .waitForLoadState("domcontentloaded", { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    // Still loading: stop it, like the browser's stop button. Otherwise the
    // document never completes and the screenshot waits for it forever.
    if (!loaded) {
      await page.evaluate("window.stop()").catch(() => {});
      stoppedPages.add(page);
    }
    return response;
  }
}

/**
 * Screenshot with a fallback. Playwright's own screenshot waits for web fonts
 * and can hang on a page whose load was stopped (see openPage) even after the
 * document reports complete. The DevTools protocol call has no such wait, so
 * it takes over when the normal path times out.
 */
async function screenshot(page: Page, fullPage: boolean): Promise<Buffer> {
  try {
    if (stoppedPages.has(page)) throw new Error("timeout: load was stopped, using DevTools screenshot");
    return await page.screenshot({ type: "png", fullPage, timeout: 20_000 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!/timeout/i.test(message)) throw e;
    const cdp = await page.context().newCDPSession(page);
    try {
      let clip: { x: number; y: number; width: number; height: number; scale: number } | undefined;
      if (fullPage) {
        const m = (await cdp.send("Page.getLayoutMetrics")) as {
          cssContentSize?: { width: number; height: number };
          contentSize: { width: number; height: number };
        };
        const size = m.cssContentSize ?? m.contentSize;
        const vp = page.viewportSize();
        clip = {
          x: 0,
          y: 0,
          width: Math.ceil(vp?.width ?? size.width),
          height: Math.ceil(Math.min(size.height, 30_000)),
          scale: 1,
        };
      }
      const r = await cdp.send("Page.captureScreenshot", {
        format: "png",
        ...(clip ? { clip, captureBeyondViewport: true } : {}),
      });
      return Buffer.from(r.data, "base64");
    } finally {
      await cdp.detach().catch(() => {});
    }
  }
}

/** Triggers lazy content, then returns to the top. */
async function scrollThrough(page: Page): Promise<void> {
  await runInPageStable(page, async () => {
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
    // CHROMIUM_EXECUTABLE_PATH: only for machines whose preinstalled Chromium
    // does not match this Playwright version. Unset in the Docker image.
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
        : {}),
    });
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: vp,
      locale: request.locale ?? "tr-TR",
      timezoneId: request.timezoneId ?? "Europe/Istanbul",
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    let httpStatus: number | null = null;
    try {
      const response = await openPage(page, request.url);
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
    const withBanner = await runInPageStable(page, collectDomSnapshot);
    const foldWithBanner = await screenshot(page, false);

    // 2) Dismiss it; the real measurement happens on this state.
    await dismissCookieBanner(page);
    await page.waitForTimeout(400);
    await scrollThrough(page);

    const clean = await runInPageStable(page, collectDomSnapshot);
    const fold = await screenshot(page, false);
    const full = await screenshot(page, true);
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
