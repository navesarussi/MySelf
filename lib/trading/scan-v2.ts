import { getSupabase } from "@/lib/supabase";
import { REGIME_REFERENCE, RISK_ENVELOPE, isCrypto } from "./config";
import { judgeTrigger, type AgentVerdict } from "./agent-judge";
import { returnCorrelation } from "./indicators";
import { fetchBtcDominance, fetchEarningsSymbols, fetchFundingRate, fetchVix, type BarCache } from "./market-data";
import { openRiskR } from "./position";
import { alpaca, isAlpacaConfigured } from "./broker/alpaca";
import { checkNewEntry, drawdownFromPeak } from "./risk-envelope";
import { round } from "./round";
import { buildTradePlan } from "./sizing";
import { getClosedTrades, logEvent, updateTrade, type PlaybookRow, type TradeRow, type TradingSettings, type UniverseRow } from "./store";
import { STRATEGY_VERSION } from "./strategy-versions";
import { experienceCard, insertTrade } from "./trade-insert";
import { DISCRETION_POOL_PARAMS, analystBrief, evaluateCandidates, isBaselineCandidate, lastBars, universeContext, type Candidate, type StrategyV2Params, type SymbolFrames } from "./strategy/candidates";
import { closedIdx } from "./strategy/series";
import { evaluateVetoes, isoDateInZone, nextTradingDays, type CalendarEvent } from "./veto";
import { CHART_BARS_BEFORE, H4, MAX_AGENT_CALLS_PER_TICK, TICK_TIME_BUDGET_MS, barsFor, iso, toSym, type Account, type FrameCache, type TickSummary } from "./tick-context";
import { v2SwingToOpportunityTicket } from "./committee/adapters";
import { runCommitteeShadowBatch, type CommitteeHookItem } from "./committee/hook";

/**
 * Stage 4 — strategy v2: setups on 4h closes, entry timing and management on
 * 1h bars, with the agent judging each trigger.
 *
 * Split out of engine.ts; the tick calls `scan` and owns nothing else about it.
 */


export async function scan(input: {
  settings: TradingSettings;
  universe: UniverseRow[];
  params: StrategyV2Params;
  frames: FrameCache;
  cache: BarCache;
  calendar: CalendarEvent[];
  account: Account;
  playbook: PlaybookRow | null;
  now: number;
  started: number;
  summary: TickSummary;
}) {
  const { settings, params, now, summary } = input;
  // הסוכן מסחר chooses from a wider pool than the deterministic baseline would take (same management rules).
  const pool: StrategyV2Params = settings.agent_enabled
    ? { ...params, min_score: Math.min(params.min_score, DISCRETION_POOL_PARAMS.min_score), setups: DISCRETION_POOL_PARAMS.setups }
    : params;
  const useBroker = settings.phase === "PAPER" && settings.execution_venue === "ALPACA_PAPER" && isAlpacaConfigured();
  const cryptoTradable = useBroker ? await alpaca.tradableSymbols().catch(() => new Set<string>()) : new Set<string>();
  // Setups are only defined on a completed 4h bar.
  const T = Math.floor(now / H4) * H4;
  const eligible = input.universe.filter((u) => u.manual_enabled && u.screen_passed && u.eligibility !== "DISABLED_POOR");
  if (!eligible.length) return;

  const framesList: SymbolFrames[] = [];
  for (const u of eligible) {
    const f = await input.frames(toSym(u));
    if (f) framesList.push(f);
  }
  const refFrames = new Map<string, SymbolFrames | null>();
  for (const ref of new Set(eligible.map((u) => REGIME_REFERENCE[u.asset_class]))) refFrames.set(ref.symbol, await input.frames(ref));
  const byClass = (cls: "STOCK" | "CRYPTO") => framesList.filter((f) => (cls === "STOCK" ? f.asset_class === "STOCK" : f.asset_class !== "STOCK"));
  const ctxStock = universeContext(byClass("STOCK"), T);
  const ctxCrypto = universeContext(byClass("CRYPTO"), T);

  const found: Candidate[] = [];
  const referenceOkBySymbol = new Map<string, boolean | null>();
  for (const f of framesList) {
    const ref = refFrames.get(REGIME_REFERENCE[f.asset_class].symbol) ?? null;
    let referenceOk: boolean | null = null;
    if (ref && ref.symbol !== f.symbol && f.asset_class !== "CRYPTO_MAJOR") {
      const ri = closedIdx(ref.d1, T);
      referenceOk = ri >= 0 ? ref.d1.bars[ri].c > ref.d1.ema200[ri] : false;
    }
    referenceOkBySymbol.set(f.symbol, referenceOk);
    const uctx = f.asset_class === "STOCK" ? ctxStock : ctxCrypto;
    found.push(...evaluateCandidates(f, T, { reference_ok: referenceOk, rs_rank: uctx.rank.get(f.symbol) ?? null, breadth: uctx.breadth }, pool).candidates);
  }
  if (!found.length) return;
  found.sort((a, b) => b.score - a.score || b.rr - a.rr);

  const closed = await getClosedTrades();
  const earnings = found.some((c) => c.asset_class === "STOCK") ? await fetchEarningsSymbols(nextTradingDays(isoDateInZone(new Date(now), "America/New_York"), 4)) : new Set<string>();
  const [vix, dominance] = await Promise.all([fetchVix(), fetchBtcDominance()]);
  const committeeBatch: CommitteeHookItem[] = [];

  for (const c of found) {
    if (Date.now() - input.started > TICK_TIME_BUDGET_MS) {
      summary.errors.push("time_budget_exhausted");
      return;
    }
    const u = eligible.find((x) => x.symbol === c.symbol)!;
    const f = framesList.find((x) => x.symbol === c.symbol)!;
    const sym = toSym(u);
    try {
      summary.triggers += 1;
      const bucket = u.bucket_id ?? `${sym.asset_class}:UNKNOWN`;
      const funding = isCrypto(sym.asset_class) ? await fetchFundingRate(sym.provider_symbol) : undefined;
      const vetoes = evaluateVetoes({ symbol: sym.symbol, asset_class: sym.asset_class, mode: "SWING", now: new Date(now), calendar: input.calendar, earnings_symbols: earnings, funding_rate: funding });

      const correlated: string[] = [];
      const correlations: Record<string, number | null> = {};
      for (const t of input.account.open) {
        const other = input.universe.find((x) => x.symbol === t.symbol);
        if (!other) continue;
        const od = await barsFor(input.cache, toSym(other), "1d");
        const rho = returnCorrelation(f.d1.bars.map((b) => b.c), od.map((b) => b.c));
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
      const basePlan = buildTradePlan({ entry: c.entry, stopDistance: c.entry - c.stop, equity: input.account.equity, assetClass: sym.asset_class, riskScale: settings.risk_scale });
      const deterministic = vetoes.length ? "VETO" : blocks.length || !basePlan ? "BLOCKED" : "ENTER";
      const baselineEnter = isBaselineCandidate(c, params);
      const brief = analystBrief(f, T);
      const snapshot = { candidate: c, brief, correlations, funding_rate: funding ?? null, vix, btc_dominance_pct: dominance };

      const { data: trig, error: trigErr } = await getSupabase()
        .from("trading_triggers")
        .upsert(
          {
            symbol: sym.symbol,
            asset_class: sym.asset_class,
            mode: "SWING",
            bucket_id: bucket,
            bar_time: iso(T - H4),
            setup: c.setup,
            score: c.score,
            snapshot,
            vetoes,
            envelope_blocks: blocks,
            plan: basePlan ? { ...basePlan, target: c.target, target_menu: c.target_menu } : null,
            deterministic_decision: deterministic,
            baseline_enter: baselineEnter,
            param_version: pool.version,
            strategy_version: STRATEGY_VERSION,
            phase: settings.phase,
          },
          { onConflict: "symbol,mode,bar_time,strategy_version", ignoreDuplicates: true }
        )
        .select("id")
        .maybeSingle();
      if (trigErr) throw new Error(trigErr.message);
      if (!trig) continue; // already processed by an earlier tick
      const triggerId = String((trig as { id: string }).id);
      const uctx = c.asset_class === "STOCK" ? ctxStock : ctxCrypto;
      const ticketR = v2SwingToOpportunityTicket({
        candidate: c,
        frames: f,
        market: { reference_ok: referenceOkBySymbol.get(c.symbol) ?? null, rs_rank: uctx.rank.get(c.symbol) ?? null, breadth: uctx.breadth },
      });
      if (ticketR.ok) {
        committeeBatch.push({
          ticket: ticketR.data,
          assetClass: sym.asset_class,
          vetoes,
          envelopeBlocks: blocks,
          triggerId,
          headlines: [],
          earningsWindow: earnings?.has(sym.symbol) ?? false,
        });
      }
      if (vetoes.length || !basePlan || !brief) {
        summary.vetoed += vetoes.length ? 1 : 0;
        continue;
      }

      // הסוכן מסחר — analyst judgement (also recorded when the envelope blocks, for shadow measurement).
      let verdict: AgentVerdict | null = null;
      let flags: string[] = [];
      // Discretionary candidates the envelope already blocks aren't worth a model call; baseline ones are (measurement).
      const worthJudging = baselineEnter || blocks.length === 0;
      if (settings.agent_enabled && worthJudging && summary.agent_calls < MAX_AGENT_CALLS_PER_TICK) {
        summary.agent_calls += 1;
        const i1 = closedIdx(f.h1, T);
        const judged = await judgeTrigger(
          {
            symbol: sym.symbol,
            baseline_would_enter: baselineEnter,
            asset_class: sym.asset_class,
            candidate: c,
            target_menu: c.target_menu,
            brief,
            bars: { d1: lastBars(f.d1, closedIdx(f.d1, T), 30), h4: lastBars(f.h4, closedIdx(f.h4, T), 40), h1: lastBars(f.h1, i1, 48) },
            experience: experienceCard(sym.symbol, c, closed),
            portfolio: {
              open_positions: input.account.open.map((t) => ({ symbol: t.symbol, state: t.state, open_risk_r: openRiskR(t.sim_state), correlation: correlations[t.symbol] ?? null })),
              open_risk_r: openRisk.reduce((s, p) => s + p.open_risk_r, 0),
              realized_r_today: input.account.realizedToday,
              realized_r_week: input.account.realizedWeek,
              drawdown_pct: drawdownFromPeak(input.account.equity, settings.peak_equity),
            },
            market: { reference_ok: referenceOkBySymbol.get(c.symbol) ?? null, rs_rank: (c.factors.rs_rank as number | null) ?? null, breadth: (c.factors.breadth as number | null) ?? null, vix, btc_dominance_pct: dominance, funding_rate: funding ?? null, headlines: [] },
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

      const chart = f.h1.bars.slice(Math.max(0, closedIdx(f.h1, T) - CHART_BARS_BEFORE + 1), closedIdx(f.h1, T) + 1);
      const base = { trigger_id: triggerId, c, bucket, snapshot: snapshot as unknown as Record<string, unknown>, verdict, params, chart };

      // Deterministic baseline — structural target, always simulated forward in shadow.
      await insertTrade({ ...base, track: "DETERMINISTIC", execution: "SHADOW", plan: basePlan, target: c.target, baseline_enter: baselineEnter });

      // No verdict (agent off / budget) → only what the deterministic baseline would take.
      const multiplier = verdict ? verdict.risk_multiplier : baselineEnter ? 1 : 0;
      if (settings.phase === "BACKTEST" || multiplier === 0) continue;
      if (blocks.length) {
        summary.blocked += 1;
        continue;
      }
      const agentPlan = buildTradePlan({ entry: c.entry, stopDistance: c.entry - c.stop, equity: input.account.equity, assetClass: sym.asset_class, riskScale: settings.risk_scale * multiplier });
      if (!agentPlan) continue;
      const target = c.target_menu[verdict?.target_index ?? 0]?.price ?? c.target;
      const execution = settings.phase === "PAPER" && u.eligibility === "ACTIVE" ? "PAPER" : "SHADOW";
      const brokerOk =
        useBroker && execution === "PAPER" && (sym.asset_class === "STOCK" ? await alpaca.isStockTradable(sym.symbol) : cryptoTradable.has(`${sym.symbol}/USD`));
      const tradeId = await insertTrade({ ...base, track: "AGENT", execution, plan: agentPlan, target, baseline_enter: baselineEnter });
      summary.entries += 1;
      if (brokerOk) {
        try {
          const order = await alpaca.placeEntry({ symbol: sym.symbol, assetClass: sym.asset_class, qty: agentPlan.size, limit: agentPlan.entry, stop: agentPlan.stop, target, clientId: `${tradeId.slice(0, 18)}-in` });
          await updateTrade(tradeId, { broker: "ALPACA_PAPER", broker_entry_order_id: order.id, broker_status: order.status });
        } catch (err) {
          const reason = err instanceof Error ? err.message.slice(0, 160) : "broker_error";
          await updateTrade(tradeId, { state: "CANCELLED", exit_reason: "BROKER_REJECTED", broker: "ALPACA_PAPER", broker_status: reason, closed_at: iso(now) });
          await logEvent({ kind: "BROKER_REJECTED", symbol: sym.symbol, severity: "warn", message: `${sym.symbol}: הברוקר דחה את הפקודה — ${reason}` });
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
          message: `${brokerOk ? "[Alpaca demo] " : ""}${sym.symbol} ${c.setup} ${c.score}${baselineEnter ? "" : " (AI)"}: Limit ${agentPlan.entry.toPrecision(6)} · סטופ ${agentPlan.stop.toPrecision(6)} · יעד ${target.toPrecision(6)} · ×${multiplier} · ${verdict?.thesis ?? "deterministic"}`.slice(0, 300),
          push: true,
        });
      }
    } catch (err) {
      summary.errors.push(`scan ${c.symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  try {
    await runCommitteeShadowBatch(committeeBatch, { settings, account: input.account, vix, btc_dominance_pct: dominance, funding_rate: null, summary });
  } catch (err) {
    summary.errors.push(`committee_shadow: ${err instanceof Error ? err.message : String(err)}`);
  }
}
