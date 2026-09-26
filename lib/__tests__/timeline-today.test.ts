import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { todayIso } from "../timeline-layout";

describe("todayIso", () => {
  const prevTz = process.env.TZ;
  after(() => {
    process.env.TZ = prevTz;
  });

  it("uses the device's calendar day, not UTC", () => {
    process.env.TZ = "Asia/Jerusalem";
    // 01:30 on the 27th in Israel is still the 26th in UTC.
    assert.equal(todayIso(new Date("2026-09-26T22:30:00Z")), "2026-09-27");
    assert.equal(todayIso(new Date("2026-09-26T12:00:00Z")), "2026-09-26");
  });
});
