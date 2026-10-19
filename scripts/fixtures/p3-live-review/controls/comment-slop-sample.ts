// SYNTHETIC FIXTURE — not production code, not part of any release surface.
// This file only seeds known comment smells so scripts/check-p3-live-review.mjs
// can check whether a reviewer reports what it actually read.
// ============================================================
//  payment retry helper — IMPORTANT: DO NOT REMOVE, too risky
// ============================================================

export function retryDelay(attempt: number): number {
  // this function returns the delay for the attempt
  // const legacyDelay = 1000; // keep for rollback
  // eslint-disable-next-line no-console
  console.log('retrying', attempt);
  return attempt * 100; // TODO: refactor later
}
