import { alpaca, isAlpacaConfigured } from "../broker/alpaca";
import { marketCalendar, stockSnapshots, type StockSnapshot } from "../broker/alpaca-data";
import { checkEntryGuardPre, logEntryGuardSkip, sizeNotionalWithGuards } from "../entry-guards";
import { checkAccountEntry } from "../risk-envelope";
import { getOpenTrades, getSettings, logEvent, simColumns, updateSettings, updateTrade, type TradeRow } from "../store";
import { isBookManaged } from "../strategy-versions";
import { accountRiskState, loadAccount } from "../tick-context";
import type { SimPosition } from "../position";
import { buildMultiAsset, EQUITY_ETFS, IBS_CLOSE_PARAMS, ibsClose, type MultiAsset, type Sleeve } from "../strategy/multi";
import type { Bar } from "../types";
import { D1, dayIso, loadStockSeries } from "./bars";
import { brokerContext, enter, nyOffsetMs, type BookState } from "./engine";

/**
 * The short bracket sleeve (IBS_CLOSE): ~10 minutes before the US close, buy today's equity ETFs closing at the
 * bottom of their range with market-on-close orders; on the fill the broker holds an OCO (take-profit 1.5×ATR,
 * stop 1×ATR). Positions still held after 3 sessions leave with a market-on-close sell. Runs from the 5-minute intraday tick; once per session (settings.book_state.close_day).
 */

export const CLOSE_SLEEVE: Sleeve = { def: ibsClose(), risk_pct: 0, max_positions: IBS_CLOSE_PARAMS.max_positions };

/** Alpaca takes market-on-close orders until 15:50 ET: act from 21 to 11 minutes before the close. */
export function inCloseWindow(now: number, closeUtcMs: number): boolean {
  return now >= closeUtcMs - 21 * 60_000 && now <= closeUtcMs - 11 * 60_000;
}

/** Today's session close (UTC ms), or null on a non-trading day. */
async function todayClose(now: number): Promise<{ date: string; closeUtc: number } | null> {
  const day = dayIso(now);
  const sessions = await marketCalendar(day, day);
  const s = sessions.find((x) => x.date === day);
  if (!s) return null;
  const closeNy = Date.parse(`${s.date}T${s.close}:00Z`);
  return { date: s.date, closeUtc: closeNy - nyOffsetMs(closeNy) };
}

/** Has a position bought at the close of `openedDay` been held for `maxHold` sessions by today's close? */
export function holdExpired(openedDay: string, today: string, sessions: string[], maxHold: number): boolean {
  return sessions.filter((d) => d > openedDay && d <= today).length >= maxHold;
}

/** Stored daily history + today's session so far as a provisional bar at today's date. */
export function withProvisionalBar(bars: Bar[], snap: StockSnapshot, dayMs: number): Bar[] {
  const past = bars.filter((b) => b.t < dayMs);
  return [...past, { t: dayMs, o: snap.o, h: snap.h, l: snap.l, c: snap.c, v: snap.v }];
}

async function queueCloseExit(trade: TradeRow, now: number): Promise<void> {
  if (trade.broker_stop_order_id) await alpaca.cancelOrder(trade.broker_stop_order_id).catch(() => null);
  for (const o of await alpaca.openOrders(trade.symbol, "STOCK").catch(() => [])) if (o.side === "sell") await alpaca.cancelOrder(o.id).catch(() => null);
  const held = await alpaca.position(trade.symbol, "STOCK");
  const qty = Math.floor(Number(held?.qty ?? 0));
  const p: SimPosition = { ...trade.sim_state, exit_pending: "TIME_STOP" };
  const events: TradeRow["events"] = [...(trade.events ?? [])];
  if (qty > 0) await alpaca.placeCloseOrder({ symbol: trade.symbol, side: "sell", qty, clientId: `${trade.id.slice(0, 18)}-moc-${now}` });
  events.push({ type: "STOP_MOVED", from: p.stop_price, to: p.stop_price, at: now, note: "exit queued for the close (market-on-close)" });
  await updateTrade(trade.id, { ...simColumns(p), broker_status: "exit_queued", events });
}

export type CloseSleeveSummary = { day: string; exits: number; signals: number; entries: number; blocked: Record<string, number>; errors: string[] };

export async function runCloseSleeve(now: number): Promise<CloseSleeveSummary | null> {
  const settings = await getSettings();
  if (settings.phase !== "PAPER" || settings.execution_venue !== "ALPACA_PAPER" || !isAlpacaConfigured()) return null;
  const state = settings.book_state as BookState;
  const session = await todayClose(now);
  if (!session || state.close_day === session.date || !inCloseWindow(now, session.closeUtc)) return null;
  const summary: CloseSleeveSummary = { day: session.date, exits: 0, signals: 0, entries: 0, blocked: {}, errors: [] };
  const block = (k: string) => (summary.blocked[k] = (summary.blocked[k] ?? 0) + 1);
  // Mark first: a slow run must not be repeated by the next tick (entries are also de-duplicated per bar).
  await updateSettings({ book_state: { ...state, close_day: session.date } });

  const open = (await getOpenTrades()).filter((t) => isBookManaged(t.strategy_version) && t.setup === "IBS_CLOSE");
  // The broker's OCO takes the profit or the stop; what is still held after `max_hold` closes leaves at this close.
  const openedDays = open.map((t) => dayIso(t.sim_state?.strategy_since ?? Date.parse(t.opened_at ?? t.created_at)));
  const since = openedDays.length ? openedDays.reduce((a, b) => (a < b ? a : b)) : session.date;
  const sessions = since < session.date ? (await marketCalendar(since, session.date)).map((x) => x.date) : [session.date];
  const exiting = new Set<string>();
  for (const [k, t] of open.entries()) {
    if ((t.state !== "OPEN" && t.state !== "RISK_FREE") || t.sim_state?.exit_pending) continue;
    if (!holdExpired(openedDays[k], session.date, sessions, IBS_CLOSE_PARAMS.max_hold)) continue;
    exiting.add(t.id);
    try {
      await queueCloseExit(t, now);
      summary.exits += 1;
    } catch (err) {
      summary.errors.push(`exit ${t.symbol}: ${err instanceof Error ? err.message.slice(0, 120) : "?"}`);
    }
  }

  if (settings.kill_switch_active || settings.entries_paused) return finish(summary);
  const symbols = [...EQUITY_ETFS];
  const dayMs = Date.parse(`${session.date}T00:00:00Z`);
  const [snaps, series, broker] = await Promise.all([stockSnapshots(symbols), loadStockSeries(symbols, now - 60 * D1), brokerContext()]);
  if (broker.equity === null) {
    summary.errors.push("broker_equity_unavailable");
    return finish(summary);
  }
  const assets: MultiAsset[] = [];
  for (const s of symbols) {
    const snap = snaps.get(s);
    const bars = series.get(s);
    if (!snap || !bars || bars.length < 21 || now - snap.at > 15 * 60_000) continue;
    assets.push(buildMultiAsset(s, "STOCK", "ETF", withProvisionalBar(bars, snap, dayMs)));
  }
  const signals = CLOSE_SLEEVE.def.scan(assets, dayMs, { references: {} });
  summary.signals = signals.length;
  const account = { ...(await loadAccount(settings, await getOpenTrades(), new Map(), now)), equity: broker.equity };
  let slots = CLOSE_SLEEVE.max_positions - open.filter((t) => !t.sim_state?.exit_pending && !exiting.has(t.id)).length;
  for (const sig of signals) {
    if (slots <= 0) {
      block("MAX_IBS_CLOSE");
      continue;
    }
    if (broker.held.has(sig.a.symbol)) {
      block("ALREADY_IN_SYMBOL");
      continue;
    }
    const last = sig.a.d1.bars.length - 1;
    const pre = checkEntryGuardPre({
      symbol: sig.a.symbol,
      asset_class: "STOCK",
      entry: sig.entry,
      stop: sig.stop,
      equity: broker.equity,
      buying_power: broker.buying.stock,
      avg_dollar_volume: last >= 0 ? sig.a.dv50[last] : null,
    });
    if (pre) {
      block(pre.reason);
      void logEntryGuardSkip({ symbol: sig.a.symbol, reason: pre.reason, detail: pre.detail, now });
      continue;
    }
    const targetNotional = IBS_CLOSE_PARAMS.notional_pct * broker.equity;
    const sized = sizeNotionalWithGuards({
      entry: sig.entry,
      stop: sig.stop,
      target_notional: targetNotional,
      equity: broker.equity,
      buying_power: broker.buying.stock,
    });
    if (!sized || sized.block) {
      block(sized?.block?.reason ?? "SIZE");
      if (sized?.block) void logEntryGuardSkip({ symbol: sig.a.symbol, reason: sized.block.reason, detail: sized.block.detail, now });
      continue;
    }
    const { size, risk_usd: riskUsd, notional } = sized;
    if (broker.buying.stock !== null && notional > broker.buying.stock * 0.95) {
      block("INSUFFICIENT_BUYING_POWER");
      void logEntryGuardSkip({ symbol: sig.a.symbol, reason: "INSUFFICIENT_BUYING_POWER", detail: "notional exceeds buffered buying power", now });
      continue;
    }
    const blocks = checkAccountEntry(accountRiskState(settings, account), sig.a.symbol, riskUsd);
    if (blocks.length) {
      blocks.forEach(block);
      continue;
    }
    try {
      const id = await enter(sig, CLOSE_SLEEVE, size, riskUsd, settings, now, "MOC");
      if (!id) continue;
      summary.entries += 1;
      slots -= 1;
      broker.held.add(sig.a.symbol);
      if (broker.buying.stock !== null) broker.buying.stock -= notional;
      account.open.push({ symbol: sig.a.symbol, setup: "IBS_CLOSE", entry_limit: sig.entry, remaining_size: size } as TradeRow);
      await logEvent({ kind: "ORDER_PLACED", symbol: sig.a.symbol, message: `[Alpaca demo] ${sig.a.symbol} IBS_CLOSE: קנייה בנעילה · ${size} יח׳ · IBS ${((1 - sig.score) * IBS_CLOSE_PARAMS.ibs_max).toFixed(3)}` });
    } catch (err) {
      summary.errors.push(`enter ${sig.a.symbol}: ${err instanceof Error ? err.message.slice(0, 120) : "?"}`);
    }
  }
  return finish(summary);
}

async function finish(summary: CloseSleeveSummary): Promise<CloseSleeveSummary> {
  await logEvent({
    kind: "BOOK_PASS",
    message: `ספר אסטרטגיות · נעילה ${summary.day}: ${summary.exits} יציאות · ${summary.signals} סיגנלים · ${summary.entries} כניסות`,
    data: summary,
  }).catch(() => null);
  return summary;
}
