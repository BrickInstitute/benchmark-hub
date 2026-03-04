export async function register() {
  // Only run scheduler on the server, not during build
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/jobs/scheduler");
    startScheduler();
  }
}
