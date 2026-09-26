import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getTaskCapabilities,
  getTaskStatusOptions,
} from "@/lib/integrations/task-sources/capabilities";
import type { Task } from "@/lib/types";

const base = (source: Task["source"], meta: Task["external_meta"] = {}): Task => ({
  id: "1",
  title: "T",
  project_id: null,
  priority: "medium",
  status: "open",
  due_date: null,
  notes: null,
  source,
  external_id: "x",
  external_list_id: "list",
  external_meta: meta,
  synced_at: null,
  created_at: "",
  updated_at: "",
});

describe("getTaskCapabilities", () => {
  it("allows Google title edit", () => {
    assert.equal(getTaskCapabilities(base("google_tasks")).title.editable, true);
  });

  it("blocks Monday title edit with Hebrew reason", () => {
    const caps = getTaskCapabilities(base("monday"));
    assert.equal(caps.title.editable, false);
    assert.match(caps.title.reasonHe ?? "", /Monday/);
  });

  it("allows hide locally for external sources", () => {
    assert.equal(getTaskCapabilities(base("monday")).hideLocally.editable, true);
    assert.equal(getTaskCapabilities(base("github")).hideLocally.editable, true);
  });
});

describe("getTaskStatusOptions", () => {
  it("returns GitHub open/closed", () => {
    const opts = getTaskStatusOptions(base("github"));
    assert.deepEqual(
      opts.map((o) => o.value),
      ["open", "done"]
    );
  });

  it("returns Monday board labels when cached", () => {
    const opts = getTaskStatusOptions(
      base("monday", {
        statusLabels: [
          { label: "פתוח", index: 0, is_done: false },
          { label: "בוצע", index: 1, is_done: true },
        ],
      })
    );
    assert.ok(opts.some((o) => o.value === "monday:0"));
    assert.ok(opts.some((o) => o.value === "done" && o.label === "בוצע"));
  });
});
