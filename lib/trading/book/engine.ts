import { getSupabase } from "@/lib/supabase";
import { RISK_ENVELOPE } from "../config";
import { alpaca, fromAlpacaPositionSymbol, isAlpacaConfigured, isDustPosition } from "../broker/alpaca";
import { marketCalendar } from "../broker/alpaca-data";
import { flattenAtBroker } from "../broker/flatten";
import { brokerEquity } from "../account-equity";
import { mirrorToBroker, resolveBrokerEntry } from "../broker-mirror";
import { realizedR, stepPosition, type SimPosition } from "../position";
import { checkAccountEntry } from "../risk-envelope";
import { round } from "../round";
import { getOpenTrades, getSettings, logEvent, simColumns, updateSettings, updateTrade, type TradeRow, type TradingSettings } from "../store";
import { BOOK_STRATEGY_VERSION, isBookManaged } from "../strategy-versions";
import { accountRiskState, loadAccount, type Account } from "../tick-context";
import type { AssetClass, ExitReason } from "../types";
import {
  assetRotation,
  buildMultiAsset,
  cryptoTrend,
  EQUITY_ETFS,
  exitDecision,
  momentum,
  positionForSignal,
  pullback,
  reversal,
  ROTATION_ETFS,
  type MultiAsset,
  type Signal,
  type Sleeve,
  type StrategyGroup,
  type StrategyId,
} from "../strategy/multi";
import { BOOK_HISTORY_DAYS, D1, dayIso, loadCryptoSeries, loadStockSeries, syncStockBars } from "./bars";
import { getBookUniverse, type BookUniverseRow } from "./universe";

/**
 * מערכת המסחר — the deterministic multi-strategy book, live on the Alpaca demo account.
 *
 * Once per closed daily bar and group (crypto after 00:00 UTC, US stocks ~20 minutes after the close):
 * manage every open book position on the new bar (chandelier trail, strategy exits, time stops), then
 * scan the whole universe for new signals and send them to the broker. Between passes the 15-minute tick
 * only mirrors the broker (fills, stops, exits, settlement — advanceBookBroker).
 *
 * Sleeves and risk come from the 10-year research on the full universe (docs/trading/multi-strategy.md), one
 * edge per horizon: crypto trend (weeks), stock momentum and cross-asset rotation (months, rebalanced monthly),
 * and short-term reversal in momentum leaders (days). 2016-26 together: CAGR 24%, Sharpe 1.22, max DD 21%,
 * ~480 trades a year — every period positive. The old stock pullback earned nothing over the equal-weight
 * universe and is retired (open ones are still managed to their exits).
 */
export const BOOK_SLEEVES: Sleeve[] = [
  { def: cryptoTrend(), risk_pct: 0.005, max_positions: 6 },
  { def: momentum(), risk_pct: 0.003, max_positions: 20 },
  { def: assetRotation(), risk_pct: 0.008, max_positions: 5 },
  // Mean reversion needs many small slots: signals cluster in selloffs and 10 big slots fill on the first day.
  { def: reversal(), risk_pct: 0.0025, max_positions: 40 },
];

/** Families no longer entered whose open positions are still managed to their exits. */
const RETIRED_DEFS = [pullback()];

/** The research book's own caps (the account envelope in % of equity sits above these). */
export const BOOK_LIMITS = Object.freeze({
  max_positions: 75,
  max_notional: 0.2,
  /** Stock gross notional (book positions + queued entries) as a share of equity — research: 1.0 → max DD 21% vs 30% at 1.5. */
  max_gross: 1.0,
  max_risk_per_trade: 0.01,
});

/** Symbols every stock pass loads whatever the day's liquidity ranking (the ETF families trade fixed lists). */
const ALWAYS_STOCKS = [...ROTATION_ETFS, ...EQUITY_ETFS];

const defById = (id: string) => [...BOOK_SLEEVES.map((s) => s.def), ...RETIRED_DEFS].find((d) => d.id === (id as StrategyId));

export type BookGroupKey = "CRYPTO" | "STOCKS";
export type BookState = { crypto_bar?: string; stocks_bar?: string; backfill_remaining?: number };
export type BookPassSummary = { group: BookGroupKey; bar: string; managed: number; exits: number; signals: number; entries: number; blocked: Record<string, number>; errors: string[] };

const REFERENCE: Record<BookGroupKey, { symbol: string; asset_class: AssetClass; provider_symbol: string }> = {
  STOCKS: { symbol: "SPY", asset_class: "STOCK", provider_symbol: "SPY" },
  CRYPTO: { symbol: "BTC", asset_class: "CRYPTO_MAJOR", provider_symbol: "BTCUSDT" },
};

const groupOf = (t: Pick<TradeRow, "asset_class">): BookGroupKey => (t.asset_class === "STOCK" ? "STOCKS" : "CRYPTO");

/** Stock notional of open and queued book trades at their entry price — what BOOK_LIMITS.max_gross caps. */
export function bookStockGross(trades: Pick<TradeRow, "asset_class" | "entry_limit" | "entry_price" | "remaining_size" | "position_size">[]): number {
  let g = 0;
  for (const t of trades) {
    if (t.asset_class !== "STOCK") continue;
    const px = Number(t.entry_price ?? t.entry_limit) || 0;
    const qty = Number(t.remaining_size) || Number(t.position_size) || 0;
    g += px * qty;
  }
  return g;
}

/** Last US session (NY date) whose close is at least 20 minutes behind `now`, or null. */
export async function lastClosedSession(now: number): Promise<string | null> {
  const from = dayIso(now - 8 * D1);
  const to = dayIso(now);
  const sessions = await marketCalendar(from, to);
  for (let k = sessions.length - 1; k >= 0; k--) {
    const s = sessions[k];
    // Calendar times are New York local; resolve the offset from the same instant's NY wall clock.
    const closeNy = Date.parse(`${s.date}T${s.close}:00Z`);
    const offset = nyOffsetMs(closeNy);
    if (closeNy - offset + 20 * 60_000 <= now) return s.date;
  }
  return null;
}

const NY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
/** New York wall clock minus UTC at (about) instant `t` — negative (−4h / −5h). */
function nyOffsetMs(t: number): number {
  const parts = Object.fromEntries(NY.formatToParts(new Date(t)).map((p) => [p.type, p.value]));
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute));
  return wall - Math.floor(t / 60_000) * 60_000;
}

/** Which daily bar each group is due to process now (null = nothing new). */
export async function duePasses(state: BookState, now: number): Promise<{ group: BookGroupKey; bar: string }[]> {
  const out: { group: BookGroupKey; bar: string }[] = [];
  const cryptoBar = dayIso(Math.floor(now / D1) * D1 - D1);
  if (now - Math.floor(now / D1) * D1 >= 3 * 60_000 && (state.crypto_bar ?? "") < cryptoBar) out.push({ group: "CRYPTO", bar: cryptoBar });
  const session = await lastClosedSession(now).catch(() => null);
  if (session && (state.stocks_bar ?? "") < session) out.push({ group: "STOCKS", bar: session });
  return out;
}

async function loadGroupAssets(group: BookGroupKey, rows: BookUniverseRow[], extra: string[], now: number): Promise<Map<string, MultiAsset>> {
  const out = new Map<string, MultiAsset>();
  if (group === "CRYPTO") {
    const syms = [...rows.map((r) => ({ symbol: r.symbol, asset_class: r.asset_class, provider_symbol: r.provider_symbol }))];
    for (const s of extra) if (!syms.some((x) => x.symbol === s)) syms.push({ symbol: s, asset_class: "CRYPTO_ALT", provider_symbol: `${s}USDT` });
    if (!syms.some((x) => x.symbol === "BTC")) syms.push(REFERENCE.CRYPTO);
    const series = await loadCryptoSeries(syms, now);
    for (const s of syms) {
      const bars = series.get(s.symbol);
      if (bars && bars.length >= 120) out.set(s.symbol, buildMultiAsset(s.symbol, s.asset_class, "CRYPTO", bars));
    }
    return out;
  }
  const grp = new Map(rows.map((r) => [r.symbol, r.grp as StrategyGroup]));
  const symbols = [...new Set([...rows.map((r) => r.symbol), ...extra, "SPY"])];
  const series = await loadStockSeries(symbols, now - BOOK_HISTORY_DAYS * D1);
  for (const s of symbols) {
    const bars = series.get(s);
    if (bars && bars.length >= 120) out.set(s, buildMultiAsset(s, "STOCK", grp.get(s) ?? (ALWAYS_STOCKS.includes(s) ? "ETF" : "STOCKS"), bars));
  }
  return out;
}

/**
 * Send a strategy exit to the broker. Crypto trades around the clock: flatten now. Stocks after the close:
 * cancel the protective stop (it holds the shares) and queue a market sell for the next open; the tick closes
 * the row once the broker is flat.
 */
async function requestExit(trade: TradeRow, p: SimPosition, reason: ExitReason, events: TradeRow["events"], now: number): Promise<Record<string, unknown>> {
  if (trade.asset_class !== "STOCK") {
    const px = await flattenAtBroker(trade);
    if (p.state !== "CLOSED") {
      p.exit_pending = reason;
      return { broker_status: "exit_sent" };
    }
    if (px !== null && p.exit_price !== null && p.exit_size) {
      p.cash_flow += (px - p.exit_price) * p.exit_size;
      p.exit_price = px;
    }
    return { broker_status: `closed_${reason.toLowerCase()}` };
  }
  if (trade.broker_stop_order_id) await alpaca.cancelOrder(trade.broker_stop_order_id);
  for (const o of await alpaca.openOrders(trade.symbol, trade.asset_class).catch(() => [])) if (o.side === "sell") await alpaca.cancelOrder(o.id);
  const held = await alpaca.position(trade.symbol, trade.asset_class);
  const qty = Math.floor(Number(held?.qty ?? 0));
  if (qty > 0) await alpaca.placeMarketSell({ symbol: trade.symbol, assetClass: "STOCK", qty, clientId: `${trade.id.slice(0, 18)}-ex-${now}` });
  events.push({ type: "STOP_MOVED", from: p.stop_price, to: p.stop_price, at: now, note: `exit queued for the open: ${reason}` });
  return { broker_status: "exit_queued" };
}

/** Manage one open book position on its unseen closed daily bars. */
async function manageOnBar(trade: TradeRow, a: MultiAsset, barIso: string, now: number, summary: BookPassSummary) {
  if (trade.state !== "OPEN" && trade.state !== "RISK_FREE") return;
  const def = defById(trade.setup ?? "");
  if (!def) return;
  const p: SimPosition = { ...trade.sim_state };
  if (p.exit_pending) return;
  const events: TradeRow["events"] = [...(trade.events ?? [])];
  const lastSeen = trade.last_bar_time ? dayIso(Date.parse(trade.last_bar_time)) : dayIso(Date.parse(trade.opened_at ?? trade.created_at));
  const bars = a.d1.bars;
  let exitReason: ExitReason | null = null;
  for (let i = 0; i < bars.length; i++) {
    const d = dayIso(bars[i].t);
    if (d <= lastSeen || d > barIso) continue;
    const decision = exitDecision(def, a, i, p);
    stepPosition(p, bars[i], { atr: a.d1.atr[i - 1] ?? NaN, force_exit_reason: decision ?? undefined });
    if (p.state === "CLOSED") {
      exitReason = p.exit_reason ?? decision ?? "MANUAL";
      break;
    }
  }
  summary.managed += 1;
  let patch: Record<string, unknown> = { last_bar_time: `${barIso}T00:00:00.000Z` };
  if (exitReason) {
    // The sim's close is a decision, not a fill: the broker executes it and settlement books the fills.
    if (trade.asset_class === "STOCK") {
      const reopened: SimPosition = { ...trade.sim_state, bars_held: p.bars_held, mfe_r: p.mfe_r, mae_r: p.mae_r, exit_pending: exitReason };
      patch = { ...patch, ...(await requestExit(trade, reopened, exitReason, events, now)) };
      await updateTrade(trade.id, { ...simColumns(reopened), ...patch, events });
    } else {
      patch = { ...patch, ...(await requestExit(trade, p, exitReason, events, now)) };
      await updateTrade(trade.id, { ...simColumns(p), ...patch, events, ...(p.state === "CLOSED" ? { realized_r: round(realizedR(p), 3), realized_pnl: round(p.cash_flow, 2) } : {}) });
    }
    summary.exits += 1;
    await logEvent({ kind: "BOOK_EXIT", symbol: trade.symbol, message: `${trade.symbol} (${def.id}): יציאה — ${exitReason}${trade.asset_class === "STOCK" ? " · תבוצע בפתיחת המסחר" : ""}` });
    return;
  }
  // Trail moved or nothing changed: bring the broker's stop in line (it only ever moves up).
  Object.assign(patch, await mirrorToBroker({ ...trade, ...patch } as TradeRow, p, events, bars.at(-1)?.c ?? null, now));
  await updateTrade(trade.id, { ...simColumns(p), ...patch, events });
}

type Buying = { stock: number | null; crypto: number | null };

async function brokerContext(): Promise<{ equity: number | null; buying: Buying; held: Set<string> }> {
  const [acct, positions, orders] = await Promise.all([alpaca.account(), alpaca.positions(), alpaca.allOpenOrders()]);
  const eq = brokerEquity(acct.equity);
  const held = new Set<string>();
  for (const p of positions) if (!isDustPosition(p)) held.add(fromAlpacaPositionSymbol(p.symbol));
  for (const o of orders) held.add(fromAlpacaPositionSymbol(o.symbol));
  const num = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : null);
  return { equity: eq.ok ? eq.equity : null, buying: { stock: num(acct.buying_power), crypto: num(acct.non_marginable_buying_power ?? acct.cash) }, held };
}

/** Size a signal: sleeve risk of equity over the stop distance, capped by notional, buying power and the account envelope. */
export function sizeSignal(sig: Pick<Signal, "entry" | "stop" | "a">, riskPct: number, equity: number, buyingPower: number | null): { size: number; riskUsd: number; notional: number } | null {
  const stopDist = sig.entry - sig.stop;
  if (!(stopDist > 0) || !(equity > 0)) return null;
  const cap = sig.a.asset_class === "STOCK" ? BOOK_LIMITS.max_risk_per_trade : RISK_ENVELOPE.MAX_RISK_PER_TRADE[sig.a.asset_class];
  let size = (Math.min(riskPct, cap) * equity) / stopDist;
  size = Math.min(size, (BOOK_LIMITS.max_notional * equity) / sig.entry);
  if (buyingPower !== null) size = Math.min(size, Math.max(0, buyingPower * 0.95) / sig.entry);
  size = sig.a.asset_class === "STOCK" ? Math.floor(size) : Math.floor(size * 1e6) / 1e6;
  const notional = size * sig.entry;
  if (!(size > 0) || notional < 100) return null;
  return { size, riskUsd: size * stopDist, notional };
}

async function enter(sig: Signal, sleeve: Sleeve, size: number, riskUsd: number, settings: TradingSettings, now: number): Promise<string | null> {
  const pos = positionForSignal(sig, size, sleeve.def.manage);
  const sb = getSupabase();
  const { data: trig } = await sb
    .from("trading_triggers")
    .upsert(
      {
        symbol: sig.a.symbol,
        asset_class: sig.a.asset_class,
        mode: "SWING",
        bucket_id: `book:${sig.strategy}`,
        bar_time: new Date(sig.t).toISOString(),
        setup: sig.strategy,
        score: Math.max(-32768, Math.min(32767, Math.round(sig.score * 100))),
        snapshot: { entry: sig.entry, stop: sig.stop, fill: sig.fill },
        vetoes: [],
        envelope_blocks: [],
        plan: { entry: sig.entry, stop: sig.stop, size, risk_amount: riskUsd },
        deterministic_decision: "ENTER",
        baseline_enter: true,
        param_version: "book-1",
        strategy_version: BOOK_STRATEGY_VERSION,
        phase: settings.phase,
      },
      { onConflict: "symbol,mode,bar_time,strategy_version", ignoreDuplicates: true }
    )
    .select("id")
    .maybeSingle();
  if (!trig) return null; // this bar was already handled
  const { data, error } = await sb
    .from("trading_trades")
    .insert({
      trigger_id: (trig as { id: string }).id,
      symbol: sig.a.symbol,
      asset_class: sig.a.asset_class,
      bucket_id: `book:${sig.strategy}`,
      mode: "SWING",
      track: "AGENT",
      execution: "PAPER",
      trigger_timestamp: new Date(now).toISOString(),
      trigger_snapshot: { entry: sig.entry, stop: sig.stop, score: sig.score },
      agent_decision: "ENTER",
      agent_risk_multiplier: 1,
      agent_model_version: "deterministic",
      prompt_version: "none",
      param_version: "book-1",
      strategy_version: BOOK_STRATEGY_VERSION,
      setup: sig.strategy,
      entry_limit: sig.entry,
      initial_stop_price: sig.stop,
      position_size: size,
      risk_amount: riskUsd,
      chart_bars: sig.a.d1.bars.slice(-120),
      baseline_enter: true,
      events: [],
      last_bar_time: new Date(sig.t).toISOString(),
      ...simColumns(pos),
    })
    .select("id")
    .single();
  if (error) throw new Error(`book insert: ${error.message}`);
  const tradeId = (data as { id: string }).id;
  try {
    const clientId = `${tradeId.slice(0, 18)}-in`;
    const order =
      sig.a.asset_class === "STOCK"
        ? await alpaca.placeOtoStockEntry({ symbol: sig.a.symbol, qty: size, type: sig.fill === "LIMIT_NEXT" ? "limit" : "market", limit: sig.entry, stop: sig.stop, clientId })
        : await alpaca.placeEntry({ symbol: sig.a.symbol, assetClass: sig.a.asset_class, qty: size, limit: sig.entry, stop: sig.stop, target: sig.entry * 10, clientId, orderType: "market", timeInForce: "gtc" });
    await updateTrade(tradeId, { broker: "ALPACA_PAPER", broker_entry_order_id: order.id, broker_status: order.status });
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 160) : "broker_error";
    await updateTrade(tradeId, { state: "CANCELLED", exit_reason: "BROKER_REJECTED", broker: "ALPACA_PAPER", broker_status: reason, closed_at: new Date(now).toISOString() });
    await logEvent({ kind: "BROKER_REJECTED", symbol: sig.a.symbol, severity: "warn", message: `${sig.a.symbol} (${sig.strategy}): הברוקר דחה — ${reason}` });
    return null;
  }
  return tradeId;
}

/** One daily pass for one group: manage the book's positions on the new bar, then scan and enter. */
export async function runBookPass(group: BookGroupKey, barIso: string, now: number, deadline: number): Promise<BookPassSummary> {
  const summary: BookPassSummary = { group, bar: barIso, managed: 0, exits: 0, signals: 0, entries: 0, blocked: {}, errors: [] };
  const block = (k: string) => (summary.blocked[k] = (summary.blocked[k] ?? 0) + 1);
  const settings = await getSettings();
  const universe = (await getBookUniverse({ enabledOnly: true })).filter((r) => (group === "CRYPTO" ? r.grp === "CRYPTO" : r.grp !== "CRYPTO"));
  const open = (await getOpenTrades()).filter((t) => isBookManaged(t.strategy_version));
  const mine = open.filter((t) => groupOf(t) === group);

  if (group === "STOCKS") {
    const sync = await syncStockBars({ symbols: [...new Set([...universe.map((r) => r.symbol), ...mine.map((t) => t.symbol), ...ALWAYS_STOCKS])], now, deadline });
    if (sync.remaining > 0) summary.errors.push(`bars_backfill_remaining:${sync.remaining}`);
  }
  const assets = await loadGroupAssets(group, universe, [...mine.map((t) => t.symbol), ...(group === "STOCKS" ? ALWAYS_STOCKS : [])], now);
  const t = Date.parse(`${barIso}T00:00:00Z`);
  // Cross-sectional state (momentum ranks) for this bar, before rank-based exits are decided.
  const pool = [...assets.values()];
  for (const s of BOOK_SLEEVES) s.def.prepare?.(pool.filter((a) => s.def.groups.includes(a.group as StrategyGroup)), t);

  for (const trade of mine) {
    const a = assets.get(trade.symbol);
    if (!a) continue;
    try {
      await manageOnBar(trade, a, barIso, now, summary);
    } catch (err) {
      summary.errors.push(`manage ${trade.symbol}: ${err instanceof Error ? err.message.slice(0, 120) : "?"}`);
    }
  }

  if (settings.phase !== "PAPER" || settings.execution_venue !== "ALPACA_PAPER" || !isAlpacaConfigured()) return summary;
  const broker = await brokerContext();
  if (broker.equity === null) {
    summary.errors.push("broker_equity_unavailable");
    return summary;
  }
  const account: Account = { ...(await loadAccount(settings, await getOpenTrades(), new Map(), now)), equity: broker.equity };
  const refs = { STOCKS: assets.get("SPY"), CRYPTO: assets.get("BTC") };
  const signals: { sig: Signal; sleeve: Sleeve }[] = [];
  for (const sleeve of BOOK_SLEEVES) {
    if (!sleeve.def.groups.some((g) => (group === "CRYPTO" ? g === "CRYPTO" : g !== "CRYPTO"))) continue;
    const assetsFor = pool.filter((a) => sleeve.def.groups.includes(a.group as StrategyGroup));
    for (const sig of sleeve.def.scan(assetsFor, t, { references: refs })) signals.push({ sig, sleeve });
  }
  signals.sort((x, y) => y.sig.score - x.sig.score);
  summary.signals = signals.length;
  const bookOpen = () => open.length + summary.entries;
  let stockGross = bookStockGross(open);
  for (const { sig, sleeve } of signals) {
    if (Date.now() > deadline) {
      block("TIME_BUDGET");
      break;
    }
    if (broker.held.has(sig.a.symbol)) {
      block("ALREADY_IN_SYMBOL");
      continue;
    }
    // Each entry is pushed to both lists; count symbols once or the sleeve fills at half its cap.
    const sleeveOpen = new Set([...open, ...account.open].filter((x) => x.setup === sleeve.def.id).map((x) => x.symbol)).size;
    if (sleeveOpen >= sleeve.max_positions) {
      block(`MAX_${sleeve.def.id}`);
      continue;
    }
    if (bookOpen() >= BOOK_LIMITS.max_positions) {
      block("MAX_BOOK");
      continue;
    }
    const bp = sig.a.asset_class === "STOCK" ? broker.buying.stock : broker.buying.crypto;
    const sized = sizeSignal(sig, sleeve.risk_pct * settings.risk_scale, broker.equity, bp);
    if (!sized) {
      block("SIZE");
      continue;
    }
    if (sig.a.asset_class === "STOCK" && stockGross + sized.notional > BOOK_LIMITS.max_gross * broker.equity) {
      block("MAX_GROSS");
      continue;
    }
    const blocks = checkAccountEntry(accountRiskState(settings, account), sig.a.symbol, sized.riskUsd);
    if (blocks.length) {
      blocks.forEach(block);
      continue;
    }
    try {
      const id = await enter(sig, sleeve, sized.size, sized.riskUsd, settings, now);
      if (!id) continue;
      summary.entries += 1;
      broker.held.add(sig.a.symbol);
      if (sig.a.asset_class === "STOCK") {
        stockGross += sized.notional;
        if (broker.buying.stock !== null) broker.buying.stock -= sized.notional;
      } else if (broker.buying.crypto !== null) broker.buying.crypto -= sized.notional;
      const pos = positionForSignal(sig, sized.size, sleeve.def.manage);
      open.push({ id, symbol: sig.a.symbol, setup: sig.strategy, asset_class: sig.a.asset_class } as TradeRow);
      account.open.push({ symbol: sig.a.symbol, setup: sig.strategy, entry_limit: sig.entry, remaining_size: sized.size, sim_state: pos } as TradeRow);
      await logEvent({ kind: "ORDER_PLACED", symbol: sig.a.symbol, message: `[Alpaca demo] ${sig.a.symbol} ${sig.strategy}: ${sig.fill === "LIMIT_NEXT" ? "Limit" : "Market"} ${sig.entry.toPrecision(6)} · סטופ ${sig.stop.toPrecision(6)} · ${sized.size} יח׳${sig.a.asset_class === "STOCK" ? " · בפתיחת המסחר" : ""}`.slice(0, 300) });
    } catch (err) {
      summary.errors.push(`enter ${sig.a.symbol}: ${err instanceof Error ? err.message.slice(0, 120) : "?"}`);
    }
  }
  return summary;
}

/** Every 15-minute tick: bring book trades in line with the broker (fills, stops, exits). No strategy decisions. */
export async function advanceBookBroker(now: number, errors: string[]) {
  const trades = (await getOpenTrades()).filter((t) => isBookManaged(t.strategy_version) && t.broker);
  for (const trade of trades) {
    try {
      const p: SimPosition = { ...trade.sim_state };
      const events: TradeRow["events"] = [...(trade.events ?? [])];
      let patch: Record<string, unknown> = {};
      if (p.state === "PENDING") patch = (await resolveBrokerEntry(trade, p, events, now)).patch;
      if (p.state === "OPEN" || p.state === "RISK_FREE") Object.assign(patch, await mirrorToBroker({ ...trade, ...patch } as TradeRow, p, events, null, now));
      await updateTrade(trade.id, { ...simColumns(p), ...patch, events, ...(p.state === "CLOSED" ? { realized_r: round(realizedR(p), 3), realized_pnl: round(p.cash_flow, 2) } : {}) });
    } catch (err) {
      errors.push(`book ${trade.symbol}: ${err instanceof Error ? err.message.slice(0, 120) : "?"}`);
    }
  }
}

/** Run whichever daily passes are due; each group's bar is processed once (settings.book_state). */
export async function runBookTick(now: number, deadline: number, errors: string[]): Promise<BookPassSummary[]> {
  const settings = await getSettings();
  // book_state must come back from getSettings — when it did not, every tick re-ran both passes (2.10.x).
  const state = settings.book_state as BookState;
  const due = await duePasses(state, now);
  const out: BookPassSummary[] = [];
  for (const d of due) {
    if (Date.now() > deadline) break;
    try {
      const s = await runBookPass(d.group, d.bar, now, deadline);
      out.push(s);
      const backfillLeft = s.errors.find((e) => e.startsWith("bars_backfill_remaining"));
      // Keep re-running the stock pass until the first full load of bars is complete.
      if (!backfillLeft) {
        const next = { ...state, [d.group === "CRYPTO" ? "crypto_bar" : "stocks_bar"]: d.bar };
        Object.assign(state, next);
        await updateSettings({ book_state: next });
      }
      errors.push(...s.errors.filter((e) => !e.startsWith("bars_backfill_remaining")).map((e) => `book: ${e}`));
      await logEvent({ kind: "BOOK_PASS", message: `ספר אסטרטגיות · ${d.group === "CRYPTO" ? "קריפטו" : "מניות"} ${d.bar}: ${s.signals} סיגנלים · ${s.entries} כניסות · ${s.exits} יציאות${backfillLeft ? " · טוען היסטוריה" : ""}`, data: s });
    } catch (err) {
      errors.push(`book_pass ${d.group}: ${err instanceof Error ? err.message.slice(0, 160) : "?"}`);
    }
  }
  return out;
}
