import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  attributeCommitteeBlocks,
  classifyBlockOutcome,
  pickBaselineTrade,
  type BaselineTradeOutcome,
  type BlockOutcomeRow,
} from "../trading/committee/block-attribution";

function row(partial: Partial<BlockOutcomeRow> & Pick<BlockOutcomeRow, "would_have_executed" | "outcome">): BlockOutcomeRow {
  return { status: "COMPLETED", blocks: [], latency_ms: 50_000, ...partial };
}

/** Committee denied what the baseline entered — the only rows attribution looks at. */
function blocked(ticket: string, trade: BaselineTradeOutcome | null): BlockOutcomeRow {
  return row({
    ticket_id: ticket,
    symbol: ticket,
    would_have_executed: false,
    outcome: "BLOCKED",
    blocks: ["PORTFOLIO_HEAT"],
    certificate: { ok: false, blocks: ["PORTFOLIO_HEAT"] },
    baseline_would_enter: true,
    baseline_trade: trade,
  });
}

function closed(r: number, track = "AGENT"): BaselineTradeOutcome {
  return { track, state: "CLOSED", realized_r: r, realized_pnl: r * 100, closed_at: "2026-09-20T15:00:00.000Z" };
}

describe("committee hard-block closed-trade attribution", () => {
  describe("classifyBlockOutcome", () => {
    it("a block on a trade that closed red avoided a loss", () => {
      const out = classifyBlockOutcome(blocked("t1", closed(-1)));
      assert.equal(out.verdict, "AVOIDED_LOSS");
      assert.equal(out.realized_r, -1);
    });

    it("a block on a trade that closed green is a false positive", () => {
      const out = classifyBlockOutcome(blocked("t2", closed(2.4)));
      assert.equal(out.verdict, "SKIPPED_WINNER");
      assert.equal(out.realized_r, 2.4);
    });

    it("a flat close is neither saved nor missed", () => {
      assert.equal(classifyBlockOutcome(blocked("t3", closed(0))).verdict, "SCRATCH");
    });

    it("an open trade has no outcome yet", () => {
      const open: BaselineTradeOutcome = { track: "AGENT", state: "OPEN", realized_r: null, realized_pnl: null, closed_at: null };
      assert.equal(classifyBlockOutcome(blocked("t4", open)).verdict, "UNRESOLVED");
    });

    it("a cancelled trade never entered, so the block avoided nothing", () => {
      const cancelled: BaselineTradeOutcome = { track: "AGENT", state: "CANCELLED", realized_r: 0, realized_pnl: 0, closed_at: null };
      assert.equal(classifyBlockOutcome(blocked("t5", cancelled)).verdict, "UNRESOLVED");
    });

    it("no linked trade is unresolved, not a false positive", () => {
      assert.equal(classifyBlockOutcome(blocked("t6", null)).verdict, "UNRESOLVED");
      assert.equal(classifyBlockOutcome(blocked("t7", closed(Number.NaN))).verdict, "UNRESOLVED");
    });

    it("carries the primary block code for attribution", () => {
      assert.equal(classifyBlockOutcome(blocked("t8", closed(-0.5))).primary_block, "PORTFOLIO_HEAT");
    });
  });

  describe("attributeCommitteeBlocks", () => {
    it("counts only committee-only blocks, not agreements or baseline-only entries", () => {
      const rows: BlockOutcomeRow[] = [
        blocked("b1", closed(-1)),
        // both sides agree to enter — never a block
        row({
          ticket_id: "a1",
          would_have_executed: true,
          outcome: "WOULD_EXECUTE",
          baseline_would_enter: true,
          baseline_trade: closed(3),
        }),
        // baseline-only entry: committee executes, baseline would not
        row({
          ticket_id: "e1",
          would_have_executed: true,
          outcome: "WOULD_EXECUTE",
          baseline_would_enter: false,
          baseline_trade: closed(-2),
        }),
        // baseline would not enter either — nothing was blocked
        row({ ticket_id: "s1", would_have_executed: false, outcome: "SKIPPED", baseline_would_enter: false, baseline_trade: closed(1) }),
      ];
      const summary = attributeCommitteeBlocks(rows);
      assert.equal(summary.blocks, 1);
      assert.equal(summary.resolved, 1);
      assert.equal(summary.avoided_losses, 1);
      assert.equal(summary.skipped_winners, 0);
    });

    it("false positive rate is over blocks with a known outcome, not over all blocks", () => {
      const rows = [
        blocked("w1", closed(1.5)),
        blocked("l1", closed(-1)),
        blocked("l2", closed(-1)),
        blocked("u1", null),
        blocked("u2", { track: "AGENT", state: "OPEN", realized_r: null, realized_pnl: null, closed_at: null }),
      ];
      const summary = attributeCommitteeBlocks(rows);
      assert.equal(summary.blocks, 5);
      assert.equal(summary.resolved, 3);
      assert.equal(summary.unresolved, 2);
      assert.equal(summary.skipped_winners, 1);
      assert.equal(summary.avoided_losses, 2);
      // 1 winner skipped out of 3 resolved — the two unknowns do not count against the committee
      assert.ok(Math.abs(summary.false_positive_rate! - 1 / 3) < 1e-9);
    });

    it("reports R saved and R missed as positive magnitudes plus the net", () => {
      const summary = attributeCommitteeBlocks([blocked("w1", closed(2)), blocked("l1", closed(-1)), blocked("l2", closed(-0.5))]);
      assert.equal(summary.r_missed, 2);
      assert.equal(summary.r_saved, 1.5);
      assert.equal(summary.net_r_saved, -0.5);
      assert.equal(summary.net_r_per_block, -0.1667); // -0.5R over 3 blocks, stored to 4 decimals
    });

    it("a low false-positive rate can still lose money — one big winner against many small losers", () => {
      const rows = [blocked("w1", closed(8)), ...Array.from({ length: 9 }, (_, i) => blocked(`l${i}`, closed(-0.5)))];
      const summary = attributeCommitteeBlocks(rows);
      assert.equal(summary.false_positive_rate, 0.1);
      assert.equal(summary.r_saved, 4.5);
      assert.equal(summary.r_missed, 8);
      assert.equal(summary.net_r_saved, -3.5);
      assert.ok(summary.net_r_per_block! < 0);
    });

    it("scratches are resolved but move neither side", () => {
      const summary = attributeCommitteeBlocks([blocked("s1", closed(0)), blocked("l1", closed(-1))]);
      assert.equal(summary.resolved, 2);
      assert.equal(summary.scratches, 1);
      assert.equal(summary.false_positive_rate, 0);
      assert.equal(summary.r_saved, 1);
      assert.equal(summary.r_missed, 0);
    });

    it("no resolved block means no rate at all, rather than a flattering zero", () => {
      const summary = attributeCommitteeBlocks([blocked("u1", null)]);
      assert.equal(summary.blocks, 1);
      assert.equal(summary.resolved, 0);
      assert.equal(summary.false_positive_rate, null);
      assert.equal(summary.net_r_per_block, null);
    });

    it("empty input is all zeros", () => {
      const summary = attributeCommitteeBlocks([]);
      assert.equal(summary.blocks, 0);
      assert.equal(summary.false_positive_rate, null);
      assert.equal(summary.net_r_saved, 0);
      assert.deepEqual(summary.cases, []);
    });

    it("keeps dollar totals alongside R", () => {
      const summary = attributeCommitteeBlocks([blocked("w1", closed(1)), blocked("l1", closed(-2))]);
      assert.equal(summary.pnl_missed, 100);
      assert.equal(summary.pnl_saved, 200);
    });

    it("does not mutate its input", () => {
      const rows = [blocked("w1", closed(1))];
      const before = JSON.stringify(rows);
      attributeCommitteeBlocks(rows);
      assert.equal(JSON.stringify(rows), before);
    });
  });

  describe("pickBaselineTrade", () => {
    it("prefers a closed trade over one still running", () => {
      const open: BaselineTradeOutcome = { track: "AGENT", state: "OPEN", realized_r: null, realized_pnl: null, closed_at: null };
      const pick = pickBaselineTrade([open, closed(-1, "DETERMINISTIC")]);
      assert.equal(pick?.state, "CLOSED");
      assert.equal(pick?.track, "DETERMINISTIC");
    });

    it("prefers the agent track when both closed — it is the baseline the committee is compared to", () => {
      const pick = pickBaselineTrade([closed(-1, "DETERMINISTIC"), closed(2, "AGENT")]);
      assert.equal(pick?.track, "AGENT");
      assert.equal(pick?.realized_r, 2);
    });

    it("takes the most recent close when the track is the same", () => {
      const older = { ...closed(1), closed_at: "2026-09-01T10:00:00.000Z" };
      const newer = { ...closed(-1), closed_at: "2026-09-10T10:00:00.000Z" };
      assert.equal(pickBaselineTrade([older, newer])?.realized_r, -1);
    });

    it("returns null with nothing to pick", () => {
      assert.equal(pickBaselineTrade([]), null);
    });
  });
});
