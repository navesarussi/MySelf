import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickDoneLabel } from "@/lib/integrations/task-sources/monday/map";

describe("pickDoneLabel Hebrew boards", () => {
  it("prefers explicit is_done labels", () => {
    const labels = [
      { label: "פתוח", is_done: false },
      { label: "בוצע", is_done: true },
    ];
    assert.equal(pickDoneLabel(labels), "בוצע");
  });

  it("matches Hebrew done text when is_done metadata is missing", () => {
    const labels = [{ label: "פתוח" }, { label: "בוצע" }];
    assert.equal(pickDoneLabel(labels), "בוצע");
  });

  it("falls back to the last label when nothing else matches", () => {
    const labels = [{ label: "A" }, { label: "B" }];
    assert.equal(pickDoneLabel(labels), "B");
  });
});
