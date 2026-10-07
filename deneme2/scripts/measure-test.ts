/**
 * Smoke test for the measurement engine.
 *
 *   npx tsx scripts/measure-test.ts <url> [DESKTOP|MOBILE]
 *
 * Runs the whole chain: capture -> DOM snapshot -> quality gate ->
 * deterministic criteria -> evidence verification -> status derivation.
 */
import { capturePage, type ViewportName } from "../src/lib/measurement/capture";
import { evaluateDeterministic } from "../src/lib/measurement/evaluator";
import { findEvidence } from "../src/lib/measurement/evidence";

const url = process.argv[2];
const viewport = (process.argv[3] === "MOBILE" ? "MOBILE" : "DESKTOP") as ViewportName;

if (!url) {
  console.error("Usage: npx tsx scripts/measure-test.ts <url> [DESKTOP|MOBILE]");
  process.exit(1);
}

async function main() {
    const result = await capturePage({ url, viewport });

  console.log("");
  console.log(`${url}  ${viewport}  ${(result.durationMs / 1000).toFixed(1)}s`);
  console.log(`status: ${result.status}${result.error ? " - " + result.error : ""}`);

  if (!result.snapshot || !result.quality) {
    process.exit(2);
  }

  const s = result.snapshot;
  const q = result.quality;
  const failed = Object.entries(q.checks).filter(([, c]) => !c.passed);

  console.log(
    `quality: ${q.passed ? "PASSED" : "FAILED"} ` +
      `(${Object.keys(q.checks).length - failed.length}/${Object.keys(q.checks).length})`,
  );
  for (const [name, c] of failed) {
    console.log(`  x ${name} ${c.value !== undefined ? JSON.stringify(c.value) : ""} ${c.note ?? ""}`);
  }

  console.log(
    `\ndom: ${s.textNodes.length} text nodes (${s.offScreenNodeCount} off-screen), ` +
      `${s.interactive.length} interactive, menu=${s.menu.itemCount} (${s.menu.method})` +
      `${s.menu.possiblyCollapsed ? " collapsed" : ""}, ` +
      `cookie=${s.cookieBanner.coveragePercent}%`,
  );
  console.log(`signature: ${s.contentSignature}`);

  const ctas = s.interactive.filter((e) => e.primaryCta).map((e) => e.text);
  console.log(`primary CTAs: ${JSON.stringify([...new Set(ctas)].slice(0, 6))}`);

  console.log("\nobservations:");
  const observations = evaluateDeterministic(s, q.passed);
  for (const o of observations) {
    const value = o.value ?? "-";
    const raw = o.rawCount !== null ? `(${o.rawCount})` : "";
    const flag = o.awaitingConfirmation ? "  [awaiting model confirmation]" : "";
    const ev = o.evidence
      ? `  evidence: "${(o.evidence.text ?? "").slice(0, 40)}" [${o.evidence.origin}]`
      : "";
    console.log(
      `  ${o.code} ${o.pattern}  ${o.status.padEnd(15)} ${String(value + raw).padEnd(12)}${ev}${flag}`,
    );
    if (o.note) console.log(`       note: ${o.note}`);
  }

  // Hallucination guard: a quote that is not on the page must not verify.
  console.log("\nhallucination guard:");
  for (const fake of [
    "Yıllık %1,23 faiz oranıyla 72 ay vadeli özel teklif",
    "Başvurunuz 3 dakikada sonuçlanır",
  ]) {
    const e = findEvidence(fake, s);
    console.log(`  ${e.verified ? "FAILED - accepted" : "ok - rejected"}: "${fake.slice(0, 42)}"`);
  }

  const real = s.textNodes.find((n) => n.onScreen && n.text.length > 25 && n.text.length < 90);
  if (real) {
    const e = findEvidence(real.text, s);
    console.log(
      `  real quote -> ${e.match}${e.box ? ` box [${e.box.x},${e.box.y},${e.box.w},${e.box.h}]` : ""}` +
        `${e.ambiguous ? " (ambiguous)" : ""}`,
    );
  }

}

main();
