import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { syncedToday } from "../integrations/daily-sync";

describe("syncedToday", () => {
  const cron = new Date("2026-09-26T06:00:00Z");

  it("does not skip after a sync late the previous day (the every-other-day bug)", () => {
    assert.equal(syncedToday("2026-09-25T11:51:33Z", cron), false);
  });

  it("skips when the provider already synced earlier the same UTC day", () => {
    assert.equal(syncedToday("2026-09-26T05:10:00Z", cron), true);
  });

  it("never skips without a previous sync or with a bad timestamp", () => {
    assert.equal(syncedToday(null, cron), false);
    assert.equal(syncedToday(undefined, cron), false);
    assert.equal(syncedToday("not-a-date", cron), false);
  });
});
