import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildExternalTaskUpsert,
  idsToMarkDone,
  resolveExternalSyncStatus,
} from "../integrations/task-sources/merge";

describe("resolveExternalSyncStatus", () => {
  it("maps remote done to done", () => {
    assert.equal(resolveExternalSyncStatus("done", "stuck"), "done");
  });

  it("preserves local rich status when remote still open", () => {
    assert.equal(resolveExternalSyncStatus("open", "stuck"), "stuck");
    assert.equal(resolveExternalSyncStatus("open", "review"), "review");
    assert.equal(resolveExternalSyncStatus("open", "in_progress"), "in_progress");
  });

  it("defaults to open when no rich local status", () => {
    assert.equal(resolveExternalSyncStatus("open", "open"), "open");
    assert.equal(resolveExternalSyncStatus("open", undefined), "open");
  });
});

describe("buildExternalTaskUpsert", () => {
  it("maps draft to task row fields", () => {
    const row = buildExternalTaskUpsert(
      {
        externalId: "t1",
        externalListId: "l1",
        title: "Buy milk",
        notes: "2%",
        dueDate: "2026-07-20",
        status: "open",
        meta: { listTitle: "Personal" },
      },
      "google_tasks",
      "2026-07-16T00:00:00.000Z"
    );
    assert.equal(row.source, "google_tasks");
    assert.equal(row.external_id, "t1");
    assert.equal(row.project_id, null);
    assert.equal(row.priority, "medium");
    assert.equal(row.status, "open");
    assert.equal(row.external_meta.listTitle, "Personal");
    assert.equal(row.synced_at, "2026-07-16T00:00:00.000Z");
  });

  it("keeps local priority and rich status on update", () => {
    const row = buildExternalTaskUpsert(
      {
        externalId: "t1",
        externalListId: "l1",
        title: "Updated",
        notes: null,
        dueDate: null,
        status: "open",
        meta: {},
      },
      "monday",
      "2026-07-19T00:00:00.000Z",
      { status: "stuck", priority: "urgent" }
    );
    assert.equal(row.status, "stuck");
    assert.equal(row.priority, "urgent");
    assert.equal(row.title, "Updated");
  });
});

describe("idsToMarkDone", () => {
  it("marks local open ids missing from fetch as done", () => {
    assert.deepEqual(idsToMarkDone(["a", "b", "c"], new Set(["a", "c"])), ["b"]);
  });
});
