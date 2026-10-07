/**
 * End-to-end analysis run.
 *
 *   npx tsx scripts/analyze-test.ts <url> <institution> [--deterministic]
 *
 * Writes a Benchmark, its Regions, Observations and Evidence to the database.
 */
import { analyze, analyzePrisma } from "../src/lib/measurement/analyze";

async function main() {
  const args = process.argv.slice(2);
  const deterministicOnly = args.includes("--deterministic");
  const [url, institution] = args.filter((a) => !a.startsWith("--"));

  if (!url || !institution) {
    console.error("Usage: npx tsx scripts/analyze-test.ts <url> <institution> [--deterministic]");
    process.exit(1);
  }

  const r = await analyze({
    url,
    viewport: "DESKTOP",
    institution,
    sectorSlug: "bankacilik",
    deterministicOnly,
  });

  console.log(`\n${institution} - ${url}`);
  console.log(`benchmark : ${r.benchmarkId}`);
  console.log(`capture   : ${r.capture.status}, quality ${r.capture.quality?.passed ? "PASSED" : "FAILED"}`);
  console.log(`regions   : ${r.regionCount}`);

  const byStatus = (s: string) => r.observations.filter((o) => o.status === s).length;
  console.log(
    `observations: ${r.observations.length} ` +
      `(present ${byStatus("PRESENT")}, absent ${byStatus("ABSENT")}, ` +
      `unknown ${byStatus("UNKNOWN")}, n/a ${byStatus("NOT_APPLICABLE")})`,
  );

  if (r.modelUsage) {
    console.log(`model     : ${r.modelUsage.inputTokens} in / ${r.modelUsage.outputTokens} out`);
  }
  if (r.discardedClaims.length) {
    console.log(`discarded : ${r.discardedClaims.length}`);
    for (const d of r.discardedClaims) console.log(`  ${d.code} "${d.claim}" - ${d.why}`);
  }

  console.log("");
  for (const o of r.observations.sort((a, b) => a.code.localeCompare(b.code))) {
    const flag = o.awaitingConfirmation ? " [awaiting confirmation]" : "";
    const ev = o.evidenceText ? `  "${o.evidenceText.slice(0, 44)}"` : "";
    console.log(
      `  ${o.code.padEnd(4)} ${o.source.padEnd(13)} ${o.status.padEnd(15)} ${String(o.value ?? "-").padEnd(13)}${ev}${flag}`,
    );
  }

  // What the report would actually be allowed to publish.
  const publishable = r.observations.filter(
    (o) => (o.status === "PRESENT" || o.status === "ABSENT") && !o.awaitingConfirmation,
  ).length;
  console.log(`\npublishable observations: ${publishable}/${r.observations.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => analyzePrisma.$disconnect());
