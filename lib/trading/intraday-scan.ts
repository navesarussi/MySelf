import { getSupabase } from "@/lib/supabase";
import { type LoadedFrames } from "./intraday-data";
import { type IntradayUniverseRow } from "./intraday-universe";
import { INTRADAY_STRATEGY_VERSION } from "./engine";
import { closedIdx } from "./strategy/series";
import { intradayParamsFor, scanIntraday, type IntradayCandidate } from "./strategy/intraday";
import { logEvent, type TradeRow, type TradingSettings } from "./store";
import { intradayToOpportunityTicket } from "./committee/adapters";
import { runCommitteeShadowBatch, type CommitteeHookItem } from "./committee/hook";
import {
  CHART_BARS_BEFORE,
  MAX_CONFIRM_AGE_MS,
  TICK_BUDGET_MS,
  intradayEnvelopeBlocks,
  iso,
  sizeIntraday,
  type IntradayAccount,
  type IntradaySummary,
  type StockSession,
} from "./intraday-context";
import { insertIntradayTrade, placeIntradayBrokerEntry, ratingSnapshotFor } from "./intraday-trade";

/** Stage 2 — scan the universe for confirmed setups and enter them. */

export async function scanAndEnter(input: {
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
