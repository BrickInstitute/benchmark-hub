/**
 * Shapes returned by GET /api/benchmarks/[id]/analysis.
 *
 * Shared between the flat list (AnalysisPanel) and the screenshot overlay
 * (InteractiveScreenshot) so the two never drift into reading the same JSON
 * two different ways.
 */

export type Status = "PRESENT" | "ABSENT" | "UNKNOWN" | "NOT_APPLICABLE";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PeerObservation {
  institution: string;
  benchmarkId: string;
  status: Status;
  value: string | null;
  rawCount: number | null;
  image: { path: string; width: number | null; height: number | null };
  box: Box | null;
}

export interface Observation {
  code: string;
  featureId: string | null;
  question: string;
  rule: string;
  pattern: string;
  steps: string[];
  value: string | null;
  rawCount: number | null;
  status: Status;
  note: string | null;
  domMatch: string;
  awaitingConfirmation: boolean;
  regionId: string | null;
  regionName: string | null;
  evidence: Array<{
    text: string;
    box: Box | null;
    source: string;
    ambiguous: boolean;
  }>;
  cohort: {
    denominator: number;
    rows: Array<{ value: string; count: number; percent: number | null }>;
    excluded: { unknown: number; notApplicable: number };
    coverage: { measured: number; cohortSize: number; percent: number | null };
  };
  peers: PeerObservation[];
}

export interface AnalysisData {
  benchmark: {
    id: string;
    institution: string | null;
    viewport: string;
    captureStatus: string;
    qualityPassed: boolean;
    sector: string | null;
    imagePath: string;
    width: number | null;
    height: number | null;
  };
  regions: Array<{
    id: string;
    type: string;
    name: string;
    box: Box;
  }>;
  observations: Observation[];
  cohort: { size: number; percentagesWithheld: boolean };
}
