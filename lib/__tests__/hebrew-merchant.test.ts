import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeHebrewDescription } from "../finance/hebrew-merchant";

describe("normalizeHebrewDescription", () => {
  it("segments glued standing-order and transport tokens", () => {
    assert.equal(
      normalizeHebrewDescription("לאהוראתקבעברכבותחבורכביש"),
      "לא הוראת קבע ברכבות חבור כביש"
    );
    assert.equal(
      normalizeHebrewDescription("לאהוראתקבעעמותותתרלובי"),
      "לא הוראת קבע עמותות תר לובי"
    );
  });

  it("keeps already-spaced labels unchanged", () => {
    assert.equal(normalizeHebrewDescription("לא הוראת קבע"), "לא הוראת קבע");
    assert.equal(normalizeHebrewDescription("סופר-פאר"), "סופר-פאר");
  });

  it("segments glued leisure/nursery tokens", () => {
    const out = normalizeHebrewDescription("פנאיבילוימשתלהסיטונאית");
    assert.match(out, /פנאי/);
    assert.match(out, /משתלה/);
  });
});
