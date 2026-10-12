import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, createSession, verifyCredentials } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { user, password } = (await request.json().catch(() => ({}))) as {
    user?: string;
    password?: string;
  };

  if (!user || !password || !(await verifyCredentials(user, password))) {
    // Same message either way: do not reveal which usernames exist.
    return NextResponse.json({ error: "Kullanıcı adı veya şifre hatalı" }, { status: 401 });
  }

  const response = NextResponse.json({ data: { user } });
  response.cookies.set(SESSION_COOKIE, await createSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
