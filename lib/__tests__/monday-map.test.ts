import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mapMondayItem,
  pickDoneLabel,
  pickReopenLabel,
} from "../integrations/task-sources/monday/map";

const ctx = {
  accountKey: "42",
  accountName: "Work",
  accountSlug: "acme",
  boardId: "b1",
  boardTitle: "Sprint",
  statusColumnId: "status",
  peopleColumnId: "person",
};

describe("mapMondayItem", () => {
  it("maps open assigned item", () => {
    const d = mapMondayItem(
      {
        id: "99",
        name: "Ship feature",
        column_values: [
          { id: "status", type: "status", label: "Working on it", is_done: false },
          { id: "date", type: "date", date: "2026-08-01" },
        ],
      },
      ctx
    );
    assert.equal(d?.externalId, "42:99");
    assert.equal(d?.externalListId, "b1");
    assert.equal(d?.dueDate, "2026-08-01");
    assert.equal(d?.meta.account_key, "42");
    assert.equal(d?.meta.statusLabel, "Working on it");
    assert.match(d?.meta.deepLink ?? "", /pulses\/99/);
  });

  it("returns null for done status", () => {
    assert.equal(
      mapMondayItem(
        {
          id: "1",
          name: "Done item",
          column_values: [{ id: "status", type: "status", label: "Done", is_done: true }],
        },
        ctx
      ),
      null
    );
  });
});

describe("status label helpers", () => {
  const labels = [
    { label: "Working on it", is_done: false },
    { label: "Done", is_done: true },
    { label: "Stuck", is_done: false },
  ];

  it("picks Done label", () => {
    assert.equal(pickDoneLabel(labels), "Done");
  });

  it("reopens to previous label when valid", () => {
    assert.equal(pickReopenLabel(labels, "Stuck"), "Stuck");
  });
});
