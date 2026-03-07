import { prisma } from "@/lib/db";
import { getStorageProvider } from "@/lib/storage/storage-provider";
import { scoreWithClaude } from "./claude-vision";
import { parseScoreResponse } from "./score-parser";
import { SCORING_PROMPT_V2, SCORING_PROMPT_V1, CURRENT_PROMPT_VERSION } from "./scoring-prompts";

export async function scoreBenchmark(
  benchmarkId: string,
  provider: string = "claude",
  model?: string
) {
  const benchmark = await prisma.benchmark.findUnique({
    where: { id: benchmarkId },
  });

  if (!benchmark) {
    throw new Error("Benchmark not found");
  }

  // Load image from storage
  const storage = getStorageProvider();
  const imageBuffer = await storage.get(benchmark.imagePath);
  const imageBase64 = imageBuffer.toString("base64");

  // Determine mime type
  const mimeType = benchmark.format === "png"
    ? "image/png"
    : benchmark.format === "webp"
    ? "image/webp"
    : "image/jpeg";

  // Use HTML-aware prompt if HTML is available
  const hasHtml = !!benchmark.htmlContent;
  const prompt = hasHtml ? SCORING_PROMPT_V2 : SCORING_PROMPT_V1;

  let content: string;
  let inputTokens = 0;
  let outputTokens = 0;

  if (provider === "claude") {
    const result = await scoreWithClaude(
      imageBase64,
      mimeType,
      prompt,
      model,
      benchmark.htmlContent || undefined
    );
    content = result.content;
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  // Parse the AI response
  const scoringResult = parseScoreResponse(content);

  // Save to database
  const score = await prisma.score.create({
    data: {
      benchmarkId,
      visualConsistency: scoringResult.visualConsistency,
      layoutQuality: scoringResult.layoutQuality,
      typography: scoringResult.typography,
      colorHarmony: scoringResult.colorHarmony,
      whitespaceUsage: scoringResult.whitespaceUsage,
      accessibilityScore: scoringResult.accessibilityScore,
      overallScore: scoringResult.overallScore,
      feedback: scoringResult.feedback,
      strengths: scoringResult.strengths,
      improvements: scoringResult.improvements,
      aiProvider: provider,
      aiModel: model || process.env.AI_MODEL || "claude-haiku-4-5-20251001",
      promptVersion: CURRENT_PROMPT_VERSION,
      rawResponse: { content },
      inputTokens,
      outputTokens,
    },
  });

  // Update benchmark's cached overall score
  await prisma.benchmark.update({
    where: { id: benchmarkId },
    data: { overallScore: scoringResult.overallScore },
  });

  return score;
}
