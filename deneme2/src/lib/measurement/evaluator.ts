/**
 * Deterministic criterion evaluator.
 *
 * Placement (P2), depth (P5) and density (P6) are never produced by a model -
 * software computes them. Several presence criteria also fall out of the DOM
 * with certainty.
 *
 * This does not replace the model layer; it runs BEFORE it. The model is only
 * asked about criteria that cannot be settled here. That lowers cost and keeps
 * deterministic facts out of a model's interpretation.
 */
import type { MeasurementPattern, ObservationStatus } from "@prisma/client";
import type { Box, DomSnapshot, InteractiveElement } from "./dom-snapshot";
import { evidenceFromElement, isUsable, type EvidenceResult } from "./evidence";
import {
  bucket,
  deriveStatus,
  evidenceRequired,
  needsAbsenceConfirmation,
  placement,
  type BucketLimits,
} from "./patterns";

export interface EvaluatedObservation {
  code: string;
  pattern: MeasurementPattern;
  value: string | null;
  rawCount: number | null;
  status: ObservationStatus;
  evidence: EvidenceResult | null;
  /** Why it is UNKNOWN or NOT_APPLICABLE - shown to the user verbatim. */
  note: string | null;
  awaitingConfirmation: boolean;
}

function fold(s: string): string {
  return s.replace(/[İIı]/g, "i").toLowerCase().replace(/̇/g, "");
}

function matches(e: InteractiveElement, re: RegExp): boolean {
  return re.test(fold(e.text)) || re.test(fold(e.label));
}

const U01_LIMITS: BucketLimits = { az: [0, 4], orta: [5, 8], cok: [9, null] };
const U03_LIMITS: BucketLimits = { az: [1, 1], orta: [2, 3], cok: [4, null] };
const U11_LIMITS: BucketLimits = { az: [0, 3], orta: [4, 7], cok: [8, null] };
const U12_LIMITS: BucketLimits = { az: [0, 15], orta: [16, 40], cok: [41, null] };

const LEGAL =
  /kvkk|gizlilik|aydinlatma|kullanim sartlari|kullanim kosullari|cerez politikasi|privacy|legal/;
const LANGUAGE_CODE = /^(tr|en|de|ru|ar|fr)$/;
const LANGUAGE_LABEL = /dil sec|language|lang-switch/;
/**
 * Turkish letters are NOT word characters for JavaScript's \w / \W, so a
 * boundary written with \W matches inside "Hesaplama Araçları" and the search
 * criterion reports a false PRESENT. Word edges are therefore spelled out with
 * an explicit Turkish-aware character class. Text is folded before matching,
 * so dotless i never appears.
 */
const TR_WORD = "a-z0-9çğöşü";
const SEARCH = new RegExp(
  `(?:^|[^${TR_WORD}])ara(?:$|[^${TR_WORD}])|arama|search|site ici arama`,
);
const PHONE =
  /(?:\+90|0)[\s(]*\d{3}[\s)]*\d{3}[\s]*\d{2}[\s]*\d{2}|\b444[\s]?\d[\s]?\d{3}\b/;
const ADDRESS = /mah\.|mahallesi|cad\.|caddesi|sok\.|sokak|bulvar|no:\s?\d/i;

/** Universal criteria that need no model. Everything else waits for one. */
export const DETERMINISTIC_CODES = [
  "U01", "U02", "U03", "U07", "U10", "U11", "U12", "U13",
];

interface Context {
  snapshot: DomSnapshot;
  qualityPassed: boolean;
}

function observe(
  ctx: Context,
  code: string,
  pattern: MeasurementPattern,
  value: string | null,
  opts?: {
    rawCount?: number;
    naReason?: string;
    evidence?: EvidenceResult;
  },
): EvaluatedObservation {
  const evidence = opts?.evidence ?? null;
  const placementMatters = pattern === "P2";
  const verified = evidence !== null && isUsable(evidence, placementMatters);

  const status = deriveStatus({
    value,
    notApplicable: Boolean(opts?.naReason),
    qualityPassed: ctx.qualityPassed,
    evidenceVerified: verified,
    evidenceRequired: evidenceRequired(pattern),
    repeatsAgreed: true, // deterministic maths cannot disagree with itself
  });

  return {
    code,
    pattern,
    value,
    rawCount: opts?.rawCount ?? null,
    status,
    evidence: verified ? evidence : null,
    awaitingConfirmation: needsAbsenceConfirmation(status, pattern),
    note:
      opts?.naReason ??
      (status === "UNKNOWN"
        ? !ctx.qualityPassed
          ? "capture did not pass the quality gate"
          : "evidence could not be verified"
        : null),
  };
}

export function evaluateDeterministic(
  snapshot: DomSnapshot,
  qualityPassed: boolean,
): EvaluatedObservation[] {
  const ctx: Context = { snapshot, qualityPassed };
  const vh = snapshot.viewport.h;
  const out: EvaluatedObservation[] = [];

  const fromElement = (e: InteractiveElement): EvidenceResult =>
    evidenceFromElement({
      text: e.text || e.label,
      selector: e.selector,
      box: e.box,
    });

  // U01 - first-level menu item count (P6)
  const menu = snapshot.menu;
  if (menu.itemCount > 0) {
    out.push(
      observe(ctx, "U01", "P6", bucket(menu.itemCount, U01_LIMITS), {
        rawCount: menu.itemCount,
      }),
    );
  } else if (menu.possiblyCollapsed) {
    out.push(
      observe(ctx, "U01", "P6", null, {
        naReason:
          "menu is collapsed behind a hamburger; opening it needs interaction (out of v1 scope)",
      }),
    );
  } else {
    out.push(observe(ctx, "U01", "P6", null, { rawCount: 0 }));
  }

  // U02 - site search (P1)
  const search = snapshot.interactive.find(
    (e) => e.onScreen && (e.inputType === "search" || matches(e, SEARCH)),
  );
  out.push(
    observe(ctx, "U02", "P1", search ? "var" : "yok", {
      evidence: search ? fromElement(search) : undefined,
    }),
  );

  // U03 - primary CTAs on the first screen (P6)
  const ctaCount = snapshot.interactive.filter(
    (e) => e.primaryCta && e.onScreen && e.box.y < vh,
  ).length;
  out.push(
    ctaCount === 0
      ? observe(ctx, "U03", "P6", null, { rawCount: 0 })
      : observe(ctx, "U03", "P6", bucket(ctaCount, U03_LIMITS), { rawCount: ctaCount }),
  );

  // U07 - contact information placement (P2)
  // Three routes: visible phone text, a tel: link, an address marker. Matching
  // only the text pattern missed sites that expose the number as a link alone.
  const telLink = snapshot.interactive.find(
    (e) => e.onScreen && (e.href ?? "").startsWith("tel:"),
  );
  const phoneNode = snapshot.textNodes.find((n) => n.onScreen && PHONE.test(n.text));
  const addressNode = snapshot.textNodes.find((n) => n.onScreen && ADDRESS.test(n.text));

  let contactBox: Box | null = null;
  let contactEvidence: EvidenceResult | undefined;
  if (telLink) {
    contactBox = telLink.box;
    contactEvidence = evidenceFromElement({
      text: telLink.text || telLink.href || "",
      selector: telLink.selector,
      box: telLink.box,
    });
  } else if (phoneNode) {
    contactBox = phoneNode.box;
    contactEvidence = evidenceFromElement(phoneNode);
  } else if (addressNode) {
    contactBox = addressNode.box;
    contactEvidence = evidenceFromElement(addressNode);
  }
  out.push(
    observe(ctx, "U07", "P2", contactBox ? placement(contactBox, vh) : "yok", {
      evidence: contactEvidence,
    }),
  );

  // U10 - access to legal / privacy information (P1)
  const legalLink = snapshot.interactive.find(
    (e) => e.role === "link" && e.onScreen && matches(e, LEGAL),
  );
  out.push(
    observe(ctx, "U10", "P1", legalLink ? "var" : "yok", {
      evidence: legalLink ? fromElement(legalLink) : undefined,
    }),
  );

  // U11 - required fields in the conversion form (P6)
  const hasForm = snapshot.interactive.some((e) => e.role === "form");
  if (!hasForm) {
    out.push(observe(ctx, "U11", "P6", null, { naReason: "no form on this page" }));
  } else {
    const required = snapshot.interactive.filter(
      (e) => e.required && ["input", "select", "textarea"].includes(e.role),
    ).length;
    out.push(
      required === 0
        ? observe(ctx, "U11", "P6", null, { rawCount: 0 })
        : observe(ctx, "U11", "P6", bucket(required, U11_LIMITS), { rawCount: required }),
    );
  }

  // U12 - how much of the first screen the consent dialog covers (P6)
  const cookie = snapshot.cookieBanner;
  out.push(
    cookie.found
      ? observe(ctx, "U12", "P6", bucket(cookie.coveragePercent, U12_LIMITS), {
          rawCount: cookie.coveragePercent,
        })
      : observe(ctx, "U12", "P6", null, { naReason: "no consent dialog appeared" }),
  );

  // U13 - language switcher (P1)
  const langEl = snapshot.interactive.find(
    (e) =>
      e.onScreen &&
      (LANGUAGE_CODE.test(fold(e.text).trim()) || LANGUAGE_LABEL.test(fold(e.label))),
  );
  out.push(
    observe(ctx, "U13", "P1", langEl ? "var" : "yok", {
      evidence: langEl ? fromElement(langEl) : undefined,
    }),
  );

  return out;
}
