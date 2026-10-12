/**
 * Minimal credential auth.
 *
 * The app reaches the public internet and its endpoints spend money (model
 * calls) and crawl third-party sites using our IP. Leaving it open is both a
 * budget risk and an abuse risk, so everything is behind a login.
 *
 * Users live in an env var rather than the database on purpose: there are two
 * of them, and a user table would need its own management screens to be worth
 * having. When that changes, this is the thing to replace.
 *
 * The session cookie is "<user>.<hmac>", signed with AUTH_SECRET. Web Crypto is
 * used instead of node:crypto so the same code runs in Next middleware.
 */

export const SESSION_COOKIE = "bh_session";
const ENCODER = new TextEncoder();

function parseUsers(raw: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const pair of (raw ?? "").split(",")) {
    const i = pair.indexOf(":");
    if (i <= 0) continue;
    const user = pair.slice(0, i).trim();
    const password = pair.slice(i + 1).trim();
    if (user && password) out.set(user, password);
  }
  return out;
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    ENCODER.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, ENCODER.encode(value));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time compare so a wrong password cannot be found byte by byte. */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyCredentials(
  user: string,
  password: string,
): Promise<boolean> {
  const users = parseUsers(process.env.APP_USERS);
  const expected = users.get(user);
  if (!expected) return false;
  return sameString(expected, password);
}

export async function createSession(user: string): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return `${user}.${await sign(user, secret)}`;
}

/** Returns the user name when the cookie is valid, otherwise null. */
export async function readSession(cookie: string | undefined): Promise<string | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret || !cookie) return null;
  const dot = cookie.lastIndexOf(".");
  if (dot <= 0) return null;
  const user = cookie.slice(0, dot);
  const signature = cookie.slice(dot + 1);
  const expected = await sign(user, secret);
  return sameString(expected, signature) ? user : null;
}

/**
 * Paths that stay open.
 * Only the health check - Railway polls it before a deployment is live, so
 * putting it behind the login would fail every deploy.
 */
export function isPublicPath(pathname: string): boolean {
  if (pathname === "/api/health") return true;
  if (pathname === "/login") return true;
  if (pathname === "/api/auth/login") return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico") return true;
  return false;
}
