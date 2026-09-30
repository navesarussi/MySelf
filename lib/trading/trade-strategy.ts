import { alpaca, ensureOcoExit, ensureProtectiveStop } from "./broker/alpaca";
import type { SimPosition } from "./position";
import { getOpenTrades, logEvent, simColumns, updateTrade, type TradeRow } from "./store";
import { BRACKET_STRATEGIES, BRACKET_TARGET_R, strategyChoices, type StrategyChoice } from "./strategy-options";
import { BOOK_STRATEGY_VERSION } from "./strategy-versions";
import { defFor, type StrategyId } from "./strategy/multi";
import { NO_TARGET_R } from "./trade-edit";

/**
 * Hand an open trade to another strategy (the trade card's "move to strategy"). The trade joins the book under
 * that strategy's exits: signal strategies get no take-profit (placeholder target, their exit rule decides);
 * the bracket strategy gets a real take-profit at BRACKET_TARGET_R and an OCO at the broker; MANUAL keeps the
 * stop and target only. The initial stop — what R is measured against — never changes.
 */

export class StrategyMoveError extends Error {}

export type StrategyMovePlan = { setup: StrategyChoice; target: number; sim: Partial<SimPosition> };

/** Pure: the journal levels for `trade` under `setup`. */
export function planStrategyMove(trade: Pick<TradeRow, "symbol" | "asset_class" | "setup" | "strategy_version" | "state"> & { sim_state: SimPosition }, setup: StrategyChoice): StrategyMovePlan {
  if (trade.state !== "OPEN" && trade.state !== "RISK_FREE") throw new StrategyMoveError("trade_not_open");
  if (!strategyChoices(trade).includes(setup)) throw new StrategyMoveError("strategy_not_allowed");
  const p = trade.sim_state;
  const entry = p.entry_price;
  if (entry === null) throw new StrategyMoveError("no_fill_yet");
  const oneR = p.stop_distance > 0 ? p.stop_distance : entry - p.stop_price;
  if (!(oneR > 0)) throw new StrategyMoveError("no_risk_defined");
  if (setup === "MANUAL") return { setup, target: p.target_price, sim: {} };
  const target = BRACKET_STRATEGIES.has(setup) ? entry + BRACKET_TARGET_R * oneR : entry + NO_TARGET_R * oneR;
  const m = defFor(setup as StrategyId).manage;
  return {
    setup,
    target,
    sim: { target_price: target, breakeven_at_r: m.breakeven_at_r, trail_after_r: m.trail_after_r, trail_mult: m.trail_mult, exit_plan: "STRUCTURAL", bars_held: 0, strategy_since: Date.now() },
  };
}

export async function moveTradeToStrategy(tradeId: string, setup: StrategyChoice, now = Date.now()): Promise<TradeRow> {
  const trade = (await getOpenTrades()).find((t) => t.id === tradeId);
  if (!trade) throw new StrategyMoveError("trade_not_open");
  const plan = planStrategyMove(trade, setup);
  const p: SimPosition = { ...trade.sim_state, ...plan.sim };
  const patch: Record<string, unknown> = {};

  if (trade.broker) {
    const wantsBracket = trade.asset_class === "STOCK" && BRACKET_STRATEGIES.has(setup);
    const hadTarget = trade.broker_target_order_id ? await alpaca.getOrder(trade.broker_target_order_id).catch(() => null) : null;
    const targetLive = hadTarget && !["filled", "canceled", "expired", "rejected"].includes(hadTarget.status);
    if (wantsBracket) {
      // Replaces any lone stop with a take-profit + stop OCO.
      const oco = await ensureOcoExit({ tradeId: trade.id, symbol: trade.symbol, qty: p.size, stop: p.stop_price, target: plan.target, now });
      if (oco) {
        patch.broker_stop_order_id = oco.stop?.id ?? null;
        patch.broker_target_order_id = oco.target.id;
      }
    } else if (targetLive && setup !== "MANUAL") {
      // Leaving a bracket for a signal-exit strategy: drop the take-profit, keep a protective stop.
      await alpaca.cancelOrder(hadTarget.id).catch(() => null);
      patch.broker_target_order_id = null;
      const stop = await ensureProtectiveStop({ tradeId: trade.id, symbol: trade.symbol, assetClass: trade.asset_class, qty: p.size, stop: p.stop_price, now });
      patch.broker_stop_order_id = stop?.id ?? null;
    }
  }

  const from = trade.strategy_version === BOOK_STRATEGY_VERSION ? (trade.setup ?? "MANUAL") : `${trade.strategy_version}${trade.setup ? `:${trade.setup}` : ""}`;
  const events: TradeRow["events"] = [...(trade.events ?? []), { type: "STOP_MOVED", from: p.stop_price, to: p.stop_price, at: now, note: `strategy: ${from} → ${setup}` }];
  await updateTrade(trade.id, {
    ...simColumns(p),
    ...patch,
    setup,
    bucket_id: `book:${setup}`,
    strategy_version: BOOK_STRATEGY_VERSION,
    target_price: p.target_price,
    // Only bars from now on count for the new strategy's exits.
    last_bar_time: new Date(now).toISOString(),
    events,
  });
  await logEvent({ kind: "TRADE_EDIT", symbol: trade.symbol, message: `${trade.symbol}: הועבר מאסטרטגיה ${from} ל-${setup}` });
  return { ...trade, setup, strategy_version: BOOK_STRATEGY_VERSION, sim_state: p };
}
