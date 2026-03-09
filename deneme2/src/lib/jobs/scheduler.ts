// Scheduler is now handled by worker.mjs (standalone process)
// This file is kept for backward compatibility - startScheduler is a no-op

let started = false;

export function startScheduler() {
  if (started) return;
  started = true;
  console.log("[Scheduler] Worker process handles scheduling - this is a no-op");
}
