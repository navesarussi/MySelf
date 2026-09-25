import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  alpacaAccountIssue,
  classifyAlpacaFailure,
  classifyGeminiFailure,
  formatHealthDigest,
  integrationRowIssues,
} from "../ops/health-rules";

describe("classifyGeminiFailure", () => {
  it("recognises depleted prepayment credits", () => {
    const err = new Error("Your prepayment credits are depleted. Please go to AI Studio.");
    assert.equal(classifyGeminiFailure(err), "credits_depleted");
  });

  it("recognises a 402 billing response", () => {
    const err = Object.assign(new Error("Payment Required"), { statusCode: 402, responseBody: "billing" });
    assert.equal(classifyGeminiFailure(err), "credits_depleted");
  });

  it("recognises a rejected API key", () => {
    assert.equal(classifyGeminiFailure(new Error("API key not valid. Please pass a valid API key.")), "auth_failed");
    const forbidden = Object.assign(new Error("Forbidden"), { statusCode: 403 });
    assert.equal(classifyGeminiFailure(forbidden), "auth_failed");
  });

  it("recognises quota exhaustion", () => {
    assert.equal(classifyGeminiFailure(new Error("RESOURCE_EXHAUSTED: quota exceeded")), "quota_exhausted");
  });

  it("keeps a short message for anything else", () => {
    const detail = classifyGeminiFailure(new Error("socket hang up"));
    assert.equal(detail, "error: socket hang up");
    const long = classifyGeminiFailure(new Error("x".repeat(300)));
    assert.ok(long.length < 100);
  });
});

describe("classifyAlpacaFailure", () => {
  it("maps 401/403 to auth_failed", () => {
    assert.equal(classifyAlpacaFailure(new Error('alpaca_401:{"message":"unauthorized."}')), "auth_failed");
    assert.equal(classifyAlpacaFailure(new Error("alpaca_403:forbidden")), "auth_failed");
  });

  it("keeps other statuses and plain errors", () => {
    assert.equal(classifyAlpacaFailure(new Error("alpaca_500:oops")), "http_500");
    assert.equal(classifyAlpacaFailure(new Error("fetch failed")), "error: fetch failed");
  });
});

describe("alpacaAccountIssue", () => {
  it("is null for an active, unblocked account", () => {
    assert.equal(alpacaAccountIssue({ status: "ACTIVE", trading_blocked: false, account_blocked: false }), null);
  });

  it("reports blocks and non-active status", () => {
    assert.equal(alpacaAccountIssue({ status: "ACTIVE", account_blocked: true }), "account_blocked");
    assert.equal(alpacaAccountIssue({ status: "ACTIVE", trading_blocked: true }), "trading_blocked");
    assert.equal(alpacaAccountIssue({ status: "INACTIVE" }), "status_inactive");
  });
});

describe("integrationRowIssues", () => {
  const now = new Date("2026-09-25T03:00:00Z");
  const base = {
    provider: "monday",
    account_key: "",
    refresh_token: null,
    expires_at: null,
    sync_status: "completed" as const,
    sync_started_at: null,
  };

  it("is empty for healthy rows", () => {
    const google = { ...base, provider: "google_calendar", refresh_token: "r", expires_at: "2026-09-24T00:00:00Z" };
    assert.deepEqual(integrationRowIssues([base, google], now), []);
  });

  it("flags failed and stuck syncs", () => {
    const failed = { ...base, sync_status: "failed" as const };
    const stuck = { ...base, provider: "github", sync_status: "running" as const, sync_started_at: "2026-09-24T20:00:00Z" };
    const fresh = { ...base, provider: "github", sync_status: "running" as const, sync_started_at: "2026-09-25T02:30:00Z" };
    assert.deepEqual(integrationRowIssues([failed, stuck, fresh], now), [
      { source: "monday", detail: "sync_failed" },
      { source: "github", detail: "sync_stuck" },
    ]);
  });

  it("flags expired and soon-expiring tokens that cannot refresh", () => {
    const expired = { ...base, expires_at: "2026-09-20T00:00:00Z" };
    const expiring = { ...base, provider: "github", account_key: "org", expires_at: "2026-09-26T00:00:00Z" };
    const later = { ...base, provider: "github", expires_at: "2026-12-01T00:00:00Z" };
    assert.deepEqual(integrationRowIssues([expired, expiring, later], now), [
      { source: "monday", detail: "token_expired" },
      { source: "github (org)", detail: "token_expiring" },
    ]);
  });
});

describe("formatHealthDigest", () => {
  it("returns null when healthy, so no push is sent", () => {
    assert.equal(formatHealthDigest([]), null);
  });

  it("puts every issue in one notification", () => {
    const digest = formatHealthDigest([
      { source: "gemini", detail: "credits_depleted" },
      { source: "alpaca", detail: "auth_failed" },
    ]);
    assert.ok(digest);
    assert.match(digest.title, /2/);
    assert.equal(digest.body, "• gemini: credits_depleted\n• alpaca: auth_failed");
  });
});
