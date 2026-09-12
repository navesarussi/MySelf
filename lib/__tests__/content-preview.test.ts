import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { previewContentBody } from "../content-preview";

describe("previewContentBody", () => {
  it("returns short bodies unchanged", () => {
    assert.equal(previewContentBody("hello"), "hello");
  });

  it("truncates long bodies", () => {
    const body = "a".repeat(500);
    const preview = previewContentBody(body, 400);
    assert.equal(preview.length, 400);
    assert.equal(preview, "a".repeat(400));
  });

  it("treats null as empty", () => {
    assert.equal(previewContentBody(null), "");
  });
});
