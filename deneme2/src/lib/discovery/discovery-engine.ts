import Anthropic from "@anthropic-ai/sdk";
import type { InputJsonValue } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/db";
import {
  DISCOVERY_STRATEGIES,
  CATEGORIES,
  buildDiscoveryPrompt,
  type DiscoveryCategory,
} from "./discovery-prompts";
import { validateUrls, type ValidationResult } from "./url-validator";

interface SuggestedSite {
  url: string;
  name: string;
  confidence: number;
  reason: string;
}

// Map discovery categories to existing category slugs in the DB
const CATEGORY_SLUG_MAP: Record<string, string> = {
  website: "web-design",
  "mobile-app": "mobile-app",
  dashboard: "dashboard",
  "landing-page": "landing-page",
  portfolio: "web-design",
  "ui-pattern": "ui-components",
};

export async function runDiscovery(category?: string) {
  const targetCategory = category || pickNextCategory();

  // 1. Get known URLs for dedup
  const existingSources = await prisma.scrapingSource.findMany({
    select: { url: true },
  });
  const knownUrls = existingSources.map((s) => s.url);
  const knownDomains = new Set(knownUrls.map((u) => extractDomain(u)));

  // 2. Pick strategy (round-robin based on last run)
  const strategy = await pickNextStrategy();

  // 3. Create discovery run record
  const run = await prisma.discoveryRun.create({
    data: {
      strategy: strategy.name,
      category: targetCategory,
      suggestedUrls: [],
      aiModel: process.env.DISCOVERY_MODEL || "claude-haiku-4-5-20251001",
      status: "running",
    },
  });

  try {
    // 4. Call Claude to discover sites
    const prompt = buildDiscoveryPrompt(strategy, knownUrls, targetCategory);
    const { suggestions, inputTokens, outputTokens } = await callClaude(prompt);

    await prisma.discoveryRun.update({
      where: { id: run.id },
      data: {
        suggestedUrls: suggestions as unknown as InputJsonValue,
        totalSuggested: suggestions.length,
        inputTokens,
        outputTokens,
      },
    });

    console.log(
      `[Discovery] ${strategy.name}/${targetCategory}: Claude suggested ${suggestions.length} sites`
    );

    // 5. Domain-level dedup
    const newSuggestions = suggestions.filter((s) => {
      const domain = extractDomain(s.url);
      if (knownDomains.has(domain)) {
        console.log(`[Discovery] Skipping duplicate domain: ${domain}`);
        return false;
      }
      if (s.confidence < 0.6) {
        console.log(`[Discovery] Skipping low confidence (${s.confidence}): ${s.url}`);
        return false;
      }
      return true;
    });

    if (newSuggestions.length === 0) {
      await prisma.discoveryRun.update({
        where: { id: run.id },
        data: {
          status: "completed",
          completedAt: new Date(),
          validatedUrls: [],
          totalValidated: 0,
          totalAdded: 0,
        },
      });
      console.log("[Discovery] No new sites to validate");
      return run;
    }

    // 6. Validate URLs with Playwright
    const urlsToValidate = newSuggestions.map((s) => s.url);
    const validationResults = await validateUrls(urlsToValidate, 2);

    const validResults = validationResults.filter((r) => r.valid);

    await prisma.discoveryRun.update({
      where: { id: run.id },
      data: {
        validatedUrls: validationResults as unknown as InputJsonValue,
        totalValidated: validResults.length,
      },
    });

    console.log(
      `[Discovery] Validated: ${validResults.length}/${validationResults.length} URLs passed`
    );

    // 7. Add valid sites as ScrapingSource
    let addedCount = 0;
    const categorySlug = CATEGORY_SLUG_MAP[targetCategory] || "web-design";

    for (const result of validResults) {
      const suggestion = newSuggestions.find((s) => s.url === result.url);
      if (!suggestion) continue;

      // Double-check domain isn't already in DB (race condition protection)
      const domain = extractDomain(result.url);
      const existing = await prisma.scrapingSource.findFirst({
        where: { url: { contains: domain } },
      });
      if (existing) continue;

      await prisma.scrapingSource.create({
        data: {
          name: suggestion.name || result.title || domain,
          url: result.url,
          site: "generic",
          enabled: true,
          maxItems: 10,
          schedule: "weekly",
          categorySlug,
          discoveredBy: "auto-discovery",
          discoveryRunId: run.id,
        },
      });

      knownDomains.add(domain);
      addedCount++;
      console.log(`[Discovery] Added new source: ${suggestion.name} (${result.url})`);
    }

    // 8. Finalize run
    await prisma.discoveryRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        addedSources: addedCount,
        totalAdded: addedCount,
      },
    });

    console.log(
      `[Discovery] Completed: ${addedCount} new sources added from ${strategy.name}/${targetCategory}`
    );

    return run;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Discovery failed";
    console.error(`[Discovery] Error:`, msg);

    await prisma.discoveryRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        errorLog: msg,
        completedAt: new Date(),
      },
    });

    throw error;
  }
}

async function callClaude(
  prompt: string
): Promise<{ suggestions: SuggestedSite[]; inputTokens: number; outputTokens: number }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: process.env.DISCOVERY_MODEL || "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const rawText = textBlock && "text" in textBlock ? textBlock.text : "[]";

  // Parse JSON from response
  let jsonStr = rawText;
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();
  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (arrayMatch) jsonStr = arrayMatch[0];

  const suggestions: SuggestedSite[] = JSON.parse(jsonStr);

  return {
    suggestions: suggestions.filter(
      (s) => s.url && s.url.startsWith("http") && s.name && typeof s.confidence === "number"
    ),
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

async function pickNextStrategy() {
  // Find the last used strategy and pick the next one
  const lastRun = await prisma.discoveryRun.findFirst({
    where: { status: "completed" },
    orderBy: { createdAt: "desc" },
    select: { strategy: true },
  });

  if (!lastRun) return DISCOVERY_STRATEGIES[0];

  const lastIndex = DISCOVERY_STRATEGIES.findIndex((s) => s.name === lastRun.strategy);
  const nextIndex = (lastIndex + 1) % DISCOVERY_STRATEGIES.length;
  return DISCOVERY_STRATEGIES[nextIndex];
}

function pickNextCategory(): string {
  // Simple round-robin: use current hour to pick category
  const hour = new Date().getHours();
  const index = hour % CATEGORIES.length;
  return CATEGORIES[index];
}

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
