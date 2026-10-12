import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, isPublicPath, readSession } from "@/lib/auth";

/**
 * Everything is behind the login except the health check.
 *
 * API routes get a 401 rather than a redirect, so a script calling them does
 * not silently receive an HTML login page and treat it as a result.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const user = await readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (user) {
    // Pass the identity downstream so a run can record who started it.
    const headers = new Headers(request.headers);
    headers.set("x-bh-user", user);
    return NextResponse.next({ request: { headers } });
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
