import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scopeIncludesGmail } from "../integrations/gmail/status";

describe("scopeIncludesGmail", () => {
  it("detects gmail.readonly in scope string", () => {
    assert.equal(
      scopeIncludesGmail("openid email profile https://www.googleapis.com/auth/gmail.readonly"),
      true
    );
  });

  it("returns false without gmail scope", () => {
    assert.equal(
      scopeIncludesGmail("openid email https://www.googleapis.com/auth/calendar.readonly"),
      false
    );
  });
});
