import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Task } from "@/lib/types";
import { resolveExternalListId } from "@/lib/integrations/task-sources/resolve-list-id";
import { classifyWritebackError, WritebackError } from "@/lib/integrations/task-sources/writeback-errors";
import { applyExternalStatusChange } from "@/lib/integrations/task-sources/writeback";

const baseTask = (overrides: Partial<Task>): Task => ({
  id: "task-1",
  title: "Test",
  project_id: null,
  priority: "medium",
  status: "open",
  due_date: null,
  notes: null,
  source: "manual",
  external_id: null,
  external_list_id: null,
  external_meta: {},
  synced_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("resolveExternalListId", () => {
  it("uses external_list_id when present", () => {
    const task = baseTask({ source: "google_tasks", external_list_id: "list-a", external_id: "g1" });
    assert.equal(resolveExternalListId(task), "list-a");
  });

  it("derives GitHub repo from external_id when list id is missing", () => {
    const task = baseTask({
      source: "github",
      external_id: "acme/app#7",
      external_list_id: null,
    });
    assert.equal(resolveExternalListId(task), "acme/app");
  });

  it("falls back to meta.listId for Google tasks", () => {
    const task = baseTask({
      source: "google_tasks",
      external_id: "g1",
      external_list_id: null,
      external_meta: { listId: "list-meta" },
    });
    assert.equal(resolveExternalListId(task), "list-meta");
  });

  it("throws a local-only writeback error when list id cannot be resolved", () => {
    assert.throws(
      () =>
        resolveExternalListId(
          baseTask({ source: "google_tasks", external_id: "g1", external_list_id: null })
        ),
      (err: unknown) => err instanceof WritebackError && err.code === "external_missing_ids"
    );
  });
});

describe("classifyWritebackError", () => {
  it("marks auth failures as local-only allowed", () => {
    const err = classifyWritebackError(new Error("not_connected"));
    assert.equal(err.code, "integration_not_connected");
    assert.equal(err.localOnlyAllowed, true);
  });

  it("marks external API failures as not local-only", () => {
    const err = classifyWritebackError(new Error("complete_task_failed:403:forbidden"));
    assert.equal(err.code, "external_api_failed");
    assert.equal(err.localOnlyAllowed, false);
  });
});

describe("applyExternalStatusChange", () => {
  it("skips manual and gmail tasks", async () => {
    await applyExternalStatusChange(baseTask({ source: "manual" }), "done");
    await applyExternalStatusChange(
      baseTask({ source: "gmail", external_id: "mail-1" }),
      "done"
    );
  });

  it("throws before provider call when google task lacks list id", async () => {
    await assert.rejects(
      () =>
        applyExternalStatusChange(
          baseTask({
            source: "google_tasks",
            status: "open",
            external_id: "g-1",
            external_list_id: null,
          }),
          "done"
        ),
      (err: unknown) => err instanceof WritebackError && err.code === "external_missing_ids"
    );
  });

  it("does not write back when status stays on the same done side", async () => {
    await applyExternalStatusChange(
      baseTask({
        source: "google_tasks",
        status: "in_progress",
        external_id: "g-1",
        external_list_id: "list-1",
      }),
      "review"
    );
  });
});
