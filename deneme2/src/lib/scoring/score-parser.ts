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

/**
 * Finds matching closing brace for an opening brace, respecting nesting and strings.
 */
function findMatchingBrace(str: string, startIndex: number): number {
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIndex; i < str.length; i++) {
    const ch = str[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (ch === "\\") {
      escapeNext = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

/**
 * Cleans common JSON formatting issues from Claude responses.
 */
function cleanJsonString(str: string): string {
  // Remove trailing commas before } or ]
  str = str.replace(/,\s*([\]}])/g, "$1");

  // Fix unescaped newlines inside string values
  // This is tricky - we process character by character
  let result = "";
  let inStr = false;
  let escape = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (escape) {
      result += ch;
      escape = false;
      continue;
    }

    if (ch === "\\") {
      result += ch;
      escape = true;
      continue;
    }

    if (ch === '"') {
      inStr = !inStr;
      result += ch;
      continue;
    }

    // Replace actual newlines inside strings with \n
    if (inStr && (ch === "\n" || ch === "\r")) {
      result += "\\n";
      continue;
    }

    // Replace tab characters inside strings
    if (inStr && ch === "\t") {
      result += "\\t";
      continue;
    }

    result += ch;
  }

  return result;
}

export function parseScoreResponse(text: string): ScoringResult {
  // Strategy 1: Extract from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates: string[] = [];

  if (codeBlockMatch) {
    candidates.push(codeBlockMatch[1].trim());
  }

  // Strategy 2: Find the first top-level JSON object using brace matching
  const firstBrace = text.indexOf("{");
  if (firstBrace !== -1) {
    const lastBrace = findMatchingBrace(text, firstBrace);
    if (lastBrace !== -1) {
      candidates.push(text.slice(firstBrace, lastBrace + 1));
    }
  }

  // Strategy 3: Use the full text as-is
  candidates.push(text.trim());

  // Try each candidate
  for (const candidate of candidates) {
    try {
      const cleaned = cleanJsonString(candidate);
      const parsed = JSON.parse(cleaned);
      return scoreSchema.parse(parsed);
    } catch {
      // Try next candidate
    }
  }

  // Strategy 4: Last resort - extract scores with regex and build object manually
  const extractNumber = (key: string): number => {
    const match = text.match(new RegExp(`"${key}"\\s*:\\s*(\\d+(?:\\.\\d+)?)`));
    return match ? parseFloat(match[1]) : 5;
  };

  const extractString = (key: string): string => {
    const match = text.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
    return match ? match[1] : "";
  };

  const extractArray = (key: string): string[] => {
    const match = text.match(new RegExp(`"${key}"\\s*:\\s*\\[(.*?)\\]`, "s"));
    if (!match) return [];
    const items = match[1].match(/"((?:[^"\\\\]|\\\\.)*)"/g);
    return items ? items.map((s) => s.slice(1, -1)) : [];
  };

  const fallback: ScoringResult = {
    visualConsistency: extractNumber("visualConsistency"),
    layoutQuality: extractNumber("layoutQuality"),
    typography: extractNumber("typography"),
    colorHarmony: extractNumber("colorHarmony"),
    whitespaceUsage: extractNumber("whitespaceUsage"),
    accessibilityScore: extractNumber("accessibilityScore"),
    overallScore: extractNumber("overallScore"),
    feedback: extractString("feedback") || "Skor otomatik olarak cikarildi.",
    strengths: extractArray("strengths"),
    improvements: extractArray("improvements"),
  };

  // Validate that we got at least some real scores
  const hasScores = fallback.overallScore > 0 && fallback.visualConsistency > 0;
  if (!hasScores) {
    throw new Error("Could not parse scoring response: no valid scores found");
  }

  return fallback;
}
