import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  appendTokenToRedirect,
  isAllowedAppRedirect,
} from "../integrations/mobile-redirect";

describe("isAllowedAppRedirect", () => {
  it("allows myself://auth", () => {
    assert.equal(isAllowedAppRedirect("myself://auth"), true);
  });

  it("allows exp:// dev URLs", () => {
    assert.equal(isAllowedAppRedirect("exp://127.0.0.1:8081/--/auth"), true);
  });

  it("allows https same-app /auth for Expo web", () => {
    assert.equal(isAllowedAppRedirect("https://myselfapp.xyz/auth"), true);
    assert.equal(isAllowedAppRedirect("https://myselfapp.xyz/auth?x=1"), true);
  });

  it("allows http localhost /auth for local web", () => {
    assert.equal(isAllowedAppRedirect("http://localhost:3000/auth"), true);
  });

  it("rejects https URLs that are not /auth", () => {
    assert.equal(isAllowedAppRedirect("https://evil.com/steal"), false);
    assert.equal(isAllowedAppRedirect("https://myselfapp.xyz/login"), false);
  });

  it("rejects myself with wrong host", () => {
    assert.equal(isAllowedAppRedirect("myself://evil"), false);
  });
});

describe("appendTokenToRedirect", () => {
  it("appends token query param", () => {
    assert.equal(
      appendTokenToRedirect("exp://localhost/--/auth", "abc123"),
      "exp://localhost/--/auth?token=abc123"
    );
  });
});
