import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  patchItemInList,
  removeItemFromList,
  prependItemToList,
  patchTaskInHome,
  removeTaskFromHome,
  patchHabitInHome,
  patchRelationshipInHome,
} from "../../mobile/src/query/patch";
import type { HomePayload } from "../../mobile/src/api/resources";
import type { Task, Habit, Relationship } from "@/lib/types";

describe("query-patch helpers", () => {
  it("patchItemInList updates the matched element immutably", () => {
    const list = [
      { id: "1", title: "Task 1", status: "open" },
      { id: "2", title: "Task 2", status: "open" },
    ];
    const updated = patchItemInList(list, "2", { status: "done" });
    assert.equal(updated.length, 2);
    assert.equal(updated[1].status, "done");
    assert.equal(list[1].status, "open"); // original not mutated
  });

  it("removeItemFromList removes the matched element", () => {
    const list = [{ id: "1" }, { id: "2" }];
    const result = removeItemFromList(list, "1");
    assert.deepEqual(result, [{ id: "2" }]);
  });

  it("prependItemToList adds to start and dedupes existing id", () => {
    const list = [{ id: "1", name: "Old 1" }, { id: "2", name: "Two" }];
    const result = prependItemToList(list, { id: "1", name: "New 1" });
    assert.equal(result.length, 2);
    assert.equal(result[0].name, "New 1");
  });

  it("patchTaskInHome removes task if status changed to done and updates count", () => {
    const mockHome: HomePayload = {
      habits: [],
      activeGoals: [],
      doneGoalsCount: 0,
      pendingCommitments: [],
      relationships: [],
      recentEvents: [],
      eventsMode: "upcoming",
      openTasks: [
        { id: "t1", title: "T1", status: "open", priority: "urgent", source: "manual" } as Task,
        { id: "t2", title: "T2", status: "in_progress", priority: "high", source: "manual" } as Task,
      ],
      projects: [],
      libraryEntries: [],
      openTasksCount: 1,
      inProgressTasksCount: 1,
      financeUncategorizedCount: 0,
    };

    const updated = patchTaskInHome(mockHome, "t1", { status: "done" });
    assert.ok(updated);
    assert.equal(updated.openTasks.length, 1);
    assert.equal(updated.openTasks[0].id, "t2");
    assert.equal(updated.openTasksCount, 0);
  });

  it("removeTaskFromHome decrements appropriate counters", () => {
    const mockHome: HomePayload = {
      habits: [],
      activeGoals: [],
      doneGoalsCount: 0,
      pendingCommitments: [],
      relationships: [],
      recentEvents: [],
      eventsMode: "upcoming",
      openTasks: [
        { id: "t1", title: "T1", status: "in_progress", priority: "high", source: "manual" } as Task,
      ],
      projects: [],
      libraryEntries: [],
      openTasksCount: 0,
      inProgressTasksCount: 1,
      financeUncategorizedCount: 0,
    };

    const updated = removeTaskFromHome(mockHome, "t1");
    assert.ok(updated);
    assert.equal(updated.openTasks.length, 0);
    assert.equal(updated.inProgressTasksCount, 0);
  });

  it("patchHabitInHome updates habit streak or status", () => {
    const mockHome: HomePayload = {
      habits: [
        { id: "h1", name: "H1", current_streak: 2 } as Habit,
      ],
      activeGoals: [],
      doneGoalsCount: 0,
      pendingCommitments: [],
      relationships: [],
      recentEvents: [],
      eventsMode: "upcoming",
      openTasks: [],
      projects: [],
      libraryEntries: [],
      openTasksCount: 0,
      inProgressTasksCount: 0,
      financeUncategorizedCount: 0,
    };

    const updated = patchHabitInHome(mockHome, "h1", { current_streak: 3 });
    assert.ok(updated);
    assert.equal(updated.habits[0].current_streak, 3);
  });

  it("patchRelationshipInHome updates contact date", () => {
    const mockHome: HomePayload = {
      habits: [],
      activeGoals: [],
      doneGoalsCount: 0,
      pendingCommitments: [],
      relationships: [
        { id: "r1", name: "Dan", last_contact_date: null, reminder_days: 7, phone: null, email: null },
      ],
      recentEvents: [],
      eventsMode: "upcoming",
      openTasks: [],
      projects: [],
      libraryEntries: [],
      openTasksCount: 0,
      inProgressTasksCount: 0,
      financeUncategorizedCount: 0,
    };

    const updated = patchRelationshipInHome(mockHome, "r1", { last_contact_date: "2026-09-12" });
    assert.ok(updated);
    assert.equal(updated.relationships[0].last_contact_date, "2026-09-12");
  });
});
