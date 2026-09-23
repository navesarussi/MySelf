import { getSupabase } from "@/lib/supabase";
import { compactIntradayBars, rateIntradayTrade, RATER_PROMPT_VERSION, type RatingSnapshot } from "./agent-rater";
import { alpaca, isAlpacaConfigured } from "./broker/alpaca";
import { marketClock } from "./broker/alpaca-data";
import { INTRADAY_STRATEGY_VERSION, isIntradayManaged, loadAccount, mirrorToBroker, persistTrade, resolveBrokerEntry, type Account, type TickSummary } from "./engine";
import { resurrectDesyncedTrades } from "./broker/resurrect";
import { loadIntradayFrames, type IntradaySymbol, type LoadedFrames } from "./intraday-data";
import { getIntradayUniverse, providerSymbolFor, refreshIntradayUniverse, type IntradayUniverseRow } from "./intraday-universe";
import { applyExternalFill, newPendingPosition, openRiskR, stepPosition, type SimPosition } from "./position";
import { EXECUTION_RULES } from "./config";
import { brokerEquity } from "./account-equity";
import { checkNewEntry, type EnvelopeBlock } from "./risk-envelope";
import { buildTradePlan } from "./sizing";
import { closedIdx } from "./strategy/series";
import { INTRADAY_PARAMS, M5, intradayParamsFor, scanIntraday, type IntradayCandidate, type IntradayFeatures, type IntradayFrames } from "./strategy/intraday";
import { timeStopReason } from "./trend-ride";
import { getOpenTrades, getSettings, logEvent, simColumns, updateSettings, updateTrade, type TradeRow, type TradingSettings } from "./store";
import { usSessionMinutes } from "./veto";
import type { AssetClass, TradePlan } from "./types";
import { intradayToOpportunityTicket } from "./committee/adapters";
import { runCommitteeShadowBatch, type CommitteeHookItem } from "./committee/hook";

/**
 * מערכת המסחר — intraday tick, 1 minute after every 5m close (Supabase pg_cron "1-59/5 * * * *" → /api/trading/intraday-tick).
 * Universe: liquid crypto (24/7) + liquid US stocks/ETFs (regular session only), rebuilt daily.
 * Setups on closed 15m bars, entry timing + position management on closed 5m bars.
 * הסוכן מסחר is in RATING-ONLY mode for automatic entries; manual entries (search button) are planned by the agent.
 * Idempotent: triggers are unique per (symbol, INTRADAY, setup bar, strategy) and positions only step unseen bars.
 */

const TICK_BUDGET_MS = 80_000;
const LOCK_MS = 150_000;
/** A confirmation older than this (missed ticks) is stale — the entry price is no longer available. */
const MAX_CONFIRM_AGE_MS = 10 * 60_000;
const MAX_RATINGS_PER_TICK = 4;
const CHART_BARS_BEFORE = 96;
/** Stocks: no new entries in the first 15 / last 30 minutes; flat 10 minutes before the close. */
export const STOCK_SESSION = Object.freeze({ NO_ENTRY_FIRST_MIN: 15, NO_ENTRY_LAST_MIN: 30, FLATTEN_LAST_MIN: 10 });

const iso = (ms: number) => new Date(ms).toISOString();

export type IntradaySummary = Pick<TickSummary, "positions_updated" | "closed" | "triggers" | "entries" | "blocked" | "errors" | "skipped_reason" | "duration_ms"> & {
  ratings: number;
  symbols: number;
  stocks_open: boolean;
  universe_refreshed?: { crypto: number; stocks: number };
};

async function acquireLock(now: number): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("trading_settings")
    .update({ intraday_lock_until: iso(now + LOCK_MS) })
    .eq("id", true)
    .or(`intraday_lock_until.is.null,intraday_lock_until.lt.${iso(now)}`)
    .select("id");
  if (error) throw new Error(`intraday lock: ${error.message}`);
  return Boolean(data?.length);
}

// ── Shared building blocks (also used by the "search trade" button) ────────

export type StockSession = { open: boolean; canEnter: boolean; mustFlatten: boolean };

export async function stockSession(now: number): Promise<StockSession> {
  let open = false;
  if (isAlpacaConfigured()) {
    try {
      open = (await marketClock()).is_open; // authoritative on holidays / half days
    } catch {
      const s = usSessionMinutes(new Date(now));
      open = s.weekday && s.sinceOpen >= 0 && s.untilClose > 0;
    }
  }
  const s = usSessionMinutes(new Date(now));
  return {
    open,
    canEnter: open && s.sinceOpen >= STOCK_SESSION.NO_ENTRY_FIRST_MIN && s.untilClose > STOCK_SESSION.NO_ENTRY_LAST_MIN,
    mustFlatten: !open || s.untilClose <= STOCK_SESSION.FLATTEN_LAST_MIN,
  };
}

export type IntradayAccount = { account: Account; buyingPower: { crypto: number | null; stock: number | null }; useBroker: boolean };

export async function loadIntradayAccount(settings: TradingSettings, lastPrices: Map<string, number>, now: number, errors: string[]): Promise<IntradayAccount> {
  const account = await loadAccount(settings, await getOpenTrades(), lastPrices, now);
  const useBroker = settings.phase === "PAPER" && settings.execution_venue === "ALPACA_PAPER" && isAlpacaConfigured();
  const buyingPower = { crypto: null as number | null, stock: null as number | null };
  if (useBroker) {
    try {
      const acct = await alpaca.account();
      // See brokerEquity: an unusable figure must not reach peak_equity.
      const broker = brokerEquity(acct.equity);
      if (broker.ok) account.equity = broker.equity;
      else errors.push(broker.reason);
      const crypto = Number(acct.non_marginable_buying_power ?? acct.cash);
      const stock = Number(acct.buying_power);
      buyingPower.crypto = Number.isFinite(crypto) ? crypto : null;
      buyingPower.stock = Number.isFinite(stock) ? stock : null;
    } catch (err) {
      errors.push(`alpaca_account: ${err instanceof Error ? err.message.slice(0, 120) : "?"}`);
    }
  }
  return { account, buyingPower, useBroker };
}

/** Testing phase: no correlation cap and no macro/funding/earnings vetoes for intraday (user-approved). */
export function intradayEnvelopeBlocks(settings: TradingSettings, account: Account, symbol: string): EnvelopeBlock[] {
  return checkNewEntry(
    {
      equity: account.equity,
      peak_equity: Math.max(settings.peak_equity, account.equity),
      realized_r_today: account.realizedToday,
      realized_r_week: account.realizedWeek,
      kill_switch_active: settings.kill_switch_active,
      entries_paused: settings.entries_paused,
      positions: account.open.map((t) => ({ symbol: t.symbol, notional: t.entry_limit * t.remaining_size, open_risk_r: openRiskR(t.sim_state) })),
    },
    symbol,
    []
  );
}

export function sizeIntraday(input: { entry: number; stop: number; assetClass: AssetClass; ia: IntradayAccount; riskScale: number }): TradePlan | null {
  const bp = input.assetClass === "STOCK" ? input.ia.buyingPower.stock : input.ia.buyingPower.crypto;
  return buildTradePlan({
    entry: input.entry,
    stopDistance: input.entry - input.stop,
    equity: input.ia.account.equity,
    assetClass: input.assetClass,
    riskScale: input.riskScale,
    maxNotional: bp !== null ? Math.max(0, bp * 0.95) : undefined,
  });
}

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

/** Fill a sim-only pending entry at the live price (market now; limit when price already touched). */
export async function syncSimEntryNow(tradeId: string, live: number, orderType: "MARKET" | "LIMIT", now = Date.now()): Promise<TradeRow["state"] | null> {
  const trade = (await getOpenTrades()).find((t) => t.id === tradeId);
  if (!trade || trade.broker || trade.state !== "PENDING" || !(live > 0)) return trade?.state ?? null;
  const pos: SimPosition = { ...trade.sim_state };
  if (orderType === "LIMIT" && live > pos.entry_limit) return "PENDING";
  const slip = EXECUTION_RULES.ASSUMED_SLIPPAGE[trade.asset_class];
  const raw = orderType === "MARKET" ? live : Math.min(live, pos.entry_limit);
  const events: TradeRow["events"] = [...(trade.events ?? [])];
  if (raw <= pos.stop_price) {
    pos.state = "CANCELLED";
    pos.cancel_reason = "GAP_BELOW_STOP";
    pos.closed_at = now;
    events.push({ type: "CANCELLED", reason: pos.cancel_reason, at: now });
  } else {
    events.push(...applyExternalFill(pos, raw * (1 + slip), pos.size, now));
  }
  await updateTrade(trade.id, { ...simColumns(pos), events });
  return pos.state;
}

export function scannableSymbols(universe: IntradayUniverseRow[], session: StockSession): IntradayUniverseRow[] {
  return universe.filter((u) => u.asset_class !== "STOCK" || session.open);
}

// ── 1. Manage open intraday/manual positions on 5m bars ────────────────────

async function advanceIntraday(trades: TradeRow[], frames: Map<string, LoadedFrames>, lastPrices: Map<string, number>, session: StockSession, now: number, summary: IntradaySummary) {
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

// ── 2. Scan + enter (deterministic) ────────────────────────────────────────

async function scanAndEnter(input: {
  settings: TradingSettings;
  universe: IntradayUniverseRow[];
  frames: Map<string, LoadedFrames>;
  ia: IntradayAccount;
  session: StockSession;
  now: number;
  started: number;
  summary: IntradaySummary;
}) {
  const { settings, now, summary, ia } = input;
  const committeeBatch: CommitteeHookItem[] = [];
  const found: { c: IntradayCandidate; u: IntradayUniverseRow; lf: LoadedFrames }[] = [];
  for (const u of input.universe) {
    if (u.asset_class === "STOCK" && !input.session.canEnter) continue;
    // SPY is loaded as market context for stocks — it's tradable too when it passes nothing special.
    const lf = input.frames.get(u.symbol);
    if (!lf) continue;
    for (const c of scanIntraday(lf.f, now, intradayParamsFor(u.asset_class))) if (now - c.confirm_time <= MAX_CONFIRM_AGE_MS) found.push({ c, u, lf });
  }
  // Freshest confirmations first (their entry price is closest to the market).
  found.sort((a, b) => b.c.confirm_time - a.c.confirm_time || b.c.score - a.c.score);

  for (const { c, u, lf } of found) {
    if (Date.now() - input.started > TICK_BUDGET_MS) {
      summary.errors.push("time_budget_exhausted_intraday");
      return;
    }
    try {
      const p = intradayParamsFor(u.asset_class);
      const blocks = intradayEnvelopeBlocks(settings, ia.account, u.symbol);
      const entryLimit = c.entry * (1 + p.entry_cushion);
      const plan = sizeIntraday({ entry: entryLimit, stop: c.stop, assetClass: u.asset_class, ia, riskScale: settings.risk_scale });
      const decision = blocks.length || !plan ? "BLOCKED" : "ENTER";
      const ratingInput = ratingSnapshotFor({
        sym: u,
        lf,
        frames: input.frames,
        at: c.confirm_time,
        candidate: { setup: c.setup, score: c.score, entry: c.entry, stop: c.stop, target: c.target, rr: c.rr, stop_distance: c.stop_distance, range: c.range, features: c.features, setup_bar_time: c.setup_bar_time, confirm_time: c.confirm_time },
      });
      const snapshot = { candidate: c, rating_input: ratingInput };

      const { data: trig, error: trigErr } = await getSupabase()
        .from("trading_triggers")
        .upsert(
          {
            symbol: u.symbol,
            asset_class: u.asset_class,
            mode: "INTRADAY",
            bucket_id: `intraday:${c.setup}`,
            bar_time: iso(c.setup_bar_time),
            setup: c.setup,
            score: c.score,
            snapshot,
            vetoes: [],
            envelope_blocks: blocks,
            plan: plan ? { ...plan, target: c.target } : null,
            deterministic_decision: decision,
            baseline_enter: true,
            param_version: p.version,
            strategy_version: INTRADAY_STRATEGY_VERSION,
            phase: settings.phase,
          },
          { onConflict: "symbol,mode,bar_time,strategy_version", ignoreDuplicates: true }
        )
        .select("id")
        .maybeSingle();
      if (trigErr) throw new Error(trigErr.message);
      if (!trig) continue; // handled by an earlier tick
      summary.triggers += 1;
      const triggerId = String((trig as { id: string }).id);
      const ticketR = intradayToOpportunityTicket({
        candidate: c,
        s15: lf.f.s15,
        symbol: u.symbol,
        assetClass: u.asset_class,
      });
      if (ticketR.ok) {
        committeeBatch.push({
          ticket: ticketR.data,
          assetClass: u.asset_class,
          vetoes: [],
          envelopeBlocks: blocks,
          triggerId,
        });
      }
      if (!plan || blocks.length) {
        summary.blocked += 1;
        continue;
      }

      const execution = settings.phase === "PAPER" ? "PAPER" : "SHADOW";
      const i5 = closedIdx(lf.f.s5, c.confirm_time);
      const chart = lf.f.s5.bars.slice(Math.max(0, i5 - CHART_BARS_BEFORE + 1), i5 + 1);
      const tradeId = await insertIntradayTrade({ trigger_id: triggerId, sym: u, strategy_version: INTRADAY_STRATEGY_VERSION, setup: c.setup, score: c.score, execution, plan, target: c.target, trigger_time: c.confirm_time, snapshot, chart });
      summary.entries += 1;
      const brokerOk = ia.useBroker && execution === "PAPER" && u.broker_tradable;
      if (brokerOk) {
        const placed = await placeIntradayBrokerEntry({ tradeId, sym: u, plan, target: c.target, orderType: "limit", now });
        if (!placed.ok) continue;
        if (u.asset_class === "STOCK") {
          if (ia.buyingPower.stock !== null) ia.buyingPower.stock -= plan.notional;
        } else if (ia.buyingPower.crypto !== null) ia.buyingPower.crypto -= plan.notional;
      }
      ia.account.open.push({ symbol: u.symbol, entry_limit: plan.entry, remaining_size: plan.size, state: "PENDING", sim_state: { state: "PENDING", entry_price: null, stop_price: plan.stop } } as TradeRow);
      await logEvent({
        kind: "ORDER_PLACED",
        symbol: u.symbol,
        message: `${brokerOk ? "[Alpaca demo] " : "[סימולציה] "}${u.symbol} ${c.setup} (15m/5m): Limit ${plan.entry.toPrecision(6)} · סטופ ${plan.stop.toPrecision(6)} · יעד ${c.target.toPrecision(6)} · ${c.rr.toFixed(1)}R`.slice(0, 300),
      });
    } catch (err) {
      summary.errors.push(`scan-intraday ${u.symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  try {
    await runCommitteeShadowBatch(committeeBatch, {
      settings,
      account: ia.account,
      vix: null,
      btc_dominance_pct: null,
      summary,
    });
  } catch (err) {
    summary.errors.push(`committee_shadow: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── 3. Rating-only agent ───────────────────────────────────────────────────

async function rateEnteredTriggers(now: number, started: number, summary: IntradaySummary) {
  if (Date.now() - started > TICK_BUDGET_MS - 30_000) return;
  const sb = getSupabase();
  const { data, error } = await sb
    .from("trading_triggers")
    .select("id, symbol, snapshot")
    .eq("strategy_version", INTRADAY_STRATEGY_VERSION)
    .eq("deterministic_decision", "ENTER")
    .is("agent_rating", null)
    .is("agent_error", null)
    .gte("created_at", iso(now - 3 * 3_600_000))
    .order("created_at", { ascending: true })
    .limit(MAX_RATINGS_PER_TICK);
  if (error) {
    summary.errors.push(`ratings query: ${error.message}`);
    return;
  }
  await Promise.all(
    (data ?? []).map(async (row) => {
      const snap = (row.snapshot as { rating_input?: RatingSnapshot } | null)?.rating_input;
      if (!snap) {
        await sb.from("trading_triggers").update({ agent_error: "missing_rating_input" }).eq("id", row.id);
        return;
      }
      const r = await rateIntradayTrade(snap);
      const patch = { agent_rating: r.rating, agent_rating_explanation: r.explanation, agent_model_version: r.model_version, prompt_version: r.prompt_version };
      await sb.from("trading_triggers").update({ ...patch, agent_reasoning: r.explanation, agent_error: r.error }).eq("id", row.id);
      if (r.rating !== null) {
        await sb.from("trading_trades").update({ ...patch, agent_reasoning: r.explanation, updated_at: iso(Date.now()) }).eq("trigger_id", row.id);
        summary.ratings += 1;
      } else summary.errors.push(`rating ${row.symbol}: ${r.error}`);
    })
  );
}

// ── Tick ───────────────────────────────────────────────────────────────────

/** Symbols to load: the scannable set + open positions + market references (BTC always, SPY while stocks trade). */
export function symbolsToLoad(scannable: IntradaySymbol[], open: Pick<TradeRow, "symbol" | "asset_class">[], session: StockSession): IntradaySymbol[] {
  const map = new Map<string, IntradaySymbol>();
  for (const u of scannable) map.set(u.symbol, u);
  for (const t of open) if (!map.has(t.symbol)) map.set(t.symbol, { symbol: t.symbol, asset_class: t.asset_class, provider_symbol: providerSymbolFor(t.symbol, t.asset_class) });
  if (!map.has("BTC")) map.set("BTC", { symbol: "BTC", asset_class: "CRYPTO_MAJOR", provider_symbol: "BTCUSDT" });
  if (session.open && !map.has("SPY")) map.set("SPY", { symbol: "SPY", asset_class: "STOCK", provider_symbol: "SPY" });
  return [...map.values()];
}

export type { IntradayFeatures, IntradayFrames };

export async function runIntradayTick(now = Date.now()): Promise<IntradaySummary> {
  const started = Date.now();
  const summary: IntradaySummary = { positions_updated: 0, closed: 0, triggers: 0, entries: 0, blocked: 0, ratings: 0, symbols: 0, stocks_open: false, errors: [] };
  const settings = await getSettings();
  if (!settings.intraday_enabled) return { ...summary, skipped_reason: "intraday_disabled" };
  if (!(await acquireLock(now))) return { ...summary, skipped_reason: "locked" };
  try {
    const today = iso(now).slice(0, 10);
    // Daily universe rebuild from 12:00 UTC (before the US open), using yesterday's completed daily bars.
    if (settings.last_intraday_universe_date !== today && new Date(now).getUTCHours() >= 12) {
      try {
        summary.universe_refreshed = await refreshIntradayUniverse(now);
        await updateSettings({ last_intraday_universe_date: today });
      } catch (err) {
        summary.errors.push(`universe_refresh: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`);
      }
    }
    const universe = await getIntradayUniverse();
    const session = await stockSession(now);
    summary.stocks_open = session.open;
    if (settings.execution_venue === "ALPACA_PAPER") {
      try {
        await resurrectDesyncedTrades(now);
      } catch (err) {
        summary.errors.push(`resurrect: ${err instanceof Error ? err.message.slice(0, 120) : "?"}`);
      }
    }
    const managed = (await getOpenTrades()).filter((t) => isIntradayManaged(t.strategy_version));
    const frames = await loadIntradayFrames(symbolsToLoad(scannableSymbols(universe, session), managed, session), now, summary.errors);
    summary.symbols = frames.size;
    const lastPrices = new Map([...frames].map(([s, lf]) => [s, lf.lastPrice]));

    await advanceIntraday(managed, frames, lastPrices, session, now, summary);

    const ia = await loadIntradayAccount(settings, lastPrices, now, summary.errors);
    if (settings.phase !== "PAPER" && settings.phase !== "SHADOW") summary.skipped_reason = `phase_${settings.phase.toLowerCase()}`;
    else if (settings.kill_switch_active) summary.skipped_reason = "kill_switch_active";
    else await scanAndEnter({ settings, universe, frames, ia, session, now, started, summary });

    await rateEnteredTriggers(now, started, summary);
  } catch (err) {
    summary.errors.push(`intraday_tick: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    summary.duration_ms = Date.now() - started;
    if (summary.errors.length) {
      await logEvent({ kind: "INTRADAY_ERRORS", severity: summary.errors.length > 5 ? "critical" : "warn", message: summary.errors.slice(0, 5).join(" | ").slice(0, 900), data: summary.errors }).catch(() => null);
    }
    await getSupabase()
      .from("trading_settings")
      .update({ intraday_lock_until: null, last_intraday_tick_at: iso(now), last_intraday_summary: summary })
      .eq("id", true);
  }
  return summary;
}
