/**
 * Evidence verification.
 *
 * The model reports a text it read. We look for that text among the on-screen
 * DOM nodes and compute the box ourselves. If it is not found, the observation
 * becomes UNKNOWN - a fabricated claim never reaches a report.
 *
 * The share of `NONE` matches is the system's health signal.
 */
import type { Box, DomSnapshot, TextNode } from "./dom-snapshot";
import { normalize, normalizeNumeric } from "./text";

export type MatchKind = "EXACT" | "NORMALIZED" | "NONE";
export type EvidenceOrigin = "MODEL_QUOTE" | "DOM_ELEMENT";

export interface EvidenceResult {
  match: MatchKind;
  verified: boolean;
  box: Box | null;
  selector: string | null;
  text: string | null;
  nodeCount: number;
  /** How many separate places matched. Above 1 the box is not certain. */
  candidateCount: number;
  ambiguous: boolean;
  origin: EvidenceOrigin;
}

const NOT_FOUND: EvidenceResult = {
  match: "NONE",
  verified: false,
  box: null,
  selector: null,
  text: null,
  nodeCount: 0,
  candidateCount: 0,
  ambiguous: false,
  origin: "MODEL_QUOTE",
};

/**
 * A quote shorter than this is not evidence: it matches at random and produces
 * the wrong coordinates. "Garanti BBVA Mob" once matched five separate places
 * and the matcher handed back a footer card.
 */
const MIN_QUOTE_LENGTH = 8;

function mergeBoxes(boxes: Box[]): Box {
  const x1 = Math.min(...boxes.map((b) => b.x));
  const y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.w));
  const y2 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

type Transform = (s: string) => string;

function findInSingleNode(
  quote: string,
  nodes: TextNode[],
  t: Transform,
): { chosen: TextNode; candidateCount: number } | null {
  const target = t(quote);
  if (!target) return null;
  const candidates = nodes.filter((n) => t(n.text).includes(target));
  if (candidates.length === 0) return null;
  // The narrowest match is the best evidence - the box should be the smallest
  // area that proves the claim. Ties go to document order.
  const chosen = candidates.reduce((a, b) =>
    b.text.length < a.text.length || (b.text.length === a.text.length && b.id < a.id)
      ? b
      : a,
  );
  return { chosen, candidateCount: candidates.length };
}

/** A quote split across several spans: search a sliding window of neighbours. */
function findAcrossNodes(
  quote: string,
  nodes: TextNode[],
  t: Transform,
  span = 6,
): TextNode[] | null {
  const target = t(quote);
  if (!target) return null;
  for (let i = 0; i < nodes.length; i++) {
    let joined = "";
    for (let j = i; j < Math.min(i + span, nodes.length); j++) {
      joined += (joined ? " " : "") + nodes[j]!.text;
      if (t(joined).includes(target)) return nodes.slice(i, j + 1);
    }
  }
  return null;
}

function build(
  nodes: TextNode[],
  match: MatchKind,
  candidateCount: number,
): EvidenceResult {
  return {
    match,
    verified: true,
    box: mergeBoxes(nodes.map((n) => n.box)),
    selector: nodes[0]!.selector,
    text: nodes.map((n) => n.text).join(" "),
    nodeCount: nodes.length,
    candidateCount,
    ambiguous: candidateCount > 1,
    origin: "MODEL_QUOTE",
  };
}

/**
 * Locate a model's quote on the page.
 * Order: exact, then normalised, then numerically normalised. At each stage a
 * single node is tried first, then a window of consecutive nodes.
 *
 * Only on-screen nodes are searched. Text in a hidden carousel slide is
 * invisible to the user and its box lands nowhere in the screenshot.
 */
export function findEvidence(quote: string, snapshot: DomSnapshot): EvidenceResult {
  const clean = quote.trim();
  if (clean.length < MIN_QUOTE_LENGTH) return NOT_FOUND;
  const nodes = snapshot.textNodes.filter((n) => n.onScreen);

  const stages: Array<[MatchKind, Transform]> = [
    ["EXACT", (s) => s],
    ["NORMALIZED", normalize],
    ["NORMALIZED", normalizeNumeric],
  ];

  for (const [kind, t] of stages) {
    const single = findInSingleNode(clean, nodes, t);
    if (single) return build([single.chosen], kind, single.candidateCount);
    const window = findAcrossNodes(clean, nodes, t);
    if (window) return build(window, kind, 1);
  }

  return NOT_FOUND;
}

/**
 * Evidence from an element the software located itself.
 *
 * The minimum-length rule exists so a model-supplied text can be found
 * reliably. When we found the element ourselves there is nothing to search:
 * the element is the evidence and its box is exact. Without this distinction a
 * two-letter language toggle or a text-free search icon could never be
 * evidenced, and the criterion would stay UNKNOWN forever.
 */
export function evidenceFromElement(el: {
  text: string;
  selector: string;
  box: Box;
}): EvidenceResult {
  return {
    match: "EXACT",
    verified: true,
    box: el.box,
    selector: el.selector,
    text: el.text,
    nodeCount: 1,
    candidateCount: 1,
    ambiguous: false,
    origin: "DOM_ELEMENT",
  };
}

/** Criteria that measure placement must not accept an ambiguous box. */
export function isUsable(e: EvidenceResult, placementMatters = false): boolean {
  if (!e.verified || e.box === null) return false;
  if (e.box.w <= 0 || e.box.h <= 0) return false;
  if (placementMatters && e.ambiguous) return false;
  return true;
}
