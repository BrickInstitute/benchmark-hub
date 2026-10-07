/**
 * Builds a peer cohort from a single company URL.
 *
 *   npx tsx scripts/cohort-test.ts <url> [peerCount]
 */
import { buildPeerCohort, cohortPrisma } from "../src/lib/measurement/cohort";

async function main() {
  const url = process.argv[2];
  const peerCount = Number(process.argv[3] ?? 4);
  if (!url) {
    console.error("Usage: npx tsx scripts/cohort-test.ts <url> [peerCount]");
    process.exit(1);
  }

  const r = await buildPeerCohort({ url, peerCount });

  console.log(`\nhedef: ${r.identity?.institution}`);
  console.log(`sektör: ${r.identity?.sectorName} (${r.identity?.sectorSlug}) / ${r.identity?.country}`);
  console.log(`sayfa: "${r.identity?.pageTopic}" rol=${r.identity?.pageRole}`);

  console.log(`\nmuadil adayları (${r.peers.length}):`);
  for (const p of r.peers) {
    const mark = p.accepted ? "KABUL" : "RED  ";
    console.log(`  ${mark} ${p.institution.padEnd(22)} ${p.reason}`);
    if (p.equivalentUrl) console.log(`        ${p.equivalentUrl}`);
  }

  const accepted = r.peers.filter((p) => p.accepted).length;
  console.log(`\nkohort: ${accepted} kurum${r.percentagesWithheld ? " (payda < 8, yüzde gösterilmiyor)" : ""}`);

  console.log("\ndağılımlar (yalnız ölçülebilenler):");
  for (const d of r.distributions) {
    if (d.denominator === 0) continue;
    const bars = d.rows
      .map((row) => `${row.value} ${row.count}/${d.denominator}${row.percent !== null ? ` %${row.percent}` : ""}`)
      .join(" · ");
    const you = d.targetValue ?? (d.targetStatus === "UNKNOWN" ? "belirsiz" : "-");
    console.log(`  ${d.code.padEnd(4)} ${d.question.slice(0, 44).padEnd(46)} ${bars}`);
    console.log(`       siz: ${you}`);
  }

  const measured = r.distributions.filter((d) => d.denominator > 0).length;
  console.log(`\nkarşılaştırılabilir ölçüt: ${measured}/${r.distributions.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => cohortPrisma.$disconnect());
