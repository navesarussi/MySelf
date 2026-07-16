import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapGoogleTask } from "../integrations/task-sources/google-tasks/map";

const openTask = {
  id: "gt1",
  title: "Ship it",
  notes: "asap",
  status: "needsAction" as const,
  due: "2026-08-01T00:00:00.000Z",
  parent: "parent1",
};

describe("mapGoogleTask", () => {
  it("maps open task", () => {
    const d = mapGoogleTask(openTask, "listA", "Work");
    assert.equal(d?.externalId, "gt1");
    assert.equal(d?.externalListId, "listA");
    assert.equal(d?.dueDate, "2026-08-01");
    assert.equal(d?.status, "open");
    assert.equal(d?.meta.listTitle, "Work");
    assert.equal(d?.meta.parentExternalId, "parent1");
  });

  it("returns null for completed", () => {
    assert.equal(mapGoogleTask({ ...openTask, status: "completed" }, "listA", "Work"), null);
  });

  it("returns null without id", () => {
    assert.equal(mapGoogleTask({ ...openTask, id: undefined }, "listA", "Work"), null);
  });
});
