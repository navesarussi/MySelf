import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isQuietHour, jerusalemParts } from "../push/time";
import { isValidExpoPushToken } from "../push/tokens";
import { isTypeEnabled } from "../push/preferences";
import type { NotificationPreferences } from "../push/types";

describe("isQuietHour", () => {
  it("wraps midnight for 22–7", () => {
    assert.equal(isQuietHour(22, 22, 7), true);
    assert.equal(isQuietHour(23, 22, 7), true);
    assert.equal(isQuietHour(0, 22, 7), true);
    assert.equal(isQuietHour(6, 22, 7), true);
    assert.equal(isQuietHour(7, 22, 7), false);
    assert.equal(isQuietHour(12, 22, 7), false);
  });

  it("handles same-day quiet window", () => {
    assert.equal(isQuietHour(13, 12, 14), true);
    assert.equal(isQuietHour(11, 12, 14), false);
    assert.equal(isQuietHour(14, 12, 14), false);
  });

  it("treats equal start/end as no quiet", () => {
    assert.equal(isQuietHour(5, 5, 5), false);
  });
});

describe("jerusalemParts", () => {
  it("returns dayKey YYYY-MM-DD and hour 0-23", () => {
    const { dayKey, hour } = jerusalemParts(new Date("2026-07-27T10:00:00Z"));
    assert.match(dayKey, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(hour >= 0 && hour <= 23);
  });
});

describe("isValidExpoPushToken", () => {
  it("accepts Expo format", () => {
    assert.equal(isValidExpoPushToken("ExponentPushToken[abc123]"), true);
  });
  it("rejects garbage", () => {
    assert.equal(isValidExpoPushToken("not-a-token"), false);
    assert.equal(isValidExpoPushToken(""), false);
  });
});

describe("isTypeEnabled", () => {
  const base: NotificationPreferences = {
    enabled: true,
    agent: true,
    relationships: false,
    habits: true,
    tasks: true,
    timeline: true,
    quiet_start_hour: 22,
    quiet_end_hour: 7,
    updated_at: new Date().toISOString(),
  };

  it("respects master and per-type", () => {
    assert.equal(isTypeEnabled(base, "agent"), true);
    assert.equal(isTypeEnabled(base, "relationships"), false);
    assert.equal(isTypeEnabled({ ...base, enabled: false }, "habits"), false);
    assert.equal(isTypeEnabled({ ...base, enabled: false }, "test"), true);
  });
});
