import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeFingerprint, normalizeMessage } from "../error-reporting/fingerprint";
import { redactUpstreamBody, redactValue } from "../error-reporting/redact";
import { isNoiseError } from "../error-reporting/noise";
import { evaluateDedupe, DEDUPE_WINDOW_MS, HOURLY_SEND_CAP } from "../error-reporting/dedupe";
import { buildPayload } from "../error-reporting/payload";

describe("error-reporting fingerprint", () => {
  it("normalizes volatile tokens in messages", () => {
    const a = normalizeMessage("failed for user 1234567890123");
    const b = normalizeMessage("failed for user 9876543210987");
    assert.equal(a, b);
  });

  it("is stable for same source, message, and route", () => {
    const a = computeFingerprint({
      source: "server",
      message: "db_error",
      route: "/api/v1/tasks",
    });
    const b = computeFingerprint({
      source: "server",
      message: "db_error",
      route: "/api/v1/tasks",
    });
    assert.equal(a, b);
  });

  it("changes when route changes", () => {
    const a = computeFingerprint({
      source: "server",
      message: "db_error",
      route: "/api/v1/tasks",
    });
    const b = computeFingerprint({
      source: "server",
      message: "db_error",
      route: "/api/v1/home",
    });
    assert.notEqual(a, b);
  });
});

describe("error-reporting redaction", () => {
  it("redacts bearer tokens and secret fields", () => {
    const body = redactValue({
      access_token: "abc123",
      note: "Bearer sk-live-abcdef",
    }) as Record<string, unknown>;
    assert.equal(body.access_token, "[REDACTED]");
    assert.match(String(body.note), /\[REDACTED\]/);
  });

  it("redacts nested upstream JSON bodies", () => {
    const body = redactUpstreamBody(
      JSON.stringify({ error: "bad", authorization: "secret-value" })
    ) as Record<string, unknown>;
    assert.equal(body.authorization, "[REDACTED]");
  });
});

describe("error-reporting noise filter", () => {
  it("skips our own 401 responses", () => {
    assert.equal(isNoiseError({ error: new Error("unauthorized"), httpStatus: 401 }), true);
  });

  it("skips expected integration reconnect codes", () => {
    assert.equal(isNoiseError({ error: new Error("integration_auth_failed") }), true);
    assert.equal(isNoiseError({ error: new Error("token_refresh_failed:google") }), true);
  });

  it("keeps unexpected server failures", () => {
    assert.equal(isNoiseError({ error: new Error("monday_graphql_failed") }), false);
  });
});

describe("error-reporting dedupe", () => {
  const now = new Date("2026-09-26T10:00:00.000Z");

  it("allows the first send", () => {
    const decision = evaluateDedupe({
      fingerprint: "abc",
      now,
      hourlySent: 0,
      noisy: false,
    });
    assert.equal(decision.shouldSend, true);
    assert.equal(decision.occurrenceCount, 1);
  });

  it("suppresses repeats inside the dedupe window", () => {
    const decision = evaluateDedupe({
      fingerprint: "abc",
      now: new Date(now.getTime() + 1_000),
      existing: {
        count: 2,
        first_seen: now.toISOString(),
        last_sent_at: now.toISOString(),
      },
      hourlySent: 1,
      noisy: false,
    });
    assert.equal(decision.shouldSend, false);
    assert.equal(decision.skipReason, "dedupe_window");
  });

  it("allows resend after the dedupe window", () => {
    const decision = evaluateDedupe({
      fingerprint: "abc",
      now: new Date(now.getTime() + DEDUPE_WINDOW_MS + 1),
      existing: {
        count: 4,
        first_seen: now.toISOString(),
        last_sent_at: now.toISOString(),
      },
      hourlySent: 2,
      noisy: false,
    });
    assert.equal(decision.shouldSend, true);
  });

  it("blocks when hourly cap is reached", () => {
    const decision = evaluateDedupe({
      fingerprint: "abc",
      now,
      hourlySent: HOURLY_SEND_CAP,
      noisy: false,
    });
    assert.equal(decision.shouldSend, false);
    assert.equal(decision.skipReason, "hourly_cap");
  });

  it("records but never sends noisy errors", () => {
    const decision = evaluateDedupe({
      fingerprint: "abc",
      now,
      hourlySent: 0,
      noisy: true,
    });
    assert.equal(decision.shouldSend, false);
    assert.equal(decision.skipReason, "noise");
  });
});

describe("error-reporting payload", () => {
  it("includes required webhook fields", () => {
    const payload = buildPayload(
      {
        source: "server",
        error: new Error("db_error"),
        context: {
          route: "/api/v1/tasks",
          method: "GET",
          integration: "monday",
          userId: "user@example.com",
        },
      },
      { now: new Date("2026-09-26T10:00:00.000Z") }
    );
    assert.equal(payload.source, "server");
    assert.equal(payload.integration, "monday");
    assert.equal(payload.userId, "user@example.com");
    assert.match(payload.fingerprint, /^[a-f0-9]{32}$/);
    assert.equal(payload.timestamp, "2026-09-26T10:00:00.000Z");
  });
});
