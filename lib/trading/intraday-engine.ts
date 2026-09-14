import { getSupabase } from "@/lib/supabase";
import { compactIntradayBars, rateIntradayTrade, RATER_PROMPT_VERSION, type RatingSnapshot } from "./agent-rater";
import { alpaca, isAlpacaConfigured } from "./broker/alpaca";
import { INTRADAY_STRATEGY_VERSION, loadAccount, mirrorToBroker, persistTrade, resolveBrokerEntry, toSym, type Account, type TickSummary } from "./engine";
import { fetchBars } from "./market-data";
import { newPendingPosition, openRiskR, stepPosition, type SimPosition } from "./position";
import { checkNewEntry } from "./risk-envelope";
import { buildTradePlan } from "./sizing";
import { closedIdx } from "./strategy/series";
import { INTRADAY_PARAMS, M15, M5, buildIntradayFrames, scanIntraday, type IntradayCandidate, type IntradayFrames } from "./strategy/intraday";
import { ensureSeeded, getOpenTrades, getSettings, getUniverse, logEvent, simColumns, updateTrade, type TradeRow, type TradingSettings, type UniverseRow } from "./store";

/**
 * מערכת המסחר — intraday tick, 1 minute after every 5m close (Supabase pg_cron "1-59/5 * * * *" → /api/trading/intraday-tick).
 * Crypto only: setups on closed 15m bars, entry timing + position management on closed 5m bars.
 * הסוכן מסחר is in RATING-ONLY mode here: entries are fully deterministic; the agent scores each entered trade.
 * Idempotent: triggers are unique per (symbol, INTRADAY, setup bar, strategy) and positions only step unseen bars.
 */

const TICK_BUDGET_MS = 75_000;
const LOCK_MS = 150_000;
/** A confirmation older than this (missed ticks) is stale — the entry price is no longer available. */
const MAX_CONFIRM_AGE_MS = 10 * 60_000;
const BARS_15M = 400;
const BARS_5M = 300;
const MAX_RATINGS_PER_TICK = 4;
const CHART_BARS_BEFORE = 96;

const iso = (ms: number) => new Date(ms).toISOString();

export type IntradaySummary = Pick<TickSummary, "positions_updated" | "closed" | "triggers" | "entries" | "blocked" | "errors" | "skipped_reason" | "duration_ms"> & { ratings: number; symbols: number };

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

async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift()!);
  }));
}

// ── 1. Manage open intraday positions on 5m bars ────────────────────────────

async function advanceIntraday(trades: TradeRow[], frames: Map<string, IntradayFrames>, lastPrices: Map<string, number>, now: number, summary: IntradaySummary) {
  const p = INTRADAY_PARAMS;
  for (const trade of trades) {
    const f = frames.get(trade.symbol);
    if (!f) continue;
    try {
      const pos: SimPosition = { ...trade.sim_state };
      const events: TradeRow["events"] = [...(trade.events ?? [])];
      const brokerPatch: Record<string, unknown> = {};
      const bars5 = f.s5.bars;
      // trigger_timestamp = close time of the confirming 5m bar; the first manageable bar opens at it.
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

      const fresh = bars5.filter((b) => b.t > from);
      if (!fresh.length && !trade.broker) continue;
      for (const bar of fresh) {
        const i15 = closedIdx(f.s15, bar.t);
        const timeUp = pos.state !== "PENDING" && pos.bars_held + 1 >= p.time_stop_bars_5m;
        events.push(...stepPosition(pos, bar, { atr: i15 >= 0 ? f.s15.atr[i15] : NaN, force_exit_reason: timeUp ? "TIME_STOP" : undefined }));
        if (pos.state === "CLOSED" || pos.state === "CANCELLED") break;
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

async function insertIntradayTrade(input: { trigger_id: string; c: IntradayCandidate; u: UniverseRow; execution: "SHADOW" | "PAPER"; plan: { entry: number; stop: number; size: number; risk_amount: number }; snapshot: Record<string, unknown>; chart: TradeRow["chart_bars"] }) {
  const p = INTRADAY_PARAMS;
  const pos = newPendingPosition({ asset_class: input.u.asset_class, entry: input.plan.entry, stop: input.plan.stop, size: input.plan.size });
  pos.exit_plan = "STRUCTURAL";
  pos.target_price = input.c.target;
  pos.initial_target_price = input.c.target;
  pos.breakeven_at_r = p.breakeven_at_r;
  pos.partial_fraction = 0;
  pos.trail_after_r = p.trail_after_r;
  pos.trail_mult = p.trail_mult_atr15;
  const { data, error } = await getSupabase()
    .from("trading_trades")
    .insert({
      trigger_id: input.trigger_id,
      symbol: input.u.symbol,
      asset_class: input.u.asset_class,
      bucket_id: `intraday:${input.c.setup}`,
      mode: "INTRADAY",
      // Single account trade: the entry is deterministic; the agent only rates it (no separate agent decision track).
      track: "AGENT",
      execution: input.execution,
      trigger_timestamp: iso(input.c.confirm_time),
      trigger_snapshot: input.snapshot,
      agent_decision: "ENTER",
      agent_risk_multiplier: 1,
      agent_model_version: "rating-only",
      prompt_version: RATER_PROMPT_VERSION,
      param_version: p.version,
      strategy_version: INTRADAY_STRATEGY_VERSION,
      setup: input.c.setup,
      score: input.c.score,
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

async function scanAndEnter(input: {
  settings: TradingSettings;
  universe: UniverseRow[];
  frames: Map<string, IntradayFrames>;
  account: Account;
  buyingPower: number | null;
  now: number;
  started: number;
  summary: IntradaySummary;
}) {
  const { settings, now, summary, account } = input;
  const p = INTRADAY_PARAMS;
  const useBroker = settings.phase === "PAPER" && settings.execution_venue === "ALPACA_PAPER" && isAlpacaConfigured();
  const cryptoTradable = useBroker ? await alpaca.tradableSymbols().catch(() => new Set<string>()) : new Set<string>();
  let buyingPower = input.buyingPower;
  const btc = input.frames.get("BTC");

  const found: { c: IntradayCandidate; u: UniverseRow; f: IntradayFrames }[] = [];
  for (const u of input.universe) {
    const f = input.frames.get(u.symbol);
    if (!f) continue;
    for (const c of scanIntraday(f, now, p)) if (now - c.confirm_time <= MAX_CONFIRM_AGE_MS) found.push({ c, u, f });
  }
  // Freshest confirmations first (their entry price is closest to the market).
  found.sort((a, b) => b.c.confirm_time - a.c.confirm_time || b.c.score - a.c.score);

  for (const { c, u, f } of found) {
    if (Date.now() - input.started > TICK_BUDGET_MS) {
      summary.errors.push("time_budget_exhausted_intraday");
      return;
    }
    try {
      const openRisk = account.open.map((t) => ({ symbol: t.symbol, notional: t.entry_limit * t.remaining_size, open_risk_r: openRiskR(t.sim_state) }));
      // Testing phase: no correlation cap and no macro/funding vetoes for intraday crypto (user-approved).
      const blocks = checkNewEntry(
        {
          equity: account.equity,
          peak_equity: Math.max(settings.peak_equity, account.equity),
          realized_r_today: account.realizedToday,
          realized_r_week: account.realizedWeek,
          kill_switch_active: settings.kill_switch_active,
          entries_paused: settings.entries_paused,
          positions: openRisk,
        },
        u.symbol,
        []
      );
      const entryLimit = c.entry * (1 + p.entry_cushion);
      const plan = buildTradePlan({
        entry: entryLimit,
        stopDistance: entryLimit - c.stop,
        equity: account.equity,
        assetClass: u.asset_class,
        riskScale: settings.risk_scale,
        maxNotional: buyingPower !== null ? Math.max(0, buyingPower * 0.95) : undefined,
      });
      const decision = blocks.length || !plan ? "BLOCKED" : "ENTER";
      const i15 = c.i;
      const i5 = closedIdx(f.s5, c.confirm_time);
      const ratingSnapshot: RatingSnapshot = {
        symbol: u.symbol,
        candidate: { setup: c.setup, score: c.score, entry: c.entry, stop: c.stop, target: c.target, rr: c.rr, stop_distance: c.stop_distance, range: c.range, features: c.features, setup_bar_time: c.setup_bar_time, confirm_time: c.confirm_time },
        bars_15m: compactIntradayBars(f.s15.bars.slice(0, i15 + 1), 64),
        bars_5m: compactIntradayBars(f.s5.bars.slice(0, i5 + 1), 36),
        btc_15m: btc && u.symbol !== "BTC" ? compactIntradayBars(btc.s15.bars.slice(0, closedIdx(btc.s15, c.confirm_time) + 1), 32) : null,
      };
      const snapshot = { candidate: c, rating_input: ratingSnapshot };

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
      if (!plan || blocks.length) {
        summary.blocked += 1;
        continue;
      }

      const execution = settings.phase === "PAPER" ? "PAPER" : "SHADOW";
      const brokerOk = useBroker && execution === "PAPER" && cryptoTradable.has(`${u.symbol}/USD`);
      const chart = f.s5.bars.slice(Math.max(0, i5 - CHART_BARS_BEFORE + 1), i5 + 1);
      const tradeId = await insertIntradayTrade({ trigger_id: triggerId, c, u, execution, plan, snapshot: snapshot as unknown as Record<string, unknown>, chart });
      summary.entries += 1;
      if (brokerOk) {
        try {
          const order = await alpaca.placeEntry({ symbol: u.symbol, assetClass: u.asset_class, qty: plan.size, limit: plan.entry, stop: plan.stop, target: c.target, clientId: `${tradeId.slice(0, 18)}-in` });
          await updateTrade(tradeId, { broker: "ALPACA_PAPER", broker_entry_order_id: order.id, broker_status: order.status });
          if (buyingPower !== null) buyingPower -= plan.notional;
        } catch (err) {
          const reason = err instanceof Error ? err.message.slice(0, 160) : "broker_error";
          await updateTrade(tradeId, { state: "CANCELLED", exit_reason: "BROKER_REJECTED", broker: "ALPACA_PAPER", broker_status: reason, closed_at: iso(now) });
          await logEvent({ kind: "BROKER_REJECTED", symbol: u.symbol, severity: "warn", message: `${u.symbol}: הברוקר דחה פקודה תוך-יומית — ${reason}` });
          continue;
        }
      }
      account.open.push({ symbol: u.symbol, entry_limit: plan.entry, remaining_size: plan.size, state: "PENDING", sim_state: { state: "PENDING", entry_price: null, stop_price: plan.stop } } as TradeRow);
      await logEvent({
        kind: "ORDER_PLACED",
        symbol: u.symbol,
        message: `${brokerOk ? "[Alpaca demo] " : "[סימולציה] "}${u.symbol} ${c.setup} (15m/5m): Limit ${plan.entry.toPrecision(6)} · סטופ ${plan.stop.toPrecision(6)} · יעד ${c.target.toPrecision(6)} · ${c.rr.toFixed(1)}R`.slice(0, 300),
      });
    } catch (err) {
      summary.errors.push(`scan-intraday ${u.symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
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

export async function runIntradayTick(now = Date.now()): Promise<IntradaySummary> {
  const started = Date.now();
  const summary: IntradaySummary = { positions_updated: 0, closed: 0, triggers: 0, entries: 0, blocked: 0, ratings: 0, symbols: 0, errors: [] };
  const settings = await getSettings();
  if (!settings.intraday_enabled) return { ...summary, skipped_reason: "intraday_disabled" };
  if (!(await acquireLock(now))) return { ...summary, skipped_reason: "locked" };
  try {
    await ensureSeeded();
    const cryptoRows = (await getUniverse()).filter((u) => u.asset_class !== "STOCK");
    const universe = cryptoRows.filter((u) => u.manual_enabled && u.eligibility !== "DISABLED_POOR");
    const allOpen = await getOpenTrades();
    const intradayOpen = allOpen.filter((t) => t.strategy_version === INTRADAY_STRATEGY_VERSION);
    const needed = new Set([...universe.map((u) => u.symbol), ...intradayOpen.map((t) => t.symbol), "BTC"]);
    const symbols = cryptoRows.filter((u) => needed.has(u.symbol));

    const frames = new Map<string, IntradayFrames>();
    const lastPrices = new Map<string, number>();
    await pool(symbols, 8, async (u) => {
      try {
        const sym = toSym(u);
        const [b15, b5] = await Promise.all([fetchBars(sym, "15m", now - BARS_15M * M15, now), fetchBars(sym, "5m", now - BARS_5M * M5, now)]);
        if (b15.length < 260 || b5.length < 60) return;
        frames.set(u.symbol, buildIntradayFrames(b15, b5));
        lastPrices.set(u.symbol, b5[b5.length - 1].c);
      } catch (err) {
        summary.errors.push(`bars ${u.symbol}: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
    summary.symbols = frames.size;

    await advanceIntraday(intradayOpen, frames, lastPrices, now, summary);

    const stillOpen = await getOpenTrades();
    const account = await loadAccount(settings, stillOpen, lastPrices, now);
    let buyingPower: number | null = null;
    if (settings.phase === "PAPER" && settings.execution_venue === "ALPACA_PAPER" && isAlpacaConfigured()) {
      try {
        const acct = await alpaca.account();
        account.equity = Number(acct.equity);
        buyingPower = Number(acct.non_marginable_buying_power ?? acct.cash);
        if (!Number.isFinite(buyingPower)) buyingPower = null;
      } catch (err) {
        summary.errors.push(`alpaca_account: ${err instanceof Error ? err.message.slice(0, 120) : "?"}`);
      }
    }

    if (settings.phase !== "PAPER" && settings.phase !== "SHADOW") summary.skipped_reason = `phase_${settings.phase.toLowerCase()}`;
    else if (settings.kill_switch_active) summary.skipped_reason = "kill_switch_active";
    else await scanAndEnter({ settings, universe, frames, account, buyingPower, now, started, summary });

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
