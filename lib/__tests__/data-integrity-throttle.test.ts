import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CLEANUP_MIN_INTERVAL_MS,
  claimCleanupSlot,
  newThrottleState,
  releaseCleanupSlot,
} from "../schedule-data-integrity-cleanup";

describe("data-integrity cleanup throttle", () => {
  it("never claims a slot when no duplicates were seen", () => {
    assert.equal(claimCleanupSlot(newThrottleState(), false, 1_000), false);
  });

  it("claims the first sweep", () => {
    assert.equal(claimCleanupSlot(newThrottleState(), true, 1_000), true);
  });

  it("collapses the concurrent reads of one cold start into a single sweep", () => {
    // home, tasks and habits are all prefetched at launch and all call in.
    const state = newThrottleState();
    const claims = [
      claimCleanupSlot(state, true, 1_000),
      claimCleanupSlot(state, true, 1_001),
      claimCleanupSlot(state, true, 1_002),
    ];
    assert.deepEqual(claims, [true, false, false]);
  });

  it("stays closed for the throttle window after a sweep finishes", () => {
    const state = newThrottleState();
    assert.equal(claimCleanupSlot(state, true, 1_000), true);
    releaseCleanupSlot(state);
    // Reads still report duplicates if the sweep could not remove them.
    assert.equal(claimCleanupSlot(state, true, 1_000 + CLEANUP_MIN_INTERVAL_MS - 1), false);
  });

  it("allows another sweep once the window has passed", () => {
    const state = newThrottleState();
    assert.equal(claimCleanupSlot(state, true, 1_000), true);
    releaseCleanupSlot(state);
    assert.equal(claimCleanupSlot(state, true, 1_000 + CLEANUP_MIN_INTERVAL_MS), true);
  });

  it("does not start a second sweep while one is still running", () => {
    const state = newThrottleState();
    assert.equal(claimCleanupSlot(state, true, 1_000), true);
    assert.equal(claimCleanupSlot(state, true, 1_000 + CLEANUP_MIN_INTERVAL_MS * 5), false);
  });
});
