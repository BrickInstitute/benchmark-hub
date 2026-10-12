/**
 * Visual check of the interface.
 *
 * Logs in, visits each screen and saves a screenshot, so the theme can be
 * inspected rather than assumed. Looking at a rendered page is the only way to
 * catch contrast problems that typecheck and build never see.
 *
 *   npx tsx scripts/ui-shot.ts [baseUrl] [outDir]
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3100";
const outDir = process.argv[3] ?? "/tmp/bh-ui";
const user = process.env.UI_USER ?? "efe";
const password = process.env.UI_PASSWORD ?? "test123";

const SCREENS = [
  { path: "/login", name: "01-login", auth: false },
  { path: "/benchmarks", name: "02-benchmarks", auth: true },
  { path: "/compare", name: "03-compare", auth: true },
  { path: "/scoring", name: "04-scoring", auth: true },
  { path: "/upload", name: "05-upload", auth: true },
  { path: "/settings", name: "06-settings", auth: true },
];

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "tr-TR",
  });
  const page = await context.newPage();

  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 120)}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 120)}`));

  for (const screen of SCREENS) {
    if (screen.auth) {
      // Log in once; the cookie persists in the context afterwards.
      const cookies = await context.cookies();
      if (!cookies.some((c) => c.name === "bh_session")) {
        await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
        await page.fill('input[autocomplete="username"]', user);
        await page.fill('input[type="password"]', password);
        await page.click('button[type="submit"]');
        await page.waitForTimeout(1500);
      }
    }

    const response = await page.goto(`${base}${screen.path}`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    // Data comes from a remote database, so the first paint is a skeleton.
    // Screenshotting that tells us nothing about the real screen.
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await page
      .waitForFunction(
        () => document.querySelectorAll(".animate-pulse").length === 0,
        { timeout: 20_000 },
      )
      .catch(() => {});
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${outDir}/${screen.name}.png`, fullPage: false });
    console.log(
      `${screen.name.padEnd(16)} ${String(response?.status() ?? "?").padEnd(4)} ${page.url()}`,
    );
  }

  await browser.close();
  if (problems.length) {
    console.log("\nsayfa hataları:");
    for (const p of [...new Set(problems)].slice(0, 8)) console.log("  " + p);
  } else {
    console.log("\nsayfa hatası yok");
  }
  console.log(`\ngörüntüler: ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
