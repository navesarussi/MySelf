import { getSupabase } from "@/lib/supabase";
import { backtestGate, nextPhase, paperGate, shadowGate, type BacktestGateInput, type GateCheck } from "./gates";
import { agentValueReport } from "./learning";
import { computeStats } from "./metrics";
import { getClosedTrades, isAccountTrade, toJournalTrade, type TradeRow, type TradingSettings } from "./store";
import type { TradingPhase } from "./types";

/** Go/No-Go view: which gate the current phase has to clear before the next one. */

const iso = (ms: number) => new Date(ms).toISOString();

export type PhaseGateView = { phase: TradingPhase; next: TradingPhase | null; checks: GateCheck[]; passes: boolean; days_in_phase: number };

async function latestBacktestGateInput(): Promise<(BacktestGateInput & { id: string }) | null> {
  const { data } = await getSupabase().from("trading_backtests").select("id, gate, created_at").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const g = (data as { id: string; gate: BacktestGateInput } | null)?.gate;
  return g && data ? { ...g, id: (data as { id: string }).id } : null;
}

async function reviewed(kind: string, since: string) {
  const { count } = await getSupabase().from("trading_events").select("id", { count: "exact", head: true }).eq("kind", `GATE_REVIEW:${kind}`).gte("created_at", since);
  return (count ?? 0) > 0;
}

export async function computePhaseGate(settings: TradingSettings, closed?: TradeRow[]): Promise<PhaseGateView> {
  const days = Math.floor((Date.now() - Date.parse(settings.phase_started_at)) / 86_400_000);
  const next = nextPhase(settings.phase);
  let checks: GateCheck[] = [];
  if (settings.phase === "BACKTEST") {
    checks = backtestGate(await latestBacktestGateInput());
  } else if (settings.phase === "SHADOW") {
    const trades = (closed ?? (await getClosedTrades())).filter((t) => t.closed_at && t.closed_at >= settings.phase_started_at);
    checks = shadowGate({
      agent: agentValueReport(trades.map(toJournalTrade)),
      days_in_phase: days,
      reasoning_reviewed: await reviewed("reasoning_reviewed", settings.phase_started_at),
    });
  } else if (settings.phase === "PAPER") {
    const trades = (closed ?? (await getClosedTrades())).filter((t) => t.closed_at && t.closed_at >= settings.phase_started_at && isAccountTrade(t, "PAPER"));
    const bt = await latestBacktestGateInput();
    const { count } = await getSupabase()
      .from("trading_events")
      .select("id", { count: "exact", head: true })
      .eq("severity", "critical")
      .gte("created_at", iso(Date.now() - 14 * 86_400_000));
    checks = paperGate({
      days_in_phase: days,
      paper_stats: computeStats(trades.map((t) => ({ r: t.realized_r ?? 0, closed_at: Date.parse(t.closed_at!) }))),
      backtest_expectancy_r: bt?.stats.expectancy_r ?? null,
      critical_events_14d: count ?? 0,
      survived_outage_reviewed: await reviewed("resilience_reviewed", settings.phase_started_at),
    });
  } else {
    checks = [{ id: "live", ok: false, detail: "LIVE — final phase. Scale 0.25% → 0.5% → 1%, three profitable months per step." }];
  }
  return { phase: settings.phase, next, checks, passes: checks.length > 0 && checks.every((c) => c.ok), days_in_phase: days };
}
