import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { claimProposal, releaseProposal, type ProposalClaimClient } from "../trading/proposal-claim";

/**
 * A minimal stand-in for the PostgREST builder, backed by one in-memory row.
 * It enforces what matters here: an update only touches the row when every
 * `.eq()` filter matches, and it reports what it actually changed.
 */
function fakeClient(row: { id: string; status: string; trade_id?: string | null }) {
  const calls: { patch: Record<string, unknown>; filters: Record<string, unknown> }[] = [];
  const client: ProposalClaimClient = {
    from() {
      return {
        update(patch: Record<string, unknown>) {
          const filters: Record<string, unknown> = {};
          const nullFilters: string[] = [];
          const builder = {
            eq(column: string, value: unknown) {
              filters[column] = value;
              return builder;
            },
            is(column: string, value: null) {
              // PostgREST: `is` is the only way to match a NULL column.
              nullFilters.push(column);
              void value;
              return builder;
            },
            async select() {
              calls.push({ patch, filters });
              const matches =
                Object.entries(filters).every(([k, v]) => (row as Record<string, unknown>)[k] === v) &&
                nullFilters.every((k) => (row as Record<string, unknown>)[k] == null);
              if (!matches) return { data: [], error: null };
              Object.assign(row, patch);
              return { data: [{ ...row }], error: null };
            },
          };
          return builder;
        },
      };
    },
  };
  return { client, row, calls };
}

describe("claimProposal", () => {
  /**
   * enterProposal used to read the status at the top and only write ENTERED at
   * the very end, after the live price, the account load, two inserts, the
   * broker call and up to 3.6s of fill polling. Two requests for the same
   * proposal — a double tap, or a client retry after a timeout — both passed
   * the read and both placed a real order: two positions in one symbol at full
   * size, which is exactly the doubled risk the envelope exists to prevent
   * (ALREADY_IN_SYMBOL cannot catch it, since neither trade exists yet).
   */
  it("succeeds once and refuses every later attempt", async () => {
    const { client, calls } = fakeClient({ id: "p1", status: "PROPOSED" });
    assert.equal(await claimProposal(client, "p1"), true);
    assert.equal(await claimProposal(client, "p1"), false);
    assert.equal(await claimProposal(client, "p1"), false);
    // The guard must be in the statement, not in a prior read.
    for (const call of calls) {
      assert.equal(call.filters.id, "p1");
      assert.equal(call.filters.status, "PROPOSED", "the claim must be conditional on the status");
    }
  });

  it("is atomic under concurrent attempts", async () => {
    const { client } = fakeClient({ id: "p1", status: "PROPOSED" });
    const results = await Promise.all([
      claimProposal(client, "p1"),
      claimProposal(client, "p1"),
      claimProposal(client, "p1"),
    ]);
    assert.equal(results.filter(Boolean).length, 1, "exactly one caller may enter the trade");
  });

  it("refuses a proposal that is already entered or expired", async () => {
    for (const status of ["ENTERED", "EXPIRED"]) {
      const { client } = fakeClient({ id: "p1", status });
      assert.equal(await claimProposal(client, "p1"), false);
    }
  });

  it("reports a database error as a failed claim rather than entering", async () => {
    const client: ProposalClaimClient = {
      from: () => ({
        update: () => ({
          eq() {
            return this;
          },
          is() {
            return this;
          },
          async select() {
            return { data: null, error: { message: "connection reset" } };
          },
        }),
      }),
    };
    assert.equal(await claimProposal(client, "p1"), false);
  });
});

describe("releaseProposal", () => {
  it("puts a claimed proposal back so a rejected attempt can be retried", async () => {
    const { client, row } = fakeClient({ id: "p1", status: "PROPOSED" });
    assert.equal(await claimProposal(client, "p1"), true);
    assert.equal(row.status, "ENTERED");
    await releaseProposal(client, "p1");
    assert.equal(row.status, "PROPOSED");
    assert.equal(await claimProposal(client, "p1"), true, "retry is possible after a release");
  });

  it("never resurrects a proposal whose trade was actually opened", async () => {
    const { client, row } = fakeClient({ id: "p1", status: "PROPOSED" });
    await claimProposal(client, "p1");
    row.trade_id = "trade-1";
    await releaseProposal(client, "p1");
    assert.equal(row.status, "ENTERED", "a proposal with a trade stays consumed");
  });
});
