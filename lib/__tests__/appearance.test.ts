import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAppearancePreference, resolveAppearance } from "../appearance";

describe("resolveAppearance", () => {
  it("honors an explicit light preference over a dark system scheme", () => {
    assert.equal(resolveAppearance("light", "dark"), "light");
  });
  it("honors an explicit dark preference over a light system scheme", () => {
    assert.equal(resolveAppearance("dark", "light"), "dark");
  });
  it("follows the system scheme when preference is system", () => {
    assert.equal(resolveAppearance("system", "light"), "light");
    assert.equal(resolveAppearance("system", "dark"), "dark");
  });
  it("defaults to dark when system scheme is unknown", () => {
    assert.equal(resolveAppearance("system", null), "dark");
    assert.equal(resolveAppearance("system", undefined), "dark");
  });
});

describe("isAppearancePreference", () => {
  it("accepts the three stored values", () => {
    assert.equal(isAppearancePreference("system"), true);
    assert.equal(isAppearancePreference("light"), true);
    assert.equal(isAppearancePreference("dark"), true);
  });
  it("rejects anything else", () => {
    assert.equal(isAppearancePreference("auto"), false);
    assert.equal(isAppearancePreference(""), false);
    assert.equal(isAppearancePreference(null), false);
  });
});
