/**
 * One-off: adds `description` and `betterDirection` to every criterion in
 * data/criteria/*.json that does not have one yet.
 *
 * This is dictionary authoring, not per-observation inference: the output is
 * reviewed here (printed before writing) and becomes static catalogue data,
 * the same status as `question` or `rule` - never regenerated per report.
 *
 *   npx tsx scripts/backfill-descriptions.ts [--apply]
 *
 * Without --apply it only prints what would be written.
 */
import { readFile, writeFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.AI_MODEL || "claude-sonnet-5";
const FILES = ["universal", "banking", "hospital", "education", "retail"];

interface Criterion {
  code: string;
  question: string;
  rule: string;
  pattern: string;
  steps: string[];
  description?: string;
  betterDirection?: "ASC" | "DESC" | null;
  [k: string]: unknown;
}

function client() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

/**
 * Direction is derived in software from a concrete value the model names,
 * never trusted as an abstract ASC/DESC label from the model directly.
 *
 * A first pass asked the model for ASC/DESC against an explicitly-shown,
 * ordered steps array, and it still got systematically backwards on every
 * P5 (click-depth) criterion: it would write "fewer clicks is better" in the
 * description, correctly, and then label that ASC even though "fewer" sat at
 * steps[0] - which by the very definition given to it meant DESC. Reasoning
 * about array position in the abstract is exactly the kind of judgment this
 * project does not trust a model with anywhere else; naming the literal best
 * value ("0", "var") is a much easier, checkable claim, and the endpoint
 * check below is what actually decides ASC/DESC/null.
 */
function directionFromBestStep(bestStep: string | undefined, steps: string[]): "ASC" | "DESC" | null {
  if (!bestStep) return null;
  if (bestStep === steps[0]) return "DESC";
  if (bestStep === steps[steps.length - 1]) return "ASC";
  return null; // named a middle value, or something not in the list - discard, don't guess
}

async function describeCriteria(
  sectorName: string,
  criteria: Criterion[],
): Promise<Map<string, { description: string; betterDirection: "ASC" | "DESC" | null }>> {
  const list = criteria
    .map(
      (c) =>
        `${c.code} [${c.pattern}]: "${c.question}" - kural: ${c.rule}\n` +
        `  basamaklar (bu sırada): [${c.steps.join(", ")}]`,
    )
    .join("\n");

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [
      {
        name: "report_descriptions",
        description: "Her ölçüt kodu için açıklama ve en iyi basamak bildir.",
        input_schema: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  description: {
                    type: "string",
                    description:
                      "Son kullanıcıya gösterilecek 2-3 cümlelik açıklama: bu özellik nedir, neden önemlidir. Jargon yok - özelliği hiç bilmeyen biri okuyunca anlamalı.",
                  },
                  bestStep: {
                    type: "string",
                    description:
                      "Eğer bu ölçütün basamaklarından biri GERÇEKTEN evrensel olarak en iyi uygulamaysa, o basamağın TAM metnini buraya yaz (listeden birebir kopyala, ör. 'var' veya '0'). Hangisinin daha iyi olduğu bağlama göre değişiyorsa (çoğu konum/yerleşim ölçütü gibi) bu alanı BOŞ bırak.",
                  },
                },
                required: ["code", "description"],
              },
            },
          },
          required: ["items"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "report_descriptions" },
    messages: [
      {
        role: "user",
        content: `"${sectorName}" sektöründe kullanılan şu karşılaştırma ölçütlerinin her biri için son kullanıcıya gösterilecek bir açıklama ve (varsa) en iyi basamağı belirle:\n\n${list}\n\nHer kod için ayrı bir sonuç ver, hiçbirini atlama.`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("model yanıt vermedi");
  const items = (block.input as { items: Array<{ code: string; description: string; bestStep?: string }> }).items;

  const stepsByCode = new Map(criteria.map((c) => [c.code, c.steps]));
  const out = new Map<string, { description: string; betterDirection: "ASC" | "DESC" | null }>();
  for (const i of items) {
    const steps = stepsByCode.get(i.code) ?? [];
    out.set(i.code, {
      description: i.description,
      betterDirection: directionFromBestStep(i.bestStep, steps),
    });
  }
  return out;
}

async function main() {
  const apply = process.argv.includes("--apply");

  for (const name of FILES) {
    const path = `data/criteria/${name}.json`;
    const json = JSON.parse(await readFile(path, "utf8")) as { sectorName?: string; criteria: Criterion[] };
    const missing = json.criteria.filter((c) => !c.description);
    if (missing.length === 0) {
      console.log(`${name}: zaten tam, atlanıyor`);
      continue;
    }

    console.log(`\n${name}: ${missing.length} ölçüt için açıklama üretiliyor...`);
    const described = await describeCriteria(json.sectorName ?? name, missing);

    for (const c of json.criteria) {
      const d = described.get(c.code);
      if (!d) {
        if (!c.description) console.log(`  [EKSİK KALDI] ${c.code}`);
        continue;
      }
      c.description = d.description;
      c.betterDirection = d.betterDirection;
      console.log(`  ${c.code} (${d.betterDirection ?? "NONE"}): ${d.description}`);
    }

    if (apply) {
      await writeFile(path, JSON.stringify(json, null, 2) + "\n", "utf8");
      console.log(`  -> ${path} güncellendi`);
    }
  }

  if (!apply) {
    console.log("\n--apply verilmedi, hiçbir dosya değiştirilmedi.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
