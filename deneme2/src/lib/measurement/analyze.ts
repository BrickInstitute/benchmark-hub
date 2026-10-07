/**
 * The analysis pipeline, end to end.
 *
 *   capture + quality gate
 *     -> segmentation (DOM-anchored regions)
 *     -> deterministic criteria
 *     -> model extraction for the rest
 *     -> evidence verification
 *     -> status derivation
 *     -> persistence
 *
 * Deliberately NOT one prompt that says "analyse this page and compare it to
 * competitors". Each stage is separately checkable, and the statistical part
 * never touches a model.
 */
import { PrismaClient, type ObservationStatus, type RegionType } from "@prisma/client";
import { capturePage, type CaptureRequest, type CaptureResult } from "./capture";
import { evaluateDeterministic, DETERMINISTIC_CODES } from "./evaluator";
import { extractFeatures, type CriterionSpec, type ModelClaim } from "./extraction";
import { findEvidence, isUsable, type EvidenceResult } from "./evidence";
import {
  deriveStatus,
  evidenceRequired,
  needsAbsenceConfirmation,
  placement,
} from "./patterns";
import type { Box, DomSnapshot, RawRegion } from "./dom-snapshot";
import { getStorageProvider } from "../storage/storage-provider";

const prisma = new PrismaClient();

export interface AnalyzeRequest extends CaptureRequest {
  institution: string;
  sectorSlug: string;
  packageVersion?: string;
  /** Skip the model stage - useful for testing the deterministic half alone. */
  deterministicOnly?: boolean;
}

export interface AnalyzeResult {
  benchmarkId: string;
  capture: CaptureResult;
  regionCount: number;
  observations: Array<{
    code: string;
    value: string | null;
    status: ObservationStatus;
    source: "deterministic" | "model";
    evidenceText: string | null;
    awaitingConfirmation: boolean;
  }>;
  modelUsage: { inputTokens: number; outputTokens: number } | null;
  discardedClaims: Array<{ code: string; claim: string; why: string }>;
}

/** How much of `a` sits inside `b`. */
function overlap(a: Box, b: Box): number {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const area = a.w * a.h;
  return area === 0 ? 0 : (w * h) / area;
}

/**
 * Attach an observation to a region.
 * DOM ancestry first (exact), then geometric containment, then the criterion's
 * declared default region. Anything left over lives at page level.
 */
function pickRegion(
  evidence: EvidenceResult | null,
  defaultType: RegionType | null,
  regions: Array<RawRegion & { id: string }>,
): string | null {
  if (evidence?.selector) {
    const byDom = regions
      .filter((r) => evidence.selector!.startsWith(r.selector))
      .sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h)[0];
    if (byDom) return byDom.id;
  }
  if (evidence?.box) {
    const inside = regions
      .filter((r) => overlap(evidence.box!, r.box) > 0.8)
      .sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h)[0];
    if (inside) return inside.id;
  }
  if (defaultType) {
    const byType = regions.find((r) => r.type === defaultType);
    if (byType) return byType.id;
  }
  return null;
}

export async function analyze(request: AnalyzeRequest): Promise<AnalyzeResult> {
  const capture = await capturePage(request);

  const sector = await prisma.sector.findUnique({ where: { slug: request.sectorSlug } });
  if (!sector) throw new Error(`unknown sector: ${request.sectorSlug}`);

  const pkg = await prisma.criteriaPackage.findFirst({
    where: { sectorId: sector.id, ...(request.packageVersion ? { version: request.packageVersion } : {}) },
    orderBy: { createdAt: "desc" },
    include: {
      criteria: { include: { criterion: true } },
      bindings: true,
    },
  });
  if (!pkg) throw new Error(`no criteria package for sector ${request.sectorSlug}`);

  const qualityPassed = capture.quality?.passed === true;
  const snapshot = capture.snapshot;

  const benchmark = await prisma.benchmark.create({
    data: {
      title: snapshot?.title || request.url,
      sourceUrl: request.url,
      sourceSite: new URL(request.url).hostname,
      imagePath: capture.keys.full ?? "",
      thumbnailPath: capture.keys.fold ?? null,
      width: capture.viewport.w,
      height: snapshot?.pageHeight ?? null,
      categoryId: (await prisma.category.findFirst())?.id ?? "",
      institution: request.institution,
      sectorId: sector.id,
      viewport: request.viewport,
      captureStatus: capture.status,
      qualityPassed,
      qualityReport: capture.quality ? (capture.quality as unknown as object) : undefined,
      domSnapshotPath: capture.keys.dom ?? null,
      contentSignature: capture.contentSignature,
      capturedAt: new Date(),
      isUploaded: false,
    },
  });

  if (!snapshot) {
    return {
      benchmarkId: benchmark.id,
      capture,
      regionCount: 0,
      observations: [],
      modelUsage: null,
      discardedClaims: [],
    };
  }

  // ---- Regions ----
  const regions: Array<RawRegion & { id: string }> = [];
  for (const [i, r] of snapshot.regions.entries()) {
    const row = await prisma.region.create({
      data: {
        benchmarkId: benchmark.id,
        type: r.type,
        name: r.name,
        x: r.box.x,
        y: r.box.y,
        w: r.box.w,
        h: r.box.h,
        selector: r.selector,
        source: "DOM",
        order: i,
      },
    });
    regions.push({ ...r, id: row.id });
  }

  const criteria = pkg.criteria.map((pc) => pc.criterion);
  const bindingByCriterion = new Map(pkg.bindings.map((b) => [b.criterionId, b.targetObject]));

  const results: AnalyzeResult["observations"] = [];

  async function persist(args: {
    criterionId: string;
    code: string;
    value: string | null;
    valueIndex: number | null;
    rawCount: number | null;
    status: ObservationStatus;
    evidence: EvidenceResult | null;
    note: string | null;
    awaitingConfirmation: boolean;
    modelClaim: object | null;
    defaultRegion: RegionType | null;
    source: "deterministic" | "model";
  }) {
    const regionId = pickRegion(args.evidence, args.defaultRegion, regions);
    const observation = await prisma.observation.create({
      data: {
        benchmarkId: benchmark.id,
        criterionId: args.criterionId,
        packageId: pkg!.id,
        regionId,
        value: args.value,
        valueIndex: args.valueIndex,
        rawCount: args.rawCount,
        status: args.status,
        domMatch: args.evidence ? args.evidence.match : "NONE",
        awaitingConfirmation: args.awaitingConfirmation,
        note: args.note,
        modelClaim: args.modelClaim ?? undefined,
        reviewStatus: args.status === "PRESENT" && !args.awaitingConfirmation
          ? "AUTO_APPROVED"
          : "PENDING",
      },
    });

    if (args.evidence?.verified && args.evidence.box) {
      await prisma.evidence.create({
        data: {
          observationId: observation.id,
          text: args.evidence.text ?? "",
          selector: args.evidence.selector,
          source: args.evidence.origin,
          x: args.evidence.box.x,
          y: args.evidence.box.y,
          w: args.evidence.box.w,
          h: args.evidence.box.h,
          verified: true,
          ambiguous: args.evidence.ambiguous,
        },
      });
    }

    results.push({
      code: args.code,
      value: args.value,
      status: args.status,
      source: args.source,
      evidenceText: args.evidence?.text ?? null,
      awaitingConfirmation: args.awaitingConfirmation,
    });
  }

  // ---- Deterministic half ----
  const deterministic = evaluateDeterministic(snapshot, qualityPassed);
  for (const o of deterministic) {
    const criterion = criteria.find((c) => c.code === o.code);
    if (!criterion) continue;
    const steps = (criterion.steps as string[]) ?? [];
    await persist({
      criterionId: criterion.id,
      code: o.code,
      value: o.value,
      valueIndex: o.value ? steps.indexOf(o.value) : null,
      rawCount: o.rawCount,
      status: o.status,
      evidence: o.evidence,
      note: o.note,
      awaitingConfirmation: o.awaitingConfirmation,
      modelClaim: null,
      defaultRegion: criterion.defaultRegion,
      source: "deterministic",
    });
  }

  // ---- Model half ----
  const pending = criteria.filter((c) => !DETERMINISTIC_CODES.includes(c.code));
  let modelUsage: AnalyzeResult["modelUsage"] = null;
  let discardedClaims: AnalyzeResult["discardedClaims"] = [];

  // Quality gate first: on a failed capture every observation would be UNKNOWN
  // anyway, so calling the model would burn tokens for nothing.
  const modelWorthRunning =
    !request.deterministicOnly && pending.length > 0 && Boolean(capture.keys.full) && qualityPassed;

  if (!modelWorthRunning && pending.length > 0) {
    for (const criterion of pending) {
      await persist({
        criterionId: criterion.id,
        code: criterion.code,
        value: null,
        valueIndex: null,
        rawCount: null,
        status: "UNKNOWN",
        evidence: null,
        note: request.deterministicOnly
          ? "model stage skipped (deterministic-only run)"
          : "model stage skipped: capture did not pass the quality gate",
        awaitingConfirmation: false,
        modelClaim: null,
        defaultRegion: criterion.defaultRegion,
        source: "model",
      });
    }
  }

  if (modelWorthRunning) {
    // Patterns the software owns. A model must never answer these:
    //   P5 depth  - a click count needs link-graph traversal, not a guess
    //   P6 density - a count must be counted
    // Until traversal exists, P5 is UNKNOWN with the reason stated. Silently
    // letting a model invent "1 click" would be exactly the kind of
    // unverifiable number this product exists to avoid.
    const SOFTWARE_ONLY = ["P5", "P6"];
    const softwareOwned = pending.filter((c) => SOFTWARE_ONLY.includes(c.pattern));
    const askModel = pending.filter((c) => !SOFTWARE_ONLY.includes(c.pattern));

    for (const criterion of softwareOwned) {
      await persist({
        criterionId: criterion.id,
        code: criterion.code,
        value: null,
        valueIndex: null,
        rawCount: null,
        status: "UNKNOWN",
        evidence: null,
        note:
          criterion.pattern === "P5"
            ? "depth needs link-graph traversal; not implemented yet (a model guess is not accepted)"
            : "count must be computed by software; no counter implemented for this criterion yet",
        awaitingConfirmation: false,
        modelClaim: null,
        defaultRegion: criterion.defaultRegion,
        source: "model",
      });
    }

    const specs: CriterionSpec[] = askModel.map((c) => ({
      code: c.code,
      pattern: c.pattern,
      question: c.question,
      rule: c.rule,
      steps: (c.steps as string[]) ?? [],
      targetObject: bindingByCriterion.get(c.id) ?? null,
    }));

    const storage = getStorageProvider();
    const fullImage = await storage.get(capture.keys.full!);
    const extraction = await extractFeatures(specs, snapshot, fullImage);
    modelUsage = extraction.usage;
    discardedClaims = extraction.discarded;

    const claimByCode = new Map<string, ModelClaim>(
      extraction.claims.map((c) => [c.code, c]),
    );

    for (const criterion of askModel) {
      const steps = (criterion.steps as string[]) ?? [];
      const claim = claimByCode.get(criterion.code);

      // The model skipped this criterion: that is UNKNOWN, never ABSENT.
      if (!claim) {
        await persist({
          criterionId: criterion.id,
          code: criterion.code,
          value: null,
          valueIndex: null,
          rawCount: null,
          status: "UNKNOWN",
          evidence: null,
          note: "model did not return this criterion",
          awaitingConfirmation: false,
          modelClaim: null,
          defaultRegion: criterion.defaultRegion,
          source: "model",
        });
        continue;
      }

      const evidence = claim.quote ? findEvidence(claim.quote, snapshot) : null;
      const placementMatters = criterion.pattern === "P2";
      const verified = evidence !== null && isUsable(evidence, placementMatters);

      // P2: the model only identifies WHICH element matters. Where it sits is
      // computed from the verified box, so the model's own rung is ignored.
      // Without a verified box there is no position to compute, hence "yok"
      // never comes from the model here - it comes from having no evidence.
      const value =
        criterion.pattern === "P2"
          ? verified
            ? placement(evidence!.box, snapshot.viewport.h)
            : null
          : claim.claim;

      let status = deriveStatus({
        value,
        notApplicable: false,
        qualityPassed,
        evidenceVerified: verified,
        evidenceRequired: evidenceRequired(criterion.pattern),
        repeatsAgreed: true,
      });

      // P2 nuance: the model pointed at something but the quote did not verify.
      // That is "we could not locate it", not "it is not there" - so UNKNOWN,
      // not ABSENT. Only an empty quote means the model saw nothing at all.
      if (criterion.pattern === "P2" && !verified && claim.quote) {
        status = "UNKNOWN";
      }

      await persist({
        criterionId: criterion.id,
        code: criterion.code,
        value,
        valueIndex: value ? steps.indexOf(value) : null,
        rawCount: null,
        status,
        evidence: verified ? evidence : null,
        note:
          status === "UNKNOWN"
            ? !qualityPassed
              ? "capture did not pass the quality gate"
              : claim.quote
                ? "model quote could not be found on the page, so the claim is unverified"
                : "model returned no quote"
            : null,
        awaitingConfirmation: needsAbsenceConfirmation(status, criterion.pattern),
        modelClaim: claim as unknown as object,
        defaultRegion: criterion.defaultRegion,
        source: "model",
      });
    }
  }

  return {
    benchmarkId: benchmark.id,
    capture,
    regionCount: regions.length,
    observations: results,
    modelUsage,
    discardedClaims,
  };
}

export { prisma as analyzePrisma };
