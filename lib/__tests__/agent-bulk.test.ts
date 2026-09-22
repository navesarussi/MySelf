import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseContactNamesFromHebrewList } from "../agent/data-bulk";

describe("parseContactNamesFromHebrewList", () => {
  it("parses Hebrew contact list", () => {
    const names = parseContactNamesFromHebrewList("עם קוה לוי\nעם אבא\nעם אמא");
    assert.deepEqual(names, ["קוה לוי", "אבא", "אמא"]);
  });

  it("splits comma-separated names", () => {
    assert.deepEqual(parseContactNamesFromHebrewList("דני, מיכל"), ["דני", "מיכל"]);
  });
});
