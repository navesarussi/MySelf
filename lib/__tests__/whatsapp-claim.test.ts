import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { claimAgentMessage, type ClaimClient } from "../agent/whatsapp-claim";

type SelectResult = { data: { id: string }[] | null; error: { message: string } | null };
type InsertResult = { error: { code?: string; message: string } | null };

/** Records what was inserted and replays canned read/write outcomes. */
function fakeClient(select: SelectResult, insert: InsertResult = { error: null }) {
  const inserted: Record<string, unknown>[] = [];
  const chain = {
    eq: () => chain,
    limit: async () => select,
  };
  const client: ClaimClient = {
    from: () => ({
      select: () => chain,
      insert: async (row: Record<string, unknown>) => {
        inserted.push(row);
        return insert;
      },
    }),
  };
  return { client, inserted };
}

const base = {
  externalId: "wamid.ABC",
  direction: "inbound" as const,
  placeholder: "[processing]",
  logTag: "test",
};

describe("claimAgentMessage", () => {
  it("claims when nothing exists", async () => {
    const { client, inserted } = fakeClient({ data: [], error: null });
    assert.equal(await claimAgentMessage({ ...base, client }), "claimed");
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].external_id, "wamid.ABC");
    assert.equal(inserted[0].direction, "inbound");
  });

  it("reports a duplicate without inserting", async () => {
    const { client, inserted } = fakeClient({ data: [{ id: "r1" }], error: null });
    assert.equal(await claimAgentMessage({ ...base, client }), "duplicate");
    assert.deepEqual(inserted, []);
  });

  it("reports a duplicate when several rows already exist", async () => {
    // The regression. The old code read with .maybeSingle(), which errors on
    // more than one row and returns data: null — so this case looked like "no
    // rows" and inserted another copy, which made the next read fail the same
    // way. One inbound message reached 123 copies that way.
    const { client, inserted } = fakeClient({
      data: [{ id: "r1" }, { id: "r2" }, { id: "r3" }],
      error: null,
    });
    assert.equal(await claimAgentMessage({ ...base, client }), "duplicate");
    assert.deepEqual(inserted, []);
  });

  it("fails closed when the existence check errors", async () => {
    // Must not be read as "nothing there" — that is what amplified the bug.
    const { client, inserted } = fakeClient({ data: null, error: { message: "boom" } });
    assert.equal(await claimAgentMessage({ ...base, client }), "error");
    assert.deepEqual(inserted, []);
  });

  it("treats a unique violation on insert as a duplicate", async () => {
    // The race the unique index is meant to catch once 0035/0036 are applied.
    const { client } = fakeClient(
      { data: [], error: null },
      { error: { code: "23505", message: "duplicate key" } }
    );
    assert.equal(await claimAgentMessage({ ...base, client }), "duplicate");
  });

  it("reports an error on any other insert failure", async () => {
    const { client } = fakeClient(
      { data: [], error: null },
      { error: { code: "08006", message: "connection failure" } }
    );
    assert.equal(await claimAgentMessage({ ...base, client }), "error");
  });

  it("uses the outbound direction and placeholder when asked", async () => {
    const { client, inserted } = fakeClient({ data: [], error: null });
    await claimAgentMessage({
      externalId: "reply:wamid.ABC",
      direction: "outbound",
      placeholder: "[sending]",
      logTag: "test",
      client,
    });
    assert.equal(inserted[0].direction, "outbound");
    assert.equal(inserted[0].content, "[sending]");
  });
});
