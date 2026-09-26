import { getSupabase } from "@/lib/supabase";
import { alpaca, alpacaSymbol, isAlpacaConfigured, type AlpacaFillActivity } from "./alpaca";
import { settleTrade, settlementColumns, type BrokerFill } from "./ledger";
import { normalizeTrade, type TradeRow } from "../store";

/**
 * Settle closed broker trades from Alpaca's fills: entry VWAP, exit VWAP, fees,
 * P&L and R become what the demo account actually did, replacing the
 * simulator's estimate. Runs at the end of every tick; a trade is settled once
 * (broker_settled_at) as soon as its sells cover the buy.
 */

/** How far back the ticks look for trades still waiting to be settled. */
export const SETTLE_LOOKBACK_MS = 7 * 86_400_000;

/** A cancelled entry with no fill after this long never filled. */
const NO_FILL_GRACE_MS = 60 * 60_000;

/** Fills before the entry order was sent cannot belong to the trade. */
const WINDOW_SLACK_MS = 60_000;

export function toBrokerFill(a: AlpacaFillActivity): BrokerFill {
  return { order_id: a.order_id, side: a.side, qty: Number(a.qty), price: Number(a.price), at: Date.parse(a.transaction_time) };
}

type Candidate = Pick<TradeRow, "id" | "symbol" | "asset_class" | "state" | "created_at" | "closed_at" | "initial_stop_price" | "risk_amount" | "broker_entry_order_id" | "exit_reason" | "realized_r" | "realized_pnl" | "sim_state" | "events">;

/**
 * Each trade owns the symbol's fills from its own entry order until the next
 * broker trade on the same symbol was created (one position per symbol).
 */
export function tradeWindows(trades: Pick<TradeRow, "id" | "symbol" | "created_at">[]): Map<string, { from: number; to: number }> {
  const bySymbol = new Map<string, Pick<TradeRow, "id" | "symbol" | "created_at">[]>();
  for (const t of trades) bySymbol.set(t.symbol, [...(bySymbol.get(t.symbol) ?? []), t]);
  const out = new Map<string, { from: number; to: number }>();
  for (const list of bySymbol.values()) {
    list.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    list.forEach((t, i) => {
      const next = list[i + 1];
      out.set(t.id, { from: Date.parse(t.created_at) - WINDOW_SLACK_MS, to: next ? Date.parse(next.created_at) - 1 : Infinity });
    });
  }
  return out;
}

export type SettleReport = { id: string; symbol: string; before_r: number | null; after_r: number; before_pnl: number | null; after_pnl: number };

export async function settleBrokerTrades(input: { now: number; sinceMs: number; ids?: string[]; dryRun?: boolean }): Promise<{ settled: number; pending: number; report: SettleReport[] }> {
  const report: SettleReport[] = [];
  if (!isAlpacaConfigured()) return { settled: 0, pending: 0, report };
  const sb = getSupabase();
  let q = sb
    .from("trading_trades")
    .select("id, symbol, asset_class, state, created_at, closed_at, initial_stop_price, risk_amount, broker_entry_order_id, broker_filled_qty, exit_reason, realized_r, realized_pnl, sim_state, events")
    .not("broker_entry_order_id", "is", null)
    .is("broker_settled_at", null)
    .in("state", ["CLOSED", "CANCELLED"])
    .gte("created_at", new Date(input.sinceMs).toISOString());
  if (input.ids?.length) q = q.in("id", input.ids);
  const { data, error } = await q;
  if (error) throw new Error(`settle candidates: ${error.message}`);
  // Cancelled rows are included on purpose: a "cancel" sent to an order Alpaca had already filled left a
  // real position no journal row tracked — 2026-09-14…25 that was ~$10K of real P&L (PEPE +$5.3K) that
  // never reached the journal. The fills decide whether a cancelled entry was a trade.
  const candidates = ((data ?? []) as Record<string, unknown>[]).map((r) => normalizeTrade(r)) as Candidate[];
  if (!candidates.length) return { settled: 0, pending: 0, report };

  const from = Math.min(...candidates.map((t) => Date.parse(t.created_at))) - WINDOW_SLACK_MS;
  const { data: neighbours, error: nErr } = await sb
    .from("trading_trades")
    .select("id, symbol, created_at")
    .not("broker_entry_order_id", "is", null)
    .gte("created_at", new Date(from).toISOString());
  if (nErr) throw new Error(`settle windows: ${nErr.message}`);
  const windows = tradeWindows((neighbours ?? []) as Pick<TradeRow, "id" | "symbol" | "created_at">[]);
  const fills = await alpaca.fills({ after: from, until: input.now });

  let settled = 0;
  let pending = 0;
  for (const t of candidates) {
    const w = windows.get(t.id) ?? { from: Date.parse(t.created_at) - WINDOW_SLACK_MS, to: Infinity };
    const sym = alpacaSymbol(t.symbol, t.asset_class);
    const mine = fills.filter((f) => f.symbol === sym).map(toBrokerFill).filter((f) => f.at >= w.from && f.at <= w.to);
    const s = settleTrade({ assetClass: t.asset_class, entryOrderId: t.broker_entry_order_id!, initialStop: t.initial_stop_price, plannedRisk: t.risk_amount, fills: mine });
    if (!s) {
      const entryFilled = mine.some((f) => f.side === "buy" && f.order_id === t.broker_entry_order_id);
      const closedAt = Date.parse(t.closed_at ?? t.created_at);
      // An entry that never filled is settled as "nothing happened" once Alpaca has had time to report a
      // late fill, so the tick stops re-reading it.
      if (!entryFilled && t.state === "CANCELLED" && input.now - closedAt > NO_FILL_GRACE_MS && !input.dryRun) {
        await sb.from("trading_trades").update({ broker_settled_at: new Date(input.now).toISOString() }).eq("id", t.id);
      } else pending += 1;
      continue;
    }
    const cols = settlementColumns(s);
    report.push({ id: t.id, symbol: t.symbol, before_r: t.realized_r, after_r: cols.realized_r, before_pnl: t.realized_pnl, after_pnl: cols.realized_pnl });
    if (input.dryRun) {
      settled += 1;
      continue;
    }
    const p = { ...t.sim_state };
    p.entry_price = s.entry_price;
    p.exit_price = s.exit_price;
    p.initial_size = s.entry_qty;
    p.size = 0;
    p.stop_distance = s.risk / s.entry_qty;
    p.cash_flow = s.pnl;
    p.fees_paid = s.fees;
    p.opened_at = p.opened_at ?? s.opened_at;
    p.closed_at = s.closed_at;
    p.state = "CLOSED";
    // A partial fill that was unwound is still a (small) real trade.
    if (!p.exit_reason) p.exit_reason = "MANUAL";
    const { error: uErr } = await sb
      .from("trading_trades")
      .update({
        ...cols,
        state: "CLOSED",
        // An unwound partial keeps its descriptive reason (PARTIAL_FILL_7PCT_UNWOUND).
        exit_reason: t.state === "CANCELLED" ? (t.exit_reason ?? p.exit_reason) : p.exit_reason,
        opened_at: new Date(p.opened_at).toISOString(),
        closed_at: new Date(s.closed_at).toISOString(),
        sim_state: p,
        broker_settled_at: new Date(input.now).toISOString(),
        updated_at: new Date(input.now).toISOString(),
      })
      .eq("id", t.id);
    if (uErr) throw new Error(`settle ${t.symbol}: ${uErr.message}`);
    settled += 1;
  }
  return { settled, pending, report };
}
