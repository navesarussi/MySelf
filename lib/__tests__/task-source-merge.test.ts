import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildExternalTaskUpsert, idsToMarkDone } from "../integrations/task-sources/merge";

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
});

describe("idsToMarkDone", () => {
  it("marks local open ids missing from fetch as done", () => {
    assert.deepEqual(
      idsToMarkDone(["a", "b", "c"], new Set(["a", "c"])),
      ["b"]
    );
  });
});
