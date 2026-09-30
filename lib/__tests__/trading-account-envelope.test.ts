import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RISK_ENVELOPE } from "../trading/config";
import { accountHaltStatus, checkAccountEntry, openRiskPct, type AccountRiskState } from "../trading/risk-envelope";
import { openRiskUsd } from "../trading/tick-context";
import { newPendingPosition } from "../trading/position";
import type { TradeRow } from "../trading/store";

const state = (over: Partial<AccountRiskState> = {}): AccountRiskState => ({
  equity: 100_000,
  peak_equity: 100_000,
  realized_pnl_today: 0,
  realized_pnl_week: 0,
  kill_switch_active: false,
  entries_paused: false,
  positions: [],
  ...over,
});

describe("live account envelope (% of equity)", () => {
  it("halts on realized loss as a share of equity, not on an R count", () => {
    assert.deepEqual(accountHaltStatus({ equity: 100_000, realized_pnl_today: -2_999, realized_pnl_week: -4_999 }), { daily: false, weekly: false });
    assert.deepEqual(accountHaltStatus({ equity: 100_000, realized_pnl_today: -3_000, realized_pnl_week: -5_000 }), { daily: true, weekly: true });
  });

  it("caps the sum of open risk across trades of different sizes", () => {
    // 1% of equity short of the cap already at stake, spread over ten differently sized trades
    const cap = RISK_ENVELOPE.ACCOUNT_MAX_OPEN_RISK_PCT;
    const positions = Array.from({ length: 10 }, (_, i) => ({ symbol: `S${i}`, notional: 10_000, open_risk_usd: (cap - 0.01) * 10_000 * (i % 2 ? 1.5 : 0.5) }));
    const s = state({ positions });
    assert.ok(Math.abs(openRiskPct(s) - (cap - 0.01)) < 1e-9);
    assert.deepEqual(checkAccountEntry(s, "NEW", 900), []);
    assert.ok(checkAccountEntry(s, "NEW", 1_100).includes("MAX_OPEN_RISK"));
  });

  it("blocks a second position in a symbol, a full book, a paused account and a tripped kill switch", () => {
    assert.ok(checkAccountEntry(state({ positions: [{ symbol: "SOL", notional: 1, open_risk_usd: 0 }] }), "SOL", 100).includes("ALREADY_IN_SYMBOL"));
    const full = Array.from({ length: RISK_ENVELOPE.ACCOUNT_MAX_POSITIONS }, (_, i) => ({ symbol: `S${i}`, notional: 1, open_risk_usd: 0 }));
    assert.ok(checkAccountEntry(state({ positions: full }), "NEW", 100).includes("MAX_CONCURRENT"));
    assert.ok(checkAccountEntry(state({ entries_paused: true }), "NEW", 100).includes("ENTRIES_PAUSED"));
    const killAt = 100_000 * (1 - RISK_ENVELOPE.MASTER_KILL_SWITCH_DD);
    assert.ok(checkAccountEntry(state({ equity: killAt - 1_000, peak_equity: 100_000 }), "NEW", 100).includes("KILL_SWITCH"));
    assert.ok(!checkAccountEntry(state({ equity: killAt + 1_000, peak_equity: 100_000 }), "NEW", 100).includes("KILL_SWITCH"));
  });

  it("counts a position's risk only while its stop is below the entry", () => {
    const p = newPendingPosition({ asset_class: "STOCK", entry: 100, stop: 95, size: 10 });
    const row = (sim: typeof p) => ({ sim_state: sim, entry_limit: 100, remaining_size: 10 }) as unknown as Pick<TradeRow, "sim_state" | "entry_limit" | "remaining_size">;
    assert.equal(openRiskUsd(row(p)), 50); // pending: planned risk
    const open = { ...p, state: "OPEN" as const, entry_price: 100, size: 10 };
    assert.equal(openRiskUsd(row(open)), 50);
    assert.equal(openRiskUsd(row({ ...open, state: "RISK_FREE", stop_price: 101 })), 0);
    assert.equal(openRiskUsd(row({ ...open, state: "CLOSED" })), 0);
  });
});
