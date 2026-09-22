import { getSupabase } from "@/lib/supabase";
import { REGIME_REFERENCE, RISK_ENVELOPE, dailyTrendGroup, isCrypto } from "./config";
import { judgeDailyTrendTrigger, type AgentVerdict } from "./agent-judge";
import { openRiskR } from "./position";
import { alpaca, isAlpacaConfigured } from "./broker/alpaca";
import { returnCorrelation } from "./indicators";
import { checkNewEntry, drawdownFromPeak } from "./risk-envelope";
import { buildTradePlan } from "./sizing";
import { LIVE_DAILY_TREND_PARAMS, buildDailyAsset, scanDailyTrendCandidates, scoreDailyCandidate, type DailyAsset, type DailyCandidate } from "./strategy/daily-trend";
import { getCalendar, getClosedTrades, logEvent, updateTrade, type PlaybookRow, type TradeRow, type TradingSettings, type UniverseRow } from "./store";
import { DAILY_TREND_STRATEGY_VERSION } from "./strategy-versions";
import { dailyTrendExperienceCard, insertDailyTrendTrade } from "./trade-insert";
import { evaluateVetoes, isoDateInZone, nextTradingDays } from "./veto";
import { fetchBtcDominance, fetchEarningsSymbols, fetchFundingRate, fetchVix, type BarCache } from "./market-data";
import { CHART_BARS_BEFORE, D1, MAX_AGENT_CALLS_PER_TICK, TICK_TIME_BUDGET_MS, barsFor, iso, toSym, type Account, type TickSummary } from "./tick-context";
import { round } from "./round";
import type { UniverseSymbol } from "./types";

/**
 * Stage 4b — the daily-trend strategy: breakout scan on daily closes over the
 * wider universe, one trade per symbol per day.
 *
 * Split out of engine.ts; the tick calls `scanDailyTrend` and owns nothing else
 * about it.
 */


export async function scanDailyTrend(input: {
  settings: TradingSettings;
  universe: UniverseRow[];
  cache: BarCache;
  account: Account;
  playbook: PlaybookRow | null;
  now: number;
  started: number;
  summary: TickSummary;
}) {
  const { settings, cache, now, summary } = input;
  const p = LIVE_DAILY_TREND_PARAMS;
  const useBroker = settings.phase === "PAPER" && settings.execution_venue === "ALPACA_PAPER" && isAlpacaConfigured();
  const cryptoTradable = useBroker ? await alpaca.tradableSymbols().catch(() => new Set<string>()) : new Set<string>();
  const eligible = input.universe.filter((u) => u.manual_enabled && u.screen_passed && u.eligibility !== "DISABLED_POOR");
  if (!eligible.length) return;

  // The regime reference (SPY/BTC) must exist for the group filter regardless of ITS OWN screen — a broad
  // index/large-cap naturally has low ATR% and can legitimately fail the volatility screen while still being
  // the correct regime gauge (v2's scan() already does this; scanning it here matches that, not a re-screen).
  const buildReference = async (ref: UniverseSymbol): Promise<DailyAsset | undefined> => {
    try {
      const bars = await barsFor(cache, ref, "1d");
      return bars.length >= 260 ? buildDailyAsset(ref.symbol, ref.asset_class, dailyTrendGroup(ref.symbol, ref.asset_class), bars) : undefined;
    } catch (err) {
      summary.errors.push(`daily-reference ${ref.symbol}: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  };
  // ETF group intentionally has no regime reference — matches the validated research config exactly.
  const references: Record<string, DailyAsset | undefined> = { CRYPTO: await buildReference(REGIME_REFERENCE.CRYPTO_ALT), STOCKS: await buildReference(REGIME_REFERENCE.STOCK), ETF: undefined };

  const assets: DailyAsset[] = [];
  for (const u of eligible) {
    if (u.symbol === references.CRYPTO?.symbol || u.symbol === references.STOCKS?.symbol) {
      // Already built above — reuse rather than refetch (cache would hit anyway, this just skips the extra pass).
      assets.push((u.symbol === references.CRYPTO?.symbol ? references.CRYPTO : references.STOCKS)!);
      continue;
    }
    try {
      const bars = await barsFor(cache, toSym(u), "1d");
      if (bars.length < 260) continue;
      assets.push(buildDailyAsset(u.symbol, u.asset_class, dailyTrendGroup(u.symbol, u.asset_class), bars));
    } catch (err) {
      summary.errors.push(`daily-asset ${u.symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (!assets.length) return;

  // Symbols may publish their latest daily close at different UTC times (crypto vs. lagging equities data) —
  // scan once per distinct "latest bar" timestamp so each group is ranked against its own freshest cohort.
  const distinctT = [...new Set(assets.map((a) => a.d1.bars.at(-1)?.t).filter((t): t is number => t !== undefined))];
  let found: DailyCandidate[] = [];
  for (const t of distinctT) found.push(...scanDailyTrendCandidates(assets, t, references, p));
  // A symbol could theoretically surface under more than one pass — keep the first.
  const seen = new Set<string>();
  found = found.filter((c) => (seen.has(`${c.symbol}|${c.t}`) ? false : (seen.add(`${c.symbol}|${c.t}`), true)));
  if (!found.length) return;
  found.sort((a, b) => (b.rs ?? 0.5) - (a.rs ?? 0.5));

  const closed = await getClosedTrades();
  const earnings = found.some((c) => c.a.asset_class === "STOCK") ? await fetchEarningsSymbols(nextTradingDays(isoDateInZone(new Date(now), "America/New_York"), 4)) : new Set<string>();
  const [vix, dominance] = await Promise.all([fetchVix(), fetchBtcDominance()]);
  const calendar = await getCalendar(new Date(now - 2 * D1).toISOString().slice(0, 10));

  for (const c of found) {
    if (Date.now() - input.started > TICK_TIME_BUDGET_MS) {
      summary.errors.push("time_budget_exhausted_daily_trend");
      return;
    }
    const u = eligible.find((x) => x.symbol === c.symbol)!;
    const sym = toSym(u);
    try {
      summary.triggers += 1;
      const score = scoreDailyCandidate(c.features, c.rs);
      const funding = isCrypto(sym.asset_class) ? await fetchFundingRate(sym.provider_symbol) : undefined;
      const vetoes = evaluateVetoes({ symbol: sym.symbol, asset_class: sym.asset_class, mode: "SWING", now: new Date(now), calendar, earnings_symbols: earnings, funding_rate: funding });

      const correlated: string[] = [];
      const correlations: Record<string, number | null> = {};
      for (const t of input.account.open) {
        const other = assets.find((a) => a.symbol === t.symbol);
        if (!other) continue;
        const rho = returnCorrelation(c.a.d1.bars.map((b) => b.c), other.d1.bars.map((b) => b.c));
        correlations[t.symbol] = rho === null ? null : round(rho, 2);
        if (rho !== null && Math.abs(rho) >= RISK_ENVELOPE.CORRELATION_THRESHOLD) correlated.push(t.symbol);
      }
      const openRisk = input.account.open.map((t) => ({ symbol: t.symbol, notional: t.entry_limit * t.remaining_size, open_risk_r: openRiskR(t.sim_state) }));
      const blocks = checkNewEntry(
        {
          equity: input.account.equity,
          peak_equity: Math.max(settings.peak_equity, input.account.equity),
          realized_r_today: input.account.realizedToday,
          realized_r_week: input.account.realizedWeek,
          kill_switch_active: settings.kill_switch_active,
          entries_paused: settings.entries_paused,
          positions: openRisk,
        },
        sym.symbol,
        correlated
      );
      const basePlan = buildTradePlan({ entry: c.entry, stopDistance: c.stopDist, equity: input.account.equity, assetClass: sym.asset_class, riskScale: settings.risk_scale });
      const deterministic = vetoes.length ? "VETO" : blocks.length || !basePlan ? "BLOCKED" : "ENTER";
      const snapshot = { candidate: { symbol: c.symbol, group: c.group, entry: c.entry, stop: c.stop, target: c.target, rs: c.rs, room_r: c.room, features: c.features }, correlations, funding_rate: funding ?? null, vix, btc_dominance_pct: dominance };

      const { data: trig, error: trigErr } = await getSupabase()
        .from("trading_triggers")
        .upsert(
          {
            symbol: sym.symbol,
            asset_class: sym.asset_class,
            mode: "SWING",
            bucket_id: `daily_trend:${c.group}`,
            bar_time: iso(c.t),
            setup: "DAILY_BREAKOUT",
            score,
            snapshot,
            vetoes,
            envelope_blocks: blocks,
            plan: basePlan ? { ...basePlan, target: c.target } : null,
            deterministic_decision: deterministic,
            baseline_enter: true,
            param_version: p.version,
            strategy_version: DAILY_TREND_STRATEGY_VERSION,
            phase: settings.phase,
          },
          { onConflict: "symbol,mode,bar_time,strategy_version", ignoreDuplicates: true }
        )
        .select("id")
        .maybeSingle();
      if (trigErr) throw new Error(trigErr.message);
      if (!trig) continue; // already processed by an earlier tick
      const triggerId = String((trig as { id: string }).id);
      if (vetoes.length || !basePlan) {
        summary.vetoed += vetoes.length ? 1 : 0;
        continue;
      }

      let verdict: AgentVerdict | null = null;
      let flags: string[] = [];
      if (settings.agent_enabled && summary.agent_calls < MAX_AGENT_CALLS_PER_TICK) {
        summary.agent_calls += 1;
        const judged = await judgeDailyTrendTrigger(
          {
            symbol: sym.symbol,
            group: c.group,
            entry: c.entry,
            stop: c.stop,
            target: c.target,
            score,
            rs: c.rs,
            room_r: c.room,
            features: c.features as unknown as Record<string, number | null>,
            bars_d1: c.a.d1.bars.slice(Math.max(0, c.i - 89), c.i + 1),
            experience: dailyTrendExperienceCard(sym.symbol, closed),
            portfolio: {
              open_positions: input.account.open.map((t) => ({ symbol: t.symbol, state: t.state, open_risk_r: openRiskR(t.sim_state), correlation: correlations[t.symbol] ?? null })),
              open_risk_r: openRisk.reduce((s, pp) => s + pp.open_risk_r, 0),
              realized_r_today: input.account.realizedToday,
              realized_r_week: input.account.realizedWeek,
              drawdown_pct: drawdownFromPeak(input.account.equity, settings.peak_equity),
            },
            market: { vix, btc_dominance_pct: dominance, headlines: [] },
            playbook: input.playbook?.rules ?? [],
          },
          input.playbook?.version ?? null
        );
        verdict = judged.verdict;
        flags = judged.flags;
      }
      await getSupabase()
        .from("trading_triggers")
        .update({
          agent_decision: verdict?.decision ?? null,
          agent_conviction: verdict?.conviction ?? null,
          agent_risk_multiplier: verdict?.risk_multiplier ?? null,
          agent_reasoning: verdict?.primary_reasoning ?? null,
          agent_key_risks: verdict?.key_risks ?? null,
          agent_confidence: verdict?.confidence ?? null,
          agent_model_version: verdict?.model_version ?? null,
          prompt_version: verdict?.prompt_version ?? null,
          agent_error: verdict?.error ?? null,
          agent_market_read: verdict?.market_read ?? null,
          agent_thesis: verdict?.thesis ?? null,
          agent_invalidation: verdict?.invalidation ?? null,
          agent_target_index: verdict?.target_index ?? null,
          agent_lessons_applied: verdict?.lessons_applied ?? null,
          injection_flags: flags,
        })
        .eq("id", triggerId);
      if (flags.length) await logEvent({ kind: "INJECTION_FLAGGED", symbol: sym.symbol, severity: "warn", message: `${sym.symbol}: external text flagged (${flags.join(", ")})` });

      const chart = c.a.d1.bars.slice(Math.max(0, c.i - CHART_BARS_BEFORE + 1), c.i + 1);
      const base = { trigger_id: triggerId, c, snapshot: snapshot as unknown as Record<string, unknown>, verdict, chart, score };

      // Deterministic baseline — always simulated forward in shadow.
      await insertDailyTrendTrade({ ...base, track: "DETERMINISTIC", execution: "SHADOW", plan: basePlan });

      const multiplier = verdict ? verdict.risk_multiplier : 1;
      if (settings.phase === "BACKTEST" || multiplier === 0) continue;
      if (blocks.length) {
        summary.blocked += 1;
        continue;
      }
      const agentPlan = buildTradePlan({ entry: c.entry, stopDistance: c.stopDist, equity: input.account.equity, assetClass: sym.asset_class, riskScale: settings.risk_scale * multiplier });
      if (!agentPlan) continue;
      const execution = settings.phase === "PAPER" && u.eligibility === "ACTIVE" ? "PAPER" : "SHADOW";
      const brokerOk = useBroker && execution === "PAPER" && (sym.asset_class === "STOCK" ? await alpaca.isStockTradable(sym.symbol) : cryptoTradable.has(`${sym.symbol}/USD`));
      const tradeId = await insertDailyTrendTrade({ ...base, track: "AGENT", execution, plan: agentPlan });
      summary.entries += 1;
      if (brokerOk) {
        try {
          const order = await alpaca.placeEntry({ symbol: sym.symbol, assetClass: sym.asset_class, qty: agentPlan.size, limit: agentPlan.entry, stop: agentPlan.stop, target: c.target, clientId: `${tradeId.slice(0, 18)}-in`, bracket: false });
          await updateTrade(tradeId, { broker: "ALPACA_PAPER", broker_entry_order_id: order.id, broker_status: order.status });
        } catch (err) {
          const reason = err instanceof Error ? err.message.slice(0, 160) : "broker_error";
          await updateTrade(tradeId, { state: "CANCELLED", exit_reason: "BROKER_REJECTED", broker: "ALPACA_PAPER", broker_status: reason, closed_at: iso(now) });
          await logEvent({ kind: "BROKER_REJECTED", symbol: sym.symbol, severity: "warn", message: `${sym.symbol}: הברוקר דחה את הפקודה (מגמה יומית) — ${reason}` });
          continue;
        }
      } else if (useBroker && execution === "PAPER") {
        await logEvent({ kind: "BROKER_UNSUPPORTED", symbol: sym.symbol, message: `${sym.symbol}: לא נסחר ב-Alpaca — העסקה נשארת בסימולציה` });
      }
      input.account.open.push({ symbol: sym.symbol, entry_limit: agentPlan.entry, remaining_size: agentPlan.size, state: "PENDING", sim_state: { state: "PENDING", entry_price: null, stop_price: agentPlan.stop } } as TradeRow);
      if (execution === "PAPER") {
        await logEvent({
          kind: "ORDER_PLACED",
          symbol: sym.symbol,
          message: `${brokerOk ? "[Alpaca demo] " : ""}${sym.symbol} מגמה יומית ${score}: Limit ${agentPlan.entry.toPrecision(6)} · סטופ ${agentPlan.stop.toPrecision(6)} · ×${multiplier} · ${verdict?.thesis ?? "deterministic"}`.slice(0, 300),
          push: true,
        });
      }
    } catch (err) {
      summary.errors.push(`scan-daily-trend ${c.symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
