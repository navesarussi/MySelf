import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeAgentReply } from "../agent/reply";
import { isSimpleStatusQuery } from "../agent/run";

describe("sanitizeAgentReply", () => {
  it("replaces generic retry phrase with actionable Hebrew", () => {
    const out = sanitizeAgentReply("לא הצלחתי לענות כרגע. נסה שוב.");
    assert.ok(!out.includes("נסה שוב"));
    assert.ok(out.length > 10);
  });
  it("preserves normal replies", () => {
    const msg = "יש לך 3 משימות דחופות. תתחיל מהמותג בגוגל.";
    assert.equal(sanitizeAgentReply(msg), msg);
  });
});

describe("isSimpleStatusQuery", () => {
  it("detects status questions", () => {
    assert.equal(isSimpleStatusQuery("מה המצב שלי"), true);
    assert.equal(isSimpleStatusQuery("תעדכן את כל ההרגלים"), false);
  });
});
