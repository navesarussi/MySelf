import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { explicitUserId, NoUserContextError, runAsUser } from "../db/user-context";

describe("runAsUser", () => {
  it("has no account outside a run", () => {
    assert.equal(explicitUserId(), undefined);
  });

  it("keeps the account across awaits and normalises it", async () => {
    await runAsUser("  Someone@Example.com ", async () => {
      await new Promise((r) => setTimeout(r, 1));
      assert.equal(explicitUserId(), "someone@example.com");
    });
    assert.equal(explicitUserId(), undefined);
  });

  it("lets an inner run take over and restores the outer one", async () => {
    await runAsUser("a@example.com", async () => {
      await runAsUser("b@example.com", async () => {
        assert.equal(explicitUserId(), "b@example.com");
      });
      assert.equal(explicitUserId(), "a@example.com");
    });
  });

  it("keeps concurrent runs apart", async () => {
    const seen: string[] = [];
    await Promise.all(
      ["a@example.com", "b@example.com"].map((id) =>
        runAsUser(id, async () => {
          await new Promise((r) => setTimeout(r, id.startsWith("a") ? 5 : 1));
          seen.push(`${id}=${explicitUserId()}`);
        })
      )
    );
    assert.deepEqual(seen.sort(), ["a@example.com=a@example.com", "b@example.com=b@example.com"]);
  });

  it("rejects an empty account", () => {
    assert.throws(() => runAsUser("  ", async () => undefined), NoUserContextError);
  });
});
