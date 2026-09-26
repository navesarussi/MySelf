import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickDoneLabel, pickDoneLabelIndex } from "@/lib/integrations/task-sources/monday/map";
import { parseStatusLabels } from "@/lib/integrations/task-sources/monday/fetch";

describe("pickDoneLabel Hebrew boards", () => {
  it("prefers explicit is_done labels by index", () => {
    const labels = [
      { label: "פתוח", index: 0, is_done: false },
      { label: "בוצע", index: 1, is_done: true },
    ];
    assert.equal(pickDoneLabel(labels), "בוצע");
    assert.equal(pickDoneLabelIndex(labels), 1);
  });

  it("matches Hebrew done text when is_done metadata is missing", () => {
    const labels = [
      { label: "פתוח", index: 0 },
      { label: "בוצע", index: 1 },
    ];
    assert.equal(pickDoneLabelIndex(labels), 1);
  });

  it("falls back to the last label index when nothing else matches", () => {
    const labels = [
      { label: "A", index: 3 },
      { label: "B", index: 9 },
    ];
    assert.equal(pickDoneLabelIndex(labels), 9);
  });
});

describe("parseStatusLabels", () => {
  it("marks Hebrew done labels as is_done", () => {
    const settings = JSON.stringify({
      labels: { "0": "פתוח", "1": "בוצע" },
      labels_colors: { "1": { var_name: "green-shadow" } },
    });
    const parsed = parseStatusLabels(settings);
    assert.equal(parsed.find((l) => l.label === "בוצע")?.is_done, true);
    assert.equal(parsed.find((l) => l.label === "בוצע")?.index, 1);
  });
});
