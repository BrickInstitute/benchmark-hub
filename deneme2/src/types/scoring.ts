export interface ScoringResult {
  visualConsistency: number;
  layoutQuality: number;
  typography: number;
  colorHarmony: number;
  whitespaceUsage: number;
  accessibilityScore: number;
  overallScore: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
}

export interface ScoringRequest {
  benchmarkId: string;
  provider?: "claude" | "openai";
  model?: string;
}

export interface ScoringResponse {
  scoreId: string;
  status: "processing" | "completed" | "failed";
  result?: ScoringResult;
  error?: string;
}
