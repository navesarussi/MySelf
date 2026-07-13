import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { isAllowedGoogleEmail } from "../integrations/google-auth";

describe("isAllowedGoogleEmail", () => {
  const prev = process.env.ALLOWED_GOOGLE_EMAIL;

  afterEach(() => {
    if (prev === undefined) delete process.env.ALLOWED_GOOGLE_EMAIL;
    else process.env.ALLOWED_GOOGLE_EMAIL = prev;
  });

  it("allows any email when ALLOWED_GOOGLE_EMAIL is unset", () => {
    delete process.env.ALLOWED_GOOGLE_EMAIL;
    assert.equal(isAllowedGoogleEmail("anyone@example.com"), true);
  });

  it("allows only the configured email", () => {
    process.env.ALLOWED_GOOGLE_EMAIL = "owner@example.com";
    assert.equal(isAllowedGoogleEmail("owner@example.com"), true);
    assert.equal(isAllowedGoogleEmail("Owner@Example.com"), true);
    assert.equal(isAllowedGoogleEmail("other@example.com"), false);
  });

  it("allows any email in a comma-separated list", () => {
    process.env.ALLOWED_GOOGLE_EMAIL = "owner@example.com, second@example.com";
    assert.equal(isAllowedGoogleEmail("owner@example.com"), true);
    assert.equal(isAllowedGoogleEmail("second@example.com"), true);
    assert.equal(isAllowedGoogleEmail("Second@Example.com"), true);
    assert.equal(isAllowedGoogleEmail("other@example.com"), false);
  });
});
