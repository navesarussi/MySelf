import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { kickoffTaskSourceSync } from "../../mobile/src/query/task-sync";
import type { ApiConfig } from "../../mobile/src/api/client";

const config = { baseUrl: "https://example.test", token: "t" } as unknown as ApiConfig;

describe("kickoffTaskSourceSync", () => {
  it("polls until the provider leaves the running state", async () => {
    const statuses = ["running", "running", "completed"] as const;
    let polls = 0;
    const result = await kickoffTaskSourceSync(
      config,
      async () => ({ ok: true, started: true }),
      async () => ({ syncStatus: statuses[Math.min(polls++, statuses.length - 1)] })
    );

    assert.deepEqual(result, { ok: true });
    assert.equal(polls, 3, "should keep polling while the sync is running");
  });

  it("polls when the server reports a sync already in flight", async () => {
    let polls = 0;
    await kickoffTaskSourceSync(
      config,
      async () => ({ ok: true, alreadyRunning: true }),
      async () => {
        polls++;
        return { syncStatus: "idle" as const };
      }
    );

    assert.equal(polls, 1, "alreadyRunning must still await completion");
  });

  it("does not poll when the kick fails", async () => {
    let polls = 0;
    const result = await kickoffTaskSourceSync(
      config,
      async () => ({ ok: false }),
      async () => {
        polls++;
        return { syncStatus: "idle" as const };
      }
    );

    assert.equal(result.ok, false);
    assert.equal(polls, 0);
  });

  it("returns synchronous counts when the server synced inline", async () => {
    let polls = 0;
    const result = await kickoffTaskSourceSync(
      config,
      async () => ({ ok: true, imported: 4, markedDone: 1 }),
      async () => {
        polls++;
        return { syncStatus: "idle" as const };
      }
    );

    assert.equal(result.imported, 4);
    assert.equal(result.markedDone, 1);
    assert.equal(polls, 0, "inline results need no polling");
  });
});
