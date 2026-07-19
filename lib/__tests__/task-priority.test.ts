import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sortTasksByPriority, topPriorityTasks } from "../task-priority";
import type { Task } from "../types";

function task(partial: Partial<Task> & Pick<Task, "id" | "priority">): Task {
  return {
    title: partial.id,
    project_id: "p",
    status: "open",
    due_date: null,
    notes: null,
    source: "manual",
    external_id: null,
    external_list_id: null,
    external_meta: {},
    synced_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

describe("topPriorityTasks", () => {
  it("returns highest priorities first and caps at limit", () => {
    const list = [
      task({ id: "low", priority: "low" }),
      task({ id: "urgent", priority: "urgent" }),
      task({ id: "med", priority: "medium" }),
      task({ id: "high", priority: "high" }),
    ];
    assert.deepEqual(
      topPriorityTasks(list, 2).map((t) => t.id),
      ["urgent", "high"]
    );
  });
});

describe("sortTasksByPriority", () => {
  it("orders urgent > high > medium > low", () => {
    const sorted = sortTasksByPriority([
      task({ id: "m", priority: "medium" }),
      task({ id: "u", priority: "urgent" }),
      task({ id: "l", priority: "low" }),
      task({ id: "h", priority: "high" }),
    ]);
    assert.deepEqual(
      sorted.map((t) => t.id),
      ["u", "h", "m", "l"]
    );
  });
});
