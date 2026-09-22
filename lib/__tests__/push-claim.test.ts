import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { claimSend, releaseSend, type SendLogClient } from "../push/claim";

/** In-memory stand-in for the notification_log unique (notif_type, ref_id, day_key). */
function fakeLog(existing: string[] = []) {
  const rows = new Set(existing);
  const client: SendLogClient = {
    from: () => ({
      upsert: (row: Record<string, unknown>) => ({
        async select() {
          const key = `${row.notif_type}|${row.ref_id}|${row.day_key}`;
          if (rows.has(key)) return { data: [], error: null };
          rows.add(key);
          return { data: [{ id: key }], error: null };
        },
      }),
      delete: () => {
        const filters: Record<string, unknown> = {};
        const builder = {
          eq(column: string, value: unknown) {
            filters[column] = value;
            return builder;
          },
          async select() {
            rows.delete(`${filters.notif_type}|${filters.ref_id}|${filters.day_key}`);
            return { data: [], error: null };
          },
        };
        return builder;
      },
    }),
  };
  return { client, rows };
}

const entry = { type: "habits" as const, refId: "h1", dayKey: "2026-09-23", title: "t", body: "b" };

describe("claimSend", () => {
  /**
   * notifyUser read the log, sent the push, and only then wrote the log row —
   * so two overlapping runs (a retried cron, a concurrent dispatch) both read
   * "not sent yet" and both pushed. The unique index was already there; it just
   * was not being used as the gate.
   */
  it("lets exactly one caller through for the same type, ref and day", async () => {
    const { client } = fakeLog();
    const results = await Promise.all([
      claimSend(client, entry),
      claimSend(client, entry),
      claimSend(client, entry),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
  });

  it("refuses when the day is already logged", async () => {
    const { client } = fakeLog(["habits|h1|2026-09-23"]);
    assert.equal(await claimSend(client, entry), false);
  });

  it("separates different refs, types and days", async () => {
    const { client } = fakeLog();
    assert.equal(await claimSend(client, entry), true);
    assert.equal(await claimSend(client, { ...entry, refId: "h2" }), true);
    assert.equal(await claimSend(client, { ...entry, type: "tasks" }), true);
    assert.equal(await claimSend(client, { ...entry, dayKey: "2026-09-24" }), true);
  });

  it("treats a write error as not claimed, so nothing is sent on a broken log", async () => {
    const client: SendLogClient = {
      from: () => ({
        upsert: () => ({ async select() { return { data: null, error: { message: "down" } }; } }),
        delete: () => {
          const b = {
            eq: () => b,
            async select() { return { data: [], error: null }; },
          };
          return b;
        },
      }),
    };
    assert.equal(await claimSend(client, entry), false);
  });
});

describe("releaseSend", () => {
  it("frees the slot when the push reached nobody, so a retry can send", async () => {
    const { client } = fakeLog();
    assert.equal(await claimSend(client, entry), true);
    assert.equal(await claimSend(client, entry), false);
    await releaseSend(client, entry);
    assert.equal(await claimSend(client, entry), true, "the retry may send");
  });

  it("only frees its own slot", async () => {
    const { client, rows } = fakeLog();
    await claimSend(client, entry);
    await claimSend(client, { ...entry, refId: "other" });
    await releaseSend(client, entry);
    assert.deepEqual([...rows], ["habits|other|2026-09-23"]);
  });
});
