import { reviewExtension } from "./agent-judge";
import { mirrorToBroker, resolveBrokerEntry } from "./broker-mirror";
import { realizedR, stepPosition, type SimPosition } from "./position";
import { round } from "./round";
import { logEvent, simColumns, updateTrade, type TradeRow, type UniverseRow } from "./store";
import { DAILY_TREND_STRATEGY_VERSION, INTRADAY_STRATEGY_VERSION } from "./strategy-versions";
import { extensionDecision, analystBrief, type StrategyV2Params } from "./strategy/candidates";
import { closedIdx } from "./strategy/series";
import { LIVE_DAILY_TREND_PARAMS, donchianExitBreached } from "./strategy/daily-trend";
import { CHART_BARS_MAX, D1, H1, MAX_AGENT_CALLS_PER_TICK, iso, toSym, type FrameCache, type TickSummary } from "./tick-context";
import { mustExitBeforeEarnings, type CalendarEvent } from "./veto";
import type { Bar } from "./types";

/**
 * Stage 1 — step every open position over the hourly bars it has not seen yet,
 * mirror the result to the broker, and persist it.
 *
 * Split out of engine.ts. `persistTrade` lives here because it is how a stepped
 * position is written; the intraday tick reuses both.
 */

function mergeChartBars(existing: Bar[], add: Bar[]): Bar[] {
  const map = new Map(existing.map((b) => [b.t, b]));
  for (const b of add) map.set(b.t, b);
  return [...map.values()].sort((a, b) => a.t - b.t).slice(-CHART_BARS_MAX);
}

type SimWithReview = SimPosition & { extension_declined_target?: number };

export async function advancePositions(input: {
  trades: TradeRow[];
  frames: FrameCache;
  universe: Map<string, UniverseRow>;
  params: StrategyV2Params;
  calendar: CalendarEvent[];
  earningsNext: Set<string> | null;
  agentEnabled: boolean;
  now: number;
  summary: TickSummary;
  lastPrices: Map<string, number>;
}) {
  const bySymbol = new Map<string, TradeRow[]>();
  for (const t of input.trades) bySymbol.set(t.symbol, [...(bySymbol.get(t.symbol) ?? []), t]);

  for (const [symbol, trades] of bySymbol) {
    const u = input.universe.get(symbol);
    if (!u) continue;
    const sym = toSym(u);
    try {
      const f = await input.frames(sym);
      if (!f) continue;
      const h1 = f.h1.bars;
      input.lastPrices.set(symbol, h1[h1.length - 1].c);
      const earningsExit = sym.asset_class === "STOCK" && mustExitBeforeEarnings(symbol, new Date(input.now), input.calendar, input.earningsNext);

      for (const trade of trades) {
        const p: SimWithReview = { ...trade.sim_state };
        const events: TradeRow["events"] = [...(trade.events ?? [])];
        const brokerPatch: Record<string, unknown> = {};
        // trigger_timestamp is the 4h close; the first manageable hourly bar is the one that opens at it.
        let from = trade.last_bar_time ? Date.parse(trade.last_bar_time) : Date.parse(trade.trigger_timestamp) - 1;

        // Real (paper) broker: fills come from the broker, never from the simulator.
        if (trade.broker && p.state === "PENDING") {
          const outcome = await resolveBrokerEntry(trade, p, events, input.now);
          Object.assign(brokerPatch, outcome.patch);
          if (outcome.done) {
            await persistTrade(trade, p, events, brokerPatch, from, h1, input);
            continue;
          }
          if (p.state === "PENDING") {
            if (Object.keys(brokerPatch).length) await updateTrade(trade.id, brokerPatch);
            continue;
          }
          // Manage from the first full hour after the fill.
          from = Math.floor((p.opened_at ?? input.now) / H1) * H1 + H1 - 1;
        }

        const freshIdx: number[] = [];
        for (let i = 0; i < h1.length; i++) if (h1[i].t > from) freshIdx.push(i);
        if (!freshIdx.length && !trade.broker) continue;

        const isDailyTrend = trade.strategy_version === DAILY_TREND_STRATEGY_VERSION;

        for (const i of freshIdx) {
          const bar = h1[i];
          const closeT = bar.t + H1;
          let raise: { raise_target_to?: number; raise_stop_to?: number } = {};
          // TP extension is a v2/4h concept only — daily-trend exits via chandelier trail + Donchian break.
          if (!isDailyTrend && input.params.extension_enabled && p.entry_price !== null && i > 0 && p.state !== "PENDING") {
            const ext = extensionDecision({ f, t: bar.t, entry: p.entry_price, stop: p.stop_price, target: p.target_price, stopDistance: p.stop_distance, lastClose: h1[i - 1].c });
            if (ext && p.extension_declined_target !== p.target_price) {
              let approved = true;
              let why = ext.reason;
              const isLatest = i === freshIdx[freshIdx.length - 1];
              if (trade.track === "AGENT" && input.agentEnabled && isLatest && input.summary.agent_calls < MAX_AGENT_CALLS_PER_TICK) {
                input.summary.agent_calls += 1;
                const review = await reviewExtension({
                  symbol,
                  brief: analystBrief(f, bar.t),
                  bars: h1.slice(Math.max(0, i - 48), i),
                  entry: p.entry_price,
                  stop: p.stop_price,
                  target: p.target_price,
                  proposed_target: ext.raise_target_to,
                  proposed_stop: ext.raise_stop_to,
                  current_r: (h1[i - 1].c - p.entry_price) / p.stop_distance,
                });
                approved = review.approve;
                why = `${ext.reason} · agent: ${review.reasoning}`;
              }
              if (approved) {
                raise = ext;
                input.summary.extensions += 1;
                events.push({ type: "STOP_MOVED", from: p.stop_price, to: p.stop_price, at: bar.t, note: `TP extension: ${why}` });
              } else {
                p.extension_declined_target = p.target_price;
                events.push({ type: "STOP_MOVED", from: p.stop_price, to: p.stop_price, at: bar.t, note: `TP extension declined: ${why}` });
              }
            }
          }
          const id = closedIdx(f.d1, closeT);
          const dailyJustClosed = id >= 0 && f.d1.bars[id].t + D1 === closeT;
          // Daily-trend uses the most recently CLOSED day's ATR throughout the day (matches the backtest's
          // day-granular trail, no look-ahead) and only checks its 20-day-low exit once that day closes.
          const dIdx = closedIdx(f.d1, bar.t + H1);
          const i4 = closedIdx(f.h4, bar.t);
          const donchianExit = isDailyTrend && dailyJustClosed && donchianExitBreached(f.d1, id, LIVE_DAILY_TREND_PARAMS.exit_days);
          const ev = stepPosition(p, bar, {
            atr: isDailyTrend ? (dIdx >= 0 ? f.d1.atr[dIdx] : NaN) : i4 >= 0 ? f.h4.atr[i4] : NaN,
            regime_flip: !isDailyTrend && dailyJustClosed && f.d1.bars[id].c < f.d1.ema200[id],
            force_exit_reason: donchianExit ? "TRAIL" : i === h1.length - 1 && earningsExit ? "EARNINGS" : undefined,
            ...raise,
          });
          events.push(...ev);
          if (p.state === "CLOSED" || p.state === "CANCELLED") break;
        }

        if (trade.broker && (p.state === "OPEN" || p.state === "RISK_FREE" || p.state === "CLOSED")) {
          Object.assign(brokerPatch, await mirrorToBroker(trade, p, events, input.lastPrices.get(symbol) ?? null, input.now));
        }
        await persistTrade(trade, p, events, brokerPatch, from, h1, input);
      }
    } catch (err) {
      input.summary.errors.push(`advance ${symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

export async function persistTrade(
  trade: TradeRow,
  p: SimPosition,
  events: TradeRow["events"],
  brokerPatch: Record<string, unknown>,
  from: number,
  h1: Bar[],
  input: { summary: TickSummary; now: number }
) {
  const lastBar = [...h1].reverse().find((b) => b.t > from);
  const lastSeen = lastBar ? lastBar.t : trade.last_bar_time ? Date.parse(trade.last_bar_time) : null;
  const closedNow = p.state === "CLOSED";
  const chart = mergeChartBars(trade.chart_bars ?? [], h1.filter((b) => b.t > from && b.t <= (p.closed_at ?? lastSeen ?? input.now)));
  await updateTrade(trade.id, {
    ...simColumns(p),
    ...brokerPatch,
    events,
    ...(lastSeen !== null ? { last_bar_time: iso(lastSeen) } : {}),
    chart_bars: chart,
    ...(closedNow ? { realized_r: round(realizedR(p), 3), realized_pnl: round(p.cash_flow, 2) } : {}),
  });
  input.summary.positions_updated += 1;
  if ((closedNow || p.state === "CANCELLED") && trade.track === "AGENT" && trade.state !== p.state) {
    input.summary.closed += 1;
    const r = realizedR(p);
    await logEvent({
      kind: p.state === "CANCELLED" ? "ORDER_CANCELLED" : "TRADE_CLOSED",
      symbol: trade.symbol,
      message: p.state === "CANCELLED" ? `${trade.symbol}: פקודת כניסה בוטלה (${p.cancel_reason})` : `${trade.symbol}: נסגרה ${p.exit_reason} · ${r >= 0 ? "+" : ""}${r.toFixed(2)}R`,
      data: { trade_id: trade.id },
      // Intraday closes are too frequent to push — they stay in the journal/event log.
      push: closedNow && trade.execution !== "SHADOW" && trade.strategy_version !== INTRADAY_STRATEGY_VERSION,
    });
  }
  trade.sim_state = p;
  trade.state = p.state;
  if (closedNow) {
    trade.realized_r = round(realizedR(p), 3);
    trade.chart_bars = chart;
    trade.events = events;
  }
}
