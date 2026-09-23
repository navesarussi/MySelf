import { alpaca } from "./broker/alpaca";
import { mirrorToBroker, persistTrade, resolveBrokerEntry, type TickSummary } from "./engine";
import { type LoadedFrames } from "./intraday-data";
import { stepPosition, type SimPosition } from "./position";
import { closedIdx } from "./strategy/series";
import { INTRADAY_PARAMS, M5 } from "./strategy/intraday";
import { timeStopReason } from "./trend-ride";
import { updateTrade, type TradeRow } from "./store";
import { type IntradaySummary, type StockSession } from "./intraday-context";

/** Stage 1 — step every open intraday/manual position over the 5m bars it has not seen. */

export async function advanceIntraday(trades: TradeRow[], frames: Map<string, LoadedFrames>, lastPrices: Map<string, number>, session: StockSession, now: number, summary: IntradaySummary) {
  const p = INTRADAY_PARAMS;
  for (const trade of trades) {
    const lf = frames.get(trade.symbol);
    if (!lf || lf.sym.asset_class !== trade.asset_class) continue;
    const f = lf.f;
    try {
      const pos: SimPosition = { ...trade.sim_state };
      const events: TradeRow["events"] = [...(trade.events ?? [])];
      const brokerPatch: Record<string, unknown> = {};
      const bars5 = f.s5.bars;
      // trigger_timestamp = decision time; the first manageable 5m bar opens at/after it.
      let from = trade.last_bar_time ? Date.parse(trade.last_bar_time) : Date.parse(trade.trigger_timestamp) - 1;
      const pseudo = { summary: summary as unknown as TickSummary, now };

      if (trade.broker && pos.state === "PENDING") {
        const outcome = await resolveBrokerEntry(trade, pos, events, now);
        Object.assign(brokerPatch, outcome.patch);
        if (outcome.done) {
          await persistTrade(trade, pos, events, brokerPatch, from, bars5, pseudo);
          continue;
        }
        if (pos.state === "PENDING") {
          if (Object.keys(brokerPatch).length) await updateTrade(trade.id, brokerPatch);
          continue;
        }
        from = Math.floor((pos.opened_at ?? now) / M5) * M5 + M5 - 1;
      }

      const isStock = trade.asset_class === "STOCK";
      const fresh = bars5.filter((b) => b.t > from);
      if (!fresh.length && !trade.broker && !(isStock && session.mustFlatten && pos.state !== "PENDING")) continue;
      for (let k = 0; k < fresh.length; k++) {
        const bar = fresh[k];
        const i15 = closedIdx(f.s15, bar.t);
        const isLast = k === fresh.length - 1;
        const timeUp = !isStock && pos.state !== "PENDING" && pos.bars_held + 1 >= p.time_stop_bars_5m;
        // Stocks are day trades: flat before the close (checked on the latest bar only — no look-ahead in history).
        const sessionEnd = isStock && isLast && session.mustFlatten && pos.state !== "PENDING";
        events.push(...stepPosition(pos, bar, { atr: i15 >= 0 ? f.s15.atr[i15] : NaN, let_winners_run: !isStock, force_exit_reason: sessionEnd ? "TIME_STOP" : timeStopReason(pos, timeUp) }));
        if (pos.state === "CLOSED" || pos.state === "CANCELLED") break;
      }
      if (isStock && pos.state === "PENDING" && session.mustFlatten) {
        pos.state = "CANCELLED";
        pos.cancel_reason = "SESSION_END";
        pos.closed_at = now;
        events.push({ type: "CANCELLED", reason: "SESSION_END", at: now });
        if (trade.broker_entry_order_id) await alpaca.cancelOrder(trade.broker_entry_order_id);
      }
      if (trade.broker && (pos.state === "OPEN" || pos.state === "RISK_FREE" || pos.state === "CLOSED")) {
        Object.assign(brokerPatch, await mirrorToBroker(trade, pos, events, lastPrices.get(trade.symbol) ?? null, now));
      }
      await persistTrade(trade, pos, events, brokerPatch, from, bars5, pseudo);
    } catch (err) {
      summary.errors.push(`advance ${trade.symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
