import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyGmailApiError, scopeIncludesGmail } from "../integrations/gmail/status";

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

describe("classifyGmailApiError", () => {
  it("detects disabled Gmail API", () => {
    assert.equal(
      classifyGmailApiError(
        403,
        '{"error":{"message":"Gmail API has not been used in project 123 before or it is disabled"}}'
      ),
      "gmail_api_disabled"
    );
  });

  it("maps other 403 to forbidden", () => {
    assert.equal(classifyGmailApiError(403, '{"error":"insufficient permissions"}'), "gmail_forbidden");
  });
});
