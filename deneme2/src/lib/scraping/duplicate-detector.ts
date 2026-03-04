import crypto from "crypto";
import { prisma } from "@/lib/db";

/**
 * Creates a hash for duplicate detection.
 * Uses sourceUrl if available, otherwise hashes the image buffer.
 */
export function createSourceHash(sourceUrl?: string, imageBuffer?: Buffer): string {
  if (sourceUrl) {
    // Normalize URL: remove trailing slashes, query params that change
    const normalized = sourceUrl.replace(/\/$/, "").split("?")[0].toLowerCase();
    return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 32);
  }

  if (imageBuffer) {
    return crypto.createHash("sha256").update(imageBuffer).digest("hex").slice(0, 32);
  }

  return crypto.randomUUID().replace(/-/g, "").slice(0, 32);
}

/**
 * Checks if a benchmark with this source hash already exists.
 */
export async function isDuplicate(sourceHash: string): Promise<boolean> {
  const existing = await prisma.benchmark.findUnique({
    where: { sourceHash },
    select: { id: true },
  });
  return !!existing;
}
