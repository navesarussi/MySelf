import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { duplicateExternalTaskIds, duplicateHabitIds, type TaskDedupeRow } from "../db-maintenance";
import type { Habit, Task } from "../types";

const habit = (p: Partial<Habit> & Pick<Habit, "id" | "name">): Habit => ({
  kind: "build",
  target_note: null,
  streak_count: 0,
  best_streak: 0,
  total_success_days: 0,
  failure_count: 0,
  last_checked_on: null,
  archived: false,
  created_at: "2026-01-01T00:00:00.000Z",
  ...p,
});

const task = (p: Partial<Task> & Pick<Task, "id">): TaskDedupeRow =>
  ({
    title: "t",
    project_id: null,
    priority: "medium",
    status: "open",
    due_date: null,
    notes: null,
    source: "monday",
    external_id: null,
    external_list_id: null,
    external_meta: null,
    synced_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...p,
  }) as TaskDedupeRow;

/**
 * These decide which rows a maintenance run *deletes*, and they had no tests.
 * The important property is that each returns only rows it saw a survivor for —
 * which is why a truncated read can leave the cleanup incomplete but can never
 * delete the last copy of something.
 */
describe("duplicateHabitIds", () => {
  it("keeps the habit with the longest best streak", () => {
    const ids = duplicateHabitIds([
      habit({ id: "weak", name: "Run", best_streak: 3 }),
      habit({ id: "strong", name: "Run", best_streak: 40 }),
    ]);
    assert.deepEqual(ids, ["weak"]);
  });

  it("breaks a best-streak tie on the current streak, then on age", () => {
    assert.deepEqual(
      duplicateHabitIds([
        habit({ id: "a", name: "Run", best_streak: 10, streak_count: 1 }),
        habit({ id: "b", name: "Run", best_streak: 10, streak_count: 9 }),
      ]),
      ["a"]
    );
    assert.deepEqual(
      duplicateHabitIds([
        habit({ id: "older", name: "Run", best_streak: 5, streak_count: 5, created_at: "2026-01-01T00:00:00.000Z" }),
        habit({ id: "newer", name: "Run", best_streak: 5, streak_count: 5, created_at: "2026-06-01T00:00:00.000Z" }),
      ]),
      ["newer"]
    );
  });

  it("matches names case- and whitespace-insensitively", () => {
    const ids = duplicateHabitIds([
      habit({ id: "a", name: "Run", best_streak: 1 }),
      habit({ id: "b", name: "  run  ", best_streak: 9 }),
    ]);
    assert.deepEqual(ids, ["a"]);
  });

  it("returns nothing when every habit is distinct", () => {
    assert.deepEqual(duplicateHabitIds([habit({ id: "a", name: "Run" }), habit({ id: "b", name: "Read" })]), []);
  });

  it("never returns every copy of a name — one always survives", () => {
    const all = [
      habit({ id: "a", name: "Run", best_streak: 1 }),
      habit({ id: "b", name: "Run", best_streak: 2 }),
      habit({ id: "c", name: "Run", best_streak: 3 }),
    ];
    const ids = duplicateHabitIds(all);
    assert.equal(ids.length, all.length - 1);
    assert.ok(!ids.includes("c"), "the strongest survives");
  });
});

describe("duplicateExternalTaskIds", () => {
  it("keeps the most recently synced copy of an external task", () => {
    const ids = duplicateExternalTaskIds([
      task({ id: "old", external_id: "X1", synced_at: "2026-01-01T00:00:00.000Z" }),
      task({ id: "new", external_id: "X1", synced_at: "2026-06-01T00:00:00.000Z" }),
    ]);
    assert.deepEqual(ids, ["old"]);
  });

  it("scopes the key by source, so two providers can share an id", () => {
    const ids = duplicateExternalTaskIds([
      task({ id: "m", source: "monday", external_id: "1" }),
      task({ id: "g", source: "github", external_id: "1" }),
    ]);
    assert.deepEqual(ids, []);
  });

  it("ignores manual tasks, which have no external id", () => {
    const ids = duplicateExternalTaskIds([
      task({ id: "a", source: "manual", external_id: null }),
      task({ id: "b", source: "manual", external_id: null }),
    ]);
    assert.deepEqual(ids, []);
  });

  it("falls back to created_at when nothing has synced", () => {
    const ids = duplicateExternalTaskIds([
      task({ id: "old", external_id: "X", created_at: "2026-01-01T00:00:00.000Z" }),
      task({ id: "new", external_id: "X", created_at: "2026-06-01T00:00:00.000Z" }),
    ]);
    assert.deepEqual(ids, ["old"]);
  });

  /**
   * A truncated read is the failure mode a paged read prevents, but even under
   * one the deletion set must stay safe: seeing only one copy of a pair must
   * delete nothing, never that copy.
   */
  it("deletes nothing when only one copy of a duplicate is visible", () => {
    assert.deepEqual(duplicateExternalTaskIds([task({ id: "only", external_id: "X" })]), []);
  });
});
