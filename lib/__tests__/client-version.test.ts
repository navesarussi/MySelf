import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clientVersionAtLeast } from "../api/client-version";

describe("clientVersionAtLeast", () => {
  it("accepts a version equal to the minimum", () => {
    assert.equal(clientVersionAtLeast("1.15.0", "1.15.0"), true);
  });

  it("accepts a version above the minimum", () => {
    assert.equal(clientVersionAtLeast("1.15.1", "1.15.0"), true);
    assert.equal(clientVersionAtLeast("1.16.0", "1.15.0"), true);
    assert.equal(clientVersionAtLeast("2.0.0", "1.15.0"), true);
  });

  it("rejects a version below the minimum", () => {
    assert.equal(clientVersionAtLeast("1.14.9", "1.15.0"), false);
    assert.equal(clientVersionAtLeast("1.14.99", "1.15.0"), false);
    assert.equal(clientVersionAtLeast("0.9.0", "1.15.0"), false);
  });

  it("treats a missing header as an old client, not an error", () => {
    assert.equal(clientVersionAtLeast(null, "1.15.0"), false);
    assert.equal(clientVersionAtLeast(undefined, "1.15.0"), false);
    assert.equal(clientVersionAtLeast("", "1.15.0"), false);
  });

  it("treats an unparseable header as an old client", () => {
    assert.equal(clientVersionAtLeast("not-a-version", "1.15.0"), false);
    assert.equal(clientVersionAtLeast("v1.15.0", "1.15.0"), false);
  });

  it("tolerates a build-metadata suffix", () => {
    assert.equal(clientVersionAtLeast("1.15.0-rc.1", "1.15.0"), true);
    assert.equal(clientVersionAtLeast("1.15.0+42", "1.15.0"), true);
  });
});
