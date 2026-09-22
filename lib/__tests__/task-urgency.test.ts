import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rankUrgentTasks, isTaskUrgentByDueDate, effectiveTaskPriority } from "../agent/task-urgency";
import type { Task } from "../types";

const base = (p: Partial<Task>): Task => ({
  id: "00000000-0000-4000-8000-000000000001",
  title: "t",
  priority: "medium",
  status: "open",
  due_date: null,
  source: "manual",
  project_id: "00000000-0000-4000-8000-000000000099",
  notes: null,
  external_id: null,
  external_list_id: null,
  external_meta: {},
  synced_at: null,
  created_at: "",
  updated_at: "",
  ...p,
});

describe("isTaskUrgentByDueDate", () => {
  it("due more than 30 days out is not urgent-by-date", () => {
    const now = new Date("2026-09-22");
    assert.equal(isTaskUrgentByDueDate("2027-01-01", now), false);
  });
  it("due within 30 days is urgent-by-date", () => {
    const now = new Date("2026-09-22");
    assert.equal(isTaskUrgentByDueDate("2026-10-01", now), true);
  });
});

describe("effectiveTaskPriority", () => {
  it("demotes far-future tasks to low", () => {
    const now = new Date("2026-09-22");
    assert.equal(effectiveTaskPriority(base({ priority: "urgent", due_date: "2027-01-01" }), now), "low");
  });
});

describe("rankUrgentTasks", () => {
  it("returns at most 5 tasks", () => {
    const now = new Date("2026-09-22");
    const tasks = Array.from({ length: 12 }, (_, i) =>
      base({
        id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        priority: "high",
      })
    );
    assert.equal(rankUrgentTasks(tasks, now).length, 5);
  });

  it("prefers urgent priority over medium", () => {
    const now = new Date("2026-09-22");
    const tasks = [
      base({ id: "00000000-0000-4000-8000-000000000001", priority: "medium" }),
      base({ id: "00000000-0000-4000-8000-000000000002", priority: "urgent" }),
    ];
    assert.equal(rankUrgentTasks(tasks, now)[0]?.priority, "urgent");
  });
});
