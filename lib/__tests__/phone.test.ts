import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, whatsappUrl, isValidPhone } from "../integrations/phone";

describe("normalizePhone", () => {
  it("strips non-digits", () => {
    assert.equal(normalizePhone("050-123-4567"), "972501234567");
  });

  it("converts Israeli 05x to 9725x", () => {
    assert.equal(normalizePhone("0501234567"), "972501234567");
  });

  it("keeps already-international numbers", () => {
    assert.equal(normalizePhone("+972501234567"), "972501234567");
  });
});

describe("whatsappUrl", () => {
  it("builds wa.me link", () => {
    assert.equal(whatsappUrl("0501234567"), "https://wa.me/972501234567");
  });

  it("returns null for invalid", () => {
    assert.equal(whatsappUrl("abc"), null);
  });
});

describe("isValidPhone", () => {
  it("accepts normalized Israeli mobile", () => {
    assert.equal(isValidPhone("0501234567"), true);
  });

  it("rejects too short", () => {
    assert.equal(isValidPhone("123"), false);
  });
});
