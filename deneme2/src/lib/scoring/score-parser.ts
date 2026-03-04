import { z } from "zod/v4";
import type { ScoringResult } from "@/types/scoring";

const scoreSchema = z.object({
  visualConsistency: z.number().min(1).max(10),
  layoutQuality: z.number().min(1).max(10),
  typography: z.number().min(1).max(10),
  colorHarmony: z.number().min(1).max(10),
  whitespaceUsage: z.number().min(1).max(10),
  accessibilityScore: z.number().min(1).max(10),
  overallScore: z.number().min(1).max(10),
  feedback: z.string(),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
});

export function parseScoreResponse(text: string): ScoringResult {
  // Extract JSON from the response (handle markdown code blocks)
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  // Try to find JSON object in the text
  const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    jsonStr = objectMatch[0];
  }

  const parsed = JSON.parse(jsonStr);
  return scoreSchema.parse(parsed);
}
