import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { avgTaskCloseDays } from "../task-stats";

describe("avgTaskCloseDays", () => {
  it("returns null when no done tasks", () => {
    assert.equal(avgTaskCloseDays([{ status: "open", created_at: "2026-01-01", updated_at: "2026-01-02" }]), null);
  });

  it("averages days from creation to update for done tasks", () => {
    const avg = avgTaskCloseDays([
      {
        status: "done",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-03T00:00:00Z",
      },
      {
        status: "done",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-05T00:00:00Z",
      },
      { status: "open", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" },
    ]);
    assert.equal(avg, 3);
  });
});

describe("avgTaskCloseDays — invalid rows", () => {
  it("excludes unparseable timestamps from the divisor", () => {
    // Without the exclusion the bad row counted as a 0-day close and halved the average.
    const avg = avgTaskCloseDays([
      { status: "done", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-05T00:00:00Z" },
      { status: "done", created_at: "not-a-date", updated_at: "2026-01-05T00:00:00Z" },
    ]);
    assert.equal(avg, 4);
  });

  it("excludes rows updated before they were created", () => {
    const avg = avgTaskCloseDays([
      { status: "done", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-03T00:00:00Z" },
      { status: "done", created_at: "2026-01-10T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
    ]);
    assert.equal(avg, 2);
  });

  it("returns null when every done row is invalid", () => {
    assert.equal(
      avgTaskCloseDays([{ status: "done", created_at: "x", updated_at: "y" }]),
      null
    );
  });
});
