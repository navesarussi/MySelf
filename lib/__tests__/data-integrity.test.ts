import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dedupeGoals, dedupeTasks, goalFingerprint, habitNameKey, isUniqueViolation } from "../data-integrity";
import type { Goal } from "../types";

const baseGoal = (overrides: Partial<Goal> = {}): Goal => ({
  id: "g1",
  title: "להרוויח כסף מ-KupaPay",
  category: "עסקים וכסף",
  horizon: "לא דחוף",
  first_step: "מנגנון הכנסה",
  definition_of_done: "תשלום ראשון",
  status: "active",
  sort_order: 1,
  created_at: "2026-07-01T00:00:00.000Z",
  ...overrides,
});

describe("goalFingerprint", () => {
  it("is case- and whitespace-insensitive on text fields", () => {
    const a = goalFingerprint(baseGoal());
    const b = goalFingerprint(
      baseGoal({
        title: "  להרוויח כסף מ-KupaPay  ",
        category: "עסקים וכסף",
      })
    );
    assert.equal(a, b);
  });

  it("differs when status changes", () => {
    const active = goalFingerprint(baseGoal({ status: "active" }));
    const done = goalFingerprint(baseGoal({ status: "done" }));
    assert.notEqual(active, done);
  });
});

describe("dedupeGoals", () => {
  it("keeps the oldest row for duplicate fingerprints", () => {
    const older = baseGoal({ id: "old", created_at: "2026-06-01T00:00:00.000Z" });
    const newer = baseGoal({ id: "new", created_at: "2026-07-01T00:00:00.000Z" });
    assert.deepEqual(dedupeGoals([newer, older]), [older]);
  });
});

describe("habitNameKey", () => {
  it("normalizes habit names", () => {
    assert.equal(habitNameKey("  גמילה מסיגריות "), habitNameKey("גמילה מסיגריות"));
  });
});

describe("dedupeTasks", () => {
  it("keeps the most recently synced external task per identity", () => {
    const older = {
      id: "a",
      source: "google_tasks" as const,
      external_id: "ext-1",
      created_at: "2026-06-01T00:00:00.000Z",
      synced_at: "2026-06-02T00:00:00.000Z",
    };
    const newer = {
      id: "b",
      source: "google_tasks" as const,
      external_id: "ext-1",
      created_at: "2026-07-01T00:00:00.000Z",
      synced_at: "2026-07-02T00:00:00.000Z",
    };
    assert.deepEqual(dedupeTasks([older, newer]), [newer]);
  });
});

describe("isUniqueViolation", () => {
  it("detects Postgres unique constraint errors", () => {
    assert.equal(isUniqueViolation({ code: "23505" }), true);
    assert.equal(isUniqueViolation({ code: "42P01" }), false);
    assert.equal(isUniqueViolation(null), false);
  });
});
