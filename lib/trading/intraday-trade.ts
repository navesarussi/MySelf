import { getSupabase } from "@/lib/supabase";
import { compactIntradayBars, RATER_PROMPT_VERSION, type RatingSnapshot } from "./agent-rater";
import { alpaca } from "./broker/alpaca";
import { resolveBrokerEntry } from "./engine";
import { type IntradaySymbol, type LoadedFrames } from "./intraday-data";
import { type IntradayUniverseRow } from "./intraday-universe";
import { newPendingPosition, type SimPosition } from "./position";
import { closedIdx } from "./strategy/series";
import { INTRADAY_PARAMS } from "./strategy/intraday";
import { getOpenTrades, logEvent, simColumns, updateTrade, type TradeRow } from "./store";
import { iso, type StockSession } from "./intraday-context";
import type { TradePlan } from "./types";

/**
 * One intraday trade, from rating snapshot to broker order to the first fill.
 * Shared by the tick's scan and the "search trade" button, which enter the same
 * way and differ only in what produced the plan.
 */

export function ratingSnapshotFor(input: {
  sym: IntradaySymbol;
  lf: LoadedFrames;
  frames: Map<string, LoadedFrames>;
  candidate: RatingSnapshot["candidate"];
  at: number;
}): RatingSnapshot {
  const { f } = input.lf;
  const refSymbol = input.sym.asset_class === "STOCK" ? "SPY" : "BTC";
  const ref = input.sym.symbol !== refSymbol ? input.frames.get(refSymbol) : undefined;
  return {
    symbol: input.sym.symbol,
    candidate: input.candidate,
    bars_15m: compactIntradayBars(f.s15.bars.slice(0, closedIdx(f.s15, input.at) + 1), 64),
    bars_5m: compactIntradayBars(f.s5.bars.slice(0, closedIdx(f.s5, input.at) + 1), 36),
    reference: ref ? { symbol: refSymbol, bars_15m: compactIntradayBars(ref.f.s15.bars.slice(0, closedIdx(ref.f.s15, input.at) + 1), 32) } : null,
  };
}

export async function insertIntradayTrade(input: {
  trigger_id: string;
  sym: IntradaySymbol;
  strategy_version: string;
  setup: string;
  score: number | null;
  execution: "SHADOW" | "PAPER";
  plan: { entry: number; stop: number; size: number; risk_amount: number };
  target: number;
  trigger_time: number;
  snapshot: Record<string, unknown>;
  chart: TradeRow["chart_bars"];
  agent?: { rating: number | null; explanation: string | null; model_version: string; prompt_version: string };
  pending_expiry_bars?: number;
}): Promise<string> {
  const p = INTRADAY_PARAMS;
  const pos = newPendingPosition({ asset_class: input.sym.asset_class, entry: input.plan.entry, stop: input.plan.stop, size: input.plan.size });
  pos.exit_plan = "STRUCTURAL";
  pos.target_price = input.target;
  pos.initial_target_price = input.target;
  pos.breakeven_at_r = p.breakeven_at_r;
  pos.partial_fraction = 0;
  pos.trail_after_r = p.trail_after_r;
  pos.trail_mult = p.trail_mult_atr15;
  if (input.pending_expiry_bars) pos.pending_expiry_bars = input.pending_expiry_bars;
  const { data, error } = await getSupabase()
    .from("trading_trades")
    .insert({
      trigger_id: input.trigger_id,
      symbol: input.sym.symbol,
      asset_class: input.sym.asset_class,
      bucket_id: `${input.strategy_version}:${input.setup}`,
      mode: "INTRADAY",
      // Single account trade — no separate agent-decision track in the intraday/manual flows.
      track: "AGENT",
      execution: input.execution,
      trigger_timestamp: iso(input.trigger_time),
      trigger_snapshot: input.snapshot,
      agent_decision: "ENTER",
      agent_risk_multiplier: 1,
      agent_model_version: input.agent?.model_version ?? "rating-only",
      prompt_version: input.agent?.prompt_version ?? RATER_PROMPT_VERSION,
      agent_rating: input.agent?.rating ?? null,
      agent_rating_explanation: input.agent?.explanation ?? null,
      agent_reasoning: input.agent?.explanation ?? null,
      param_version: p.version,
      strategy_version: input.strategy_version,
      setup: input.setup,
      score: input.score,
      entry_limit: input.plan.entry,
      initial_stop_price: input.plan.stop,
      position_size: input.plan.size,
      risk_amount: input.plan.risk_amount,
      chart_bars: input.chart,
      baseline_enter: true,
      events: [],
      ...simColumns(pos),
    })
    .select("id")
    .single();
  if (error) throw new Error(`insert intraday trade: ${error.message}`);
  return (data as { id: string }).id;
}

/** Send the entry to Alpaca paper. Stocks: bracket (day) with stop + take-profit; crypto: plain order, stop placed on fill. */
export async function placeIntradayBrokerEntry(input: { tradeId: string; sym: IntradaySymbol; plan: TradePlan; target: number; orderType: "limit" | "market"; now: number }): Promise<{ ok: boolean; reason?: string }> {
  try {
    const order = await alpaca.placeEntry({
      symbol: input.sym.symbol,
      assetClass: input.sym.asset_class,
      qty: input.plan.size,
      limit: input.plan.entry,
      stop: input.plan.stop,
      target: input.target,
      clientId: `${input.tradeId.slice(0, 18)}-in`,
      orderType: input.orderType,
      timeInForce: input.sym.asset_class === "STOCK" ? "day" : "gtc",
    });
    await updateTrade(input.tradeId, { broker: "ALPACA_PAPER", broker_entry_order_id: order.id, broker_status: order.status });
    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 160) : "broker_error";
    await updateTrade(input.tradeId, { state: "CANCELLED", exit_reason: "BROKER_REJECTED", broker: "ALPACA_PAPER", broker_status: reason, closed_at: iso(input.now) });
    await logEvent({ kind: "BROKER_REJECTED", symbol: input.sym.symbol, severity: "warn", message: `${input.sym.symbol}: הברוקר דחה פקודה תוך-יומית — ${reason}` });
    return { ok: false, reason };
  }
}

/**
 * Resolve a just-placed broker entry immediately (a market order usually fills within a second) so the trade shows
 * OPEN with its broker-side protective stop right away instead of waiting for the next 5-minute tick.
 */
export async function syncBrokerEntryNow(tradeId: string, now = Date.now()): Promise<TradeRow["state"] | null> {
  const trade = (await getOpenTrades()).find((t) => t.id === tradeId);
  if (!trade?.broker || trade.state !== "PENDING") return trade?.state ?? null;
  const pos: SimPosition = { ...trade.sim_state };
  const events: TradeRow["events"] = [...(trade.events ?? [])];
  const outcome = await resolveBrokerEntry(trade, pos, events, now);
  await updateTrade(trade.id, { ...simColumns(pos), ...outcome.patch, events });
  return pos.state;
}

/** Symbols the tick scans: only what the Alpaca demo account can trade (no simulated-only trades), stocks while the market is open. */
export function scannableSymbols(universe: IntradayUniverseRow[], session: StockSession): IntradayUniverseRow[] {
  return universe.filter((u) => u.broker_tradable && (u.asset_class !== "STOCK" || session.open));
}
