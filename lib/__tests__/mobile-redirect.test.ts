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

  it("allows https SPA paths on app hosts", () => {
    assert.equal(isAllowedAppRedirect("https://myselfapp.xyz/auth"), true);
    assert.equal(isAllowedAppRedirect("https://myselfapp.xyz/settings"), true);
    assert.equal(isAllowedAppRedirect("https://myselfapp.xyz/"), true);
  });

  it("allows http localhost SPA paths for local web", () => {
    assert.equal(isAllowedAppRedirect("http://localhost:3000/auth"), true);
  });

  it("rejects foreign https hosts", () => {
    assert.equal(isAllowedAppRedirect("https://evil.com/steal"), false);
  });

  it("rejects https API and legacy paths on app host", () => {
    assert.equal(isAllowedAppRedirect("https://myselfapp.xyz/api/v1/session"), false);
    assert.equal(isAllowedAppRedirect("https://myselfapp.xyz/legacy"), false);
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
