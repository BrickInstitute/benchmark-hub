/**
 * Model-based feature extraction.
 *
 * The contract with the model is deliberately narrow. It returns, per
 * criterion, only:
 *   - the rung it believes applies (one of the criterion's own steps)
 *   - the exact text it read on the page that justifies that rung
 *   - a short reason
 *
 * It does NOT return coordinates, status, or a confidence score.
 *   - Coordinates: software locates the quote in the DOM and derives the box.
 *     A model-drawn box cannot be verified and would land wrong on the image.
 *   - Status: derived from the value plus evidence verification.
 *   - Confidence: an uncalibrated number invites a threshold that looks
 *     principled and is not. Accuracy is measured against a golden set instead.
 *
 * Valid JSON does not mean a correct detection. Everything here is checked
 * afterwards by evidence.ts.
 */
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import type { DomSnapshot } from "./dom-snapshot";

export interface CriterionSpec {
  code: string;
  pattern: string;
  question: string;
  rule: string;
  steps: string[];
  /** For parametric criteria: what this criterion looks at in this sector. */
  targetObject?: string | null;
}

export interface ModelClaim {
  code: string;
  /** One of the criterion's steps. Anything else is discarded. */
  claim: string;
  /** Verbatim text read on the page. Empty when the model saw nothing. */
  quote: string;
  reasoning: string;
}

export interface ExtractionResult {
  claims: ModelClaim[];
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  /** Claims the model returned that did not match the criterion's steps. */
  discarded: Array<{ code: string; claim: string; why: string }>;
}

const MODEL = process.env.AI_MODEL || "claude-sonnet-5";
const MAX_SLICES = 6;
const SLICE_HEIGHT = 1400;
const TARGET_WIDTH = 1024;

/**
 * A full-page screenshot can be 10000px tall. Sending it as one image loses
 * legibility, so it is downscaled and cut into readable slices.
 */
export async function sliceScreenshot(full: Buffer): Promise<Buffer[]> {
  const image = sharp(full);
  const meta = await image.metadata();
  const width = meta.width ?? TARGET_WIDTH;
  const scale = Math.min(1, TARGET_WIDTH / width);

  const resized = await sharp(full)
    .resize({ width: Math.round(width * scale) })
    .png()
    .toBuffer();

  const resizedMeta = await sharp(resized).metadata();
  const h = resizedMeta.height ?? 0;
  const w = resizedMeta.width ?? TARGET_WIDTH;

  const slices: Buffer[] = [];
  for (let top = 0; top < h && slices.length < MAX_SLICES; top += SLICE_HEIGHT) {
    const height = Math.min(SLICE_HEIGHT, h - top);
    if (height < 40) break;
    slices.push(
      await sharp(resized).extract({ left: 0, top, width: w, height }).png().toBuffer(),
    );
  }
  return slices;
}

function buildPrompt(criteria: CriterionSpec[], snapshot: DomSnapshot): string {
  const lines = criteria.map((c) => {
    const target = c.targetObject ? `\n  Hedef nesne: ${c.targetObject}` : "";
    return `- ${c.code} (${c.pattern})
  Soru: ${c.question}
  Kural: ${c.rule}${target}
  İzinli değerler: ${c.steps.join(" | ")}`;
  });

  return `Bir web sayfasının tam sayfa ekran görüntüsünü parçalar hâlinde göreceksin.
Sayfanın görünür metni de aşağıda veriliyor.

Görevin: aşağıdaki ölçütlerin her biri için SADECE şunları döndürmek.

1. "claim": ölçütün izinli değerlerinden tam olarak biri. Başka bir şey yazma.
2. "quote": bu değeri gerekçelendiren, sayfada GERÇEKTEN GÖRDÜĞÜN metin.
   Birebir kopyala; kısaltma, düzeltme, çevirme. En az 8 karakter olsun.
   Sayfada ilgili metin yoksa boş dize bırak ve claim'i "yok" seç.
3. "reasoning": tek cümlelik gerekçe.

Kurallar:
- Koordinat, piksel konumu, kutu veya güven skoru DÖNDÜRME. Bunları yazılım hesaplıyor.
- Alıntıyı uydurma. Alıntın sayfa metninde bulunamazsa gözlem "belirsiz" sayılır
  ve yayınlanmaz; uydurmak işe yaramaz, yalnızca ölçümü bozar.
- Emin değilsen en düşük iddialı değeri seç.
- Her ölçüt için tam olarak bir nesne döndür; ölçüt atlamana izin yok.

ÖLÇÜTLER:
${lines.join("\n")}

SAYFA BİLGİSİ:
url: ${snapshot.url}
başlık: ${snapshot.title}
görünür metin (ilk 6000 karakter):
${snapshot.visibleText.slice(0, 6000)}`;
}

const SCHEMA = {
  type: "object" as const,
  properties: {
    observations: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          code: { type: "string" as const },
          claim: { type: "string" as const },
          quote: { type: "string" as const },
          reasoning: { type: "string" as const },
        },
        required: ["code", "claim", "quote", "reasoning"],
      },
    },
  },
  required: ["observations"],
};

export async function extractFeatures(
  criteria: CriterionSpec[],
  snapshot: DomSnapshot,
  fullScreenshot: Buffer,
): Promise<ExtractionResult> {
  if (criteria.length === 0) {
    return { claims: [], usage: { inputTokens: 0, outputTokens: 0 }, model: MODEL, discarded: [] };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });
  const slices = await sliceScreenshot(fullScreenshot);

  const content: Anthropic.MessageParam["content"] = [
    ...slices.map((buf, i) => [
      { type: "text" as const, text: `Sayfa parçası ${i + 1}/${slices.length}:` },
      {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: "image/png" as const,
          data: buf.toString("base64"),
        },
      },
    ]).flat(),
    { type: "text" as const, text: buildPrompt(criteria, snapshot) },
  ];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [
      {
        name: "report_observations",
        description: "Her ölçüt için bir gözlem döndür.",
        input_schema: SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: "report_observations" },
    messages: [{ role: "user", content }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  const raw =
    toolUse && toolUse.type === "tool_use"
      ? ((toolUse.input as { observations?: ModelClaim[] }).observations ?? [])
      : [];

  // The model may invent a rung. Anything outside the criterion's own steps is
  // discarded rather than coerced - a silently corrected value is a lie.
  const byCode = new Map(criteria.map((c) => [c.code, c]));
  const claims: ModelClaim[] = [];
  const discarded: ExtractionResult["discarded"] = [];

  for (const r of raw) {
    const spec = byCode.get(r.code);
    if (!spec) {
      discarded.push({ code: r.code, claim: r.claim, why: "unknown criterion code" });
      continue;
    }
    if (!spec.steps.includes(r.claim)) {
      discarded.push({
        code: r.code,
        claim: r.claim,
        why: `not one of: ${spec.steps.join(", ")}`,
      });
      continue;
    }
    claims.push({
      code: r.code,
      claim: r.claim,
      quote: (r.quote ?? "").trim(),
      reasoning: r.reasoning ?? "",
    });
  }

  return {
    claims,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
    model: MODEL,
    discarded,
  };
}
