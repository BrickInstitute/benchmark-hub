import { NextResponse } from "next/server";
import { startScheduler } from "@/lib/jobs/scheduler";

// Ensure scheduler starts on first request
if (typeof globalThis !== "undefined") {
  startScheduler();
}

export async function GET() {
  // Also try starting here in case top-level didn't work
  startScheduler();
  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
}
