import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { forEachAccount } from "../db/accounts";
import { explicitUserId } from "../db/user-context";

describe("forEachAccount", () => {
  it("runs each account inside its own context, in order", async () => {
    const seen: string[] = [];
    const runs = await forEachAccount(
      async (email) => {
        await new Promise((r) => setTimeout(r, 1));
        seen.push(`${email}:${explicitUserId()}`);
        return email.length;
      },
      { accounts: ["a@example.com", "b@example.com"] }
    );
    assert.deepEqual(seen, ["a@example.com:a@example.com", "b@example.com:b@example.com"]);
    assert.deepEqual(runs, [
      { email: "a@example.com", ok: true, result: 13 },
      { email: "b@example.com", ok: true, result: 13 },
    ]);
    assert.equal(explicitUserId(), undefined);
  });

  it("records one account's failure and still runs the rest", async () => {
    const runs = await forEachAccount(
      async (email) => {
        if (email.startsWith("a")) throw new Error("boom");
        return "done";
      },
      { accounts: ["a@example.com", "b@example.com"] }
    );
    assert.deepEqual(runs, [
      { email: "a@example.com", ok: false, error: "boom" },
      { email: "b@example.com", ok: true, result: "done" },
    ]);
  });
});
