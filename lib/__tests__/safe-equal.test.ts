import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { safeEqual } from "../auth";

const NUL = String.fromCharCode(0);

describe("safeEqual", () => {
  it("matches identical strings", () => {
    assert.equal(safeEqual("abc123", "abc123"), true);
  });

  it("matches two empty strings", () => {
    assert.equal(safeEqual("", ""), true);
  });

  it("rejects a differing final character", () => {
    assert.equal(safeEqual("abc", "abd"), false);
  });

  it("rejects a differing first character", () => {
    assert.equal(safeEqual("abc", "zbc"), false);
  });

  it("rejects a prefix of the expected value", () => {
    assert.equal(safeEqual("abc", "abcdef"), false);
  });

  it("rejects an extension of the expected value", () => {
    assert.equal(safeEqual("abcdef", "abc"), false);
  });

  it("rejects an empty candidate", () => {
    assert.equal(safeEqual("", "secret"), false);
    assert.equal(safeEqual("secret", ""), false);
  });

  it("distinguishes a trailing NUL from absence", () => {
    // charCodeAt past the end normalises to 0, so only the length term
    // separates these two — worth pinning.
    assert.equal(safeEqual("a", `a${NUL}`), false);
  });

  it("matches a realistic hex HMAC", () => {
    const hex = "9f".repeat(32);
    assert.equal(safeEqual(hex, hex), true);
    assert.equal(safeEqual(hex, `${"9f".repeat(31)}9e`), false);
  });
});
