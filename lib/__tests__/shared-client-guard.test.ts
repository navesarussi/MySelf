import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { guardSharedTables } from "../supabase";

describe("guardSharedTables", () => {
  const client = {
    tag: "service",
    from: (table: string) => ({ table }),
    rpc(this: { tag: string }, fn: string) {
      return `${this.tag}:${fn}`;
    },
  };
  const guarded = guardSharedTables(client);

  it("refuses per-account tables, even through a variable", () => {
    const table: string = "tasks";
    assert.throws(() => guarded.from(table), /per_account_table_needs_userDb:tasks/);
  });

  it("lets shared and system tables through", () => {
    assert.deepEqual(guarded.from("finance_transactions"), { table: "finance_transactions" });
    assert.deepEqual(guarded.from("trading_trades"), { table: "trading_trades" });
    assert.deepEqual(guarded.from("allowed_google_emails"), { table: "allowed_google_emails" });
  });

  it("keeps the client's other methods bound to it", () => {
    assert.equal(guarded.rpc("x"), "service:x");
  });
});
