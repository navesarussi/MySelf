import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mondayRedirectUri } from "../integrations/monday-config";

describe("mondayRedirectUri", () => {
  const keys = ["MONDAY_REDIRECT_URI", "VERCEL_ENV", "VERCEL_URL"] as const;
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of keys) {
      prev[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it("uses explicit MONDAY_REDIRECT_URI when set", () => {
    process.env.MONDAY_REDIRECT_URI = "https://myselfapp.xyz/api/integrations/monday/callback";
    assert.equal(
      mondayRedirectUri(),
      "https://myselfapp.xyz/api/integrations/monday/callback"
    );
  });

  it("uses production domain on Vercel production", () => {
    process.env.VERCEL_ENV = "production";
    assert.equal(
      mondayRedirectUri(),
      "https://myselfapp.xyz/api/integrations/monday/callback"
    );
  });

  it("falls back to localhost", () => {
    assert.equal(
      mondayRedirectUri(),
      "http://localhost:3000/api/integrations/monday/callback"
    );
  });
});
