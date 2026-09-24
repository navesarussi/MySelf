import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scopedClient } from "../db/scoped";
import { isPersonalTable, PERSONAL_TABLES } from "../db/tenancy";

type Call = { method: string; args: unknown[] };

/** Records every builder call so the test can see exactly what reached PostgREST. */
function recordingBase() {
  const calls: Call[] = [];
  const chain = (): Record<string, (...args: unknown[]) => unknown> =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => (...args: unknown[]) => {
          calls.push({ method, args });
          return chain();
        },
      }
    ) as Record<string, (...args: unknown[]) => unknown>;
  const base = {
    from(table: string) {
      calls.push({ method: "from", args: [table] });
      return chain();
    },
  };
  return { base, calls };
}

const UID = "someone@example.com";

describe("scopedClient", () => {
  it("filters selects to the current account", () => {
    const { base, calls } = recordingBase();
    scopedClient(base, UID).from("tasks").select("id, title", { count: "exact" });
    assert.deepEqual(calls, [
      { method: "from", args: ["tasks"] },
      { method: "select", args: ["id, title", { count: "exact" }] },
      { method: "eq", args: ["user_id", UID] },
    ]);
  });

  it("filters deletes to the current account", () => {
    const { base, calls } = recordingBase();
    scopedClient(base, UID).from("habits").delete();
    assert.deepEqual(calls.slice(1), [
      { method: "delete", args: [] },
      { method: "eq", args: ["user_id", UID] },
    ]);
  });

  it("filters updates and pins user_id so a row cannot be handed to another account", () => {
    const { base, calls } = recordingBase();
    scopedClient(base, UID).from("goals").update({ title: "x", user_id: "other@example.com" });
    assert.deepEqual(calls.slice(1), [
      { method: "update", args: [{ title: "x", user_id: UID }] },
      { method: "eq", args: ["user_id", UID] },
    ]);
  });

  it("stamps inserts, single rows and arrays alike", () => {
    const { base, calls } = recordingBase();
    const db = scopedClient(base, UID);
    db.from("tasks").insert({ title: "a", user_id: "other@example.com" });
    db.from("tasks").insert([{ title: "b" }, { title: "c" }]);
    assert.deepEqual(calls[1], { method: "insert", args: [{ title: "a", user_id: UID }] });
    assert.deepEqual(calls[3], {
      method: "insert",
      args: [[{ title: "b", user_id: UID }, { title: "c", user_id: UID }]],
    });
  });

  it("stamps upserts and passes the options through", () => {
    const { base, calls } = recordingBase();
    scopedClient(base, UID)
      .from("integration_tokens")
      .upsert({ provider: "github" }, { onConflict: "user_id,provider,account_key" });
    assert.deepEqual(calls[1], {
      method: "upsert",
      args: [{ provider: "github", user_id: UID }, { onConflict: "user_id,provider,account_key" }],
    });
  });

  it("refuses tables that are not per-account", () => {
    const { base } = recordingBase();
    const db = scopedClient(base, UID);
    assert.throws(() => db.from("finance_transactions" as never), /not_a_personal_table/);
  });
});

describe("PERSONAL_TABLES", () => {
  it("holds exactly the 18 per-account tables", () => {
    assert.equal(PERSONAL_TABLES.length, 18);
    assert.equal(new Set(PERSONAL_TABLES).size, 18);
    assert.ok(isPersonalTable("push_tokens"));
    assert.ok(!isPersonalTable("trading_trades"));
    assert.ok(!isPersonalTable("allowed_google_emails"));
  });
});
