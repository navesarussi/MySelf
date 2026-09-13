import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseWealthImportText } from "../finance/har-bituach-parse";

describe("parseWealthImportText", () => {
  it("extracts lines with shekel amounts", () => {
    const text = `
      פנסיה מקיפה - מגדל ₪450,000
      ביטוח חיים - הראל ₪1,200
      קרן השתלמות ₪85,000
    `;
    const items = parseWealthImportText(text);
    assert.ok(items.length >= 2);
    assert.ok(items.some((i) => i.category === "pension"));
    assert.ok(items.some((i) => i.category === "insurance"));
  });
});
