import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { googleTasksRedirectUri } from "../integrations/task-sources/google-tasks/client";

describe("googleTasksRedirectUri", () => {
  const keys = ["GOOGLE_TASKS_REDIRECT_URI", "VERCEL_ENV", "VERCEL_URL"] as const;
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

  it("uses explicit GOOGLE_TASKS_REDIRECT_URI when set", () => {
    process.env.GOOGLE_TASKS_REDIRECT_URI = "https://myselfapp.xyz/api/integrations/google-tasks/callback";
    assert.equal(
      googleTasksRedirectUri(),
      "https://myselfapp.xyz/api/integrations/google-tasks/callback"
    );
  });

  it("uses myselfapp.xyz on Vercel production even if VERCEL_URL is a preview host", () => {
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_URL = "myself-git-main-saussilberg.vercel.app";
    assert.equal(
      googleTasksRedirectUri(),
      "https://myselfapp.xyz/api/integrations/google-tasks/callback"
    );
  });

  it("falls back to localhost when unset", () => {
    assert.equal(
      googleTasksRedirectUri(),
      "http://localhost:3000/api/integrations/google-tasks/callback"
    );
  });
});
