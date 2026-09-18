import { after } from "next/server";
import { runDataIntegrityMaintenance } from "@/lib/db-maintenance";

/** Shortest gap between two dedup sweeps from the same instance. */
export const CLEANUP_MIN_INTERVAL_MS = 10 * 60 * 1000;

/** `lastRunAt: null` means no sweep has run yet — distinct from one that ran
 *  at timestamp 0, which a plain number could not express. */
type ThrottleState = { lastRunAt: number | null; inFlight: boolean };

export function newThrottleState(): ThrottleState {
  return { lastRunAt: null, inFlight: false };
}

/**
 * Decide whether a sweep may start, marking the state when it may.
 *
 * Four read endpoints call the scheduler and the app prefetches several of them
 * on a cold start, so without this a single launch could kick off three
 * concurrent full-table sweeps.
 */
export function claimCleanupSlot(
  state: ThrottleState,
  detectedDuplicates: boolean,
  now: number
): boolean {
  if (!detectedDuplicates) return false;
  if (state.inFlight) return false;
  if (state.lastRunAt !== null && now - state.lastRunAt < CLEANUP_MIN_INTERVAL_MS) return false;
  state.inFlight = true;
  state.lastRunAt = now;
  return true;
}

export function releaseCleanupSlot(state: ThrottleState) {
  state.inFlight = false;
}

const moduleState = newThrottleState();

/**
 * DB cleanup when a read notices duplicate rows.
 *
 * The sweep scans goals, habits and tasks in full and issues DELETEs, so it is
 * guarded two ways:
 *
 *  - `after()` hands the work to the platform to run once the response is sent.
 *    A bare floating promise could be frozen or killed mid-DELETE when the
 *    serverless instance suspends.
 *  - The throttle above, because reads dedupe defensively on every request: if a
 *    sweep cannot remove a row, the next read still reports duplicates, which
 *    previously re-triggered a full scan on every single load.
 *
 * The throttle is per instance, so a burst across several cold instances can
 * still overlap; it bounds the common case rather than guaranteeing exclusivity.
 * The UI never depends on this — reads already collapse duplicates themselves.
 */
export function scheduleDataIntegrityCleanup(detectedDuplicates: boolean) {
  if (!claimCleanupSlot(moduleState, detectedDuplicates, Date.now())) return;

  after(async () => {
    try {
      await runDataIntegrityMaintenance();
    } catch (err) {
      console.error("[data-integrity-cleanup]", err instanceof Error ? err.message : err);
    } finally {
      releaseCleanupSlot(moduleState);
    }
  });
}
