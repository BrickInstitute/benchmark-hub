/**
 * robots.txt enforcement.
 *
 * A disallowed path is not crawled, and the institution stays UNKNOWN in the
 * cohort - never ABSENT. The product's selling point is a defensible
 * measurement, which requires a defensible collection method.
 */
export interface RobotsVerdict {
  allowed: boolean;
  reason: "allowed" | "disallowed" | "no-robots" | "unreadable";
  matchedRule?: string;
}

interface Group {
  agents: string[];
  allow: string[];
  disallow: string[];
}

export function parseRobots(body: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let previousWasAgent = false;

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.split("#")[0]!.trim();
    if (!line) continue;
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const field = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (field === "user-agent") {
      if (!current || !previousWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      previousWasAgent = true;
    } else if (current && (field === "allow" || field === "disallow")) {
      previousWasAgent = false;
      if (value) current[field].push(value);
      else if (field === "disallow") current.allow.push("/"); // empty Disallow = allow all
    } else {
      previousWasAgent = false;
    }
  }
  return groups;
}

function ruleMatches(path: string, rule: string): boolean {
  const pattern = rule
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\\\$$/, "$");
  return new RegExp("^" + pattern).test(path);
}

export function isPathAllowed(groups: Group[], path: string, ua: string): RobotsVerdict {
  const lowerUa = ua.toLowerCase();
  const specific = groups.find((g) =>
    g.agents.some((a) => a !== "*" && lowerUa.includes(a)),
  );
  const generic = groups.find((g) => g.agents.includes("*"));
  const group = specific ?? generic;
  if (!group) return { allowed: true, reason: "no-robots" };

  // Longest matching rule wins; Allow breaks ties.
  let bestAllow = "";
  let bestDisallow = "";
  for (const r of group.allow)
    if (ruleMatches(path, r) && r.length > bestAllow.length) bestAllow = r;
  for (const r of group.disallow)
    if (ruleMatches(path, r) && r.length > bestDisallow.length) bestDisallow = r;

  if (bestDisallow && bestDisallow.length > bestAllow.length) {
    return { allowed: false, reason: "disallowed", matchedRule: bestDisallow };
  }
  return { allowed: true, reason: "allowed", matchedRule: bestAllow || undefined };
}

export async function checkRobots(url: string, ua: string): Promise<RobotsVerdict> {
  const u = new URL(url);
  try {
    const res = await fetch(`${u.origin}/robots.txt`, {
      headers: { "user-agent": ua },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return { allowed: true, reason: "no-robots" };
    if (!res.ok) return { allowed: true, reason: "unreadable" };
    return isPathAllowed(parseRobots(await res.text()), u.pathname + u.search, ua);
  } catch {
    return { allowed: true, reason: "unreadable" };
  }
}
