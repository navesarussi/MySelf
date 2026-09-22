import { getSupabase } from "@/lib/supabase";
import { LEARNING_RULES, PAPER_STARTING_EQUITY, SEED_UNIVERSE } from "./config";
import { backtestGate, type BacktestGateInput } from "./gates";
import { downsample, runBacktestV2, type V2Result } from "./strategy/backtest-v2";
import type { StrategyV2Params } from "./strategy/candidates";
import { loadFramesV2, warmStart } from "./strategy/data-v2";
import { runCalibration, walkForwardStability } from "./learning";
import { getActiveV2Params, getCalendar, logEvent } from "./store";
import type { UniverseSymbol } from "./types";

/** Backtests and the quarterly, human-approved calibration built on them. */

const iso = (ms: number) => new Date(ms).toISOString();

export type BacktestPreset = "CRYPTO" | "STOCKS" | "ALL";

export function presetSymbols(preset: BacktestPreset, explicit?: string[]): UniverseSymbol[] {
  if (explicit?.length) {
    const set = new Set(explicit.map((s) => s.toUpperCase()));
    return SEED_UNIVERSE.filter((s) => set.has(s.symbol));
  }
  if (preset === "CRYPTO") return SEED_UNIVERSE.filter((s) => s.asset_class !== "STOCK");
  if (preset === "STOCKS") return SEED_UNIVERSE.filter((s) => s.asset_class === "STOCK");
  return SEED_UNIVERSE;
}

const TRADES_KEPT_PER_VARIANT = 400;
/** Free hourly stock history is ~730 days; keep 30 days of margin. */
const STOCK_MAX_YEARS = 1.9;

/** Comparison variants stored with every run, so the value of each strategy component is visible. */
function backtestVariants(params: StrategyV2Params): { label: string; params: StrategyV2Params }[] {
  return [
    { label: "ACTIVE", params },
    { label: "NO_EXTENSION", params: { ...params, extension_enabled: false } },
    { label: "PARTIAL_50_AT_1R", params: { ...params, partial_fraction: 0.5 } },
    { label: "WITH_PULLBACK", params: { ...params, setups: ["BREAKOUT", "PULLBACK"] } },
  ];
}

export async function runAndStoreBacktest(input: { preset: BacktestPreset; symbols?: string[]; years: number }) {
  const started = Date.now();
  const { params } = await getActiveV2Params();
  const calendar = await getCalendar("2000-01-01");
  const symbols = presetSymbols(input.preset, input.symbols);
  const years = symbols.some((s) => s.asset_class === "STOCK") ? Math.min(input.years, STOCK_MAX_YEARS) : input.years;
  const since = Date.now() - years * 365 * 86_400_000;
  const { frames, reference, skipped } = await loadFramesV2(symbols, since);
  const start = warmStart(frames, since);
  const end = Date.now();
  const results: V2Result[] = backtestVariants(params).map((v) =>
    runBacktestV2({ frames, reference, params: v.params, starting_equity: PAPER_STARTING_EQUITY, start, end, calendar, label: v.label })
  );
  const primary = results[0];
  const wf = walkForwardStability({ frames, reference, start, end, startingEquity: PAPER_STARTING_EQUITY, calendar }, params);
  const gate: BacktestGateInput = {
    stats: primary.stats,
    return_pct: primary.return_pct,
    benchmark_return_pct: primary.benchmark_return_pct,
    sharpe: primary.sharpe,
    benchmark_sharpe: primary.benchmark_sharpe,
    max_dd_pct: primary.max_equity_dd_pct,
    benchmark_max_dd_pct: primary.benchmark_max_dd_pct,
    walk_forward_passes: wf.passes,
    oos_expectancy_r: wf.oos_expectancy_r,
    mc_dd_pct_p95: primary.monte_carlo.max_dd_pct_p95,
    mc_prob_kill: primary.monte_carlo.prob_kill_switch,
    created_at: Date.now(),
  };
  const stored = results.map((r) => ({ ...r, trades: r.trades.slice(-TRADES_KEPT_PER_VARIANT), equity_curve: downsample(r.equity_curve, 300) }));
  const { data, error } = await getSupabase()
    .from("trading_backtests")
    .insert({
      mode: "SWING",
      years,
      symbols: frames.map((f) => f.symbol),
      param_version: params.version,
      params,
      range_start: iso(start),
      range_end: iso(end),
      results: stored,
      walk_forward: wf,
      gate: { ...gate, checks: backtestGate(gate) },
      skipped,
      duration_ms: Date.now() - started,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await logEvent({
    kind: "BACKTEST",
    message: `בקטסט ${input.preset} ${years}y: ${primary.stats.trades} עסקאות, תוחלת ${primary.stats.expectancy_r}R, Sharpe ${primary.sharpe}, שער ${backtestGate(gate).every((c) => c.ok) ? "עבר" : "לא עבר"}`,
  });
  return { id: (data as { id: string }).id };
}

export async function listBacktests() {
  const { data, error } = await getSupabase()
    .from("trading_backtests")
    .select("id, mode, years, symbols, param_version, range_start, range_end, gate, duration_ms, created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getBacktest(id: string) {
  const { data, error } = await getSupabase().from("trading_backtests").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// ── Calibration (quarterly, human-approved) ────────────────────────────────

export async function proposeCalibration(input: { preset: BacktestPreset; years: number }) {
  const { params } = await getActiveV2Params();
  const calendar = await getCalendar("2000-01-01");
  const symbols = presetSymbols(input.preset);
  const since = Date.now() - input.years * 365 * 86_400_000;
  const { frames, reference } = await loadFramesV2(symbols, since);
  const start = warmStart(frames, since);
  const cal = runCalibration({ frames, reference, start, end: Date.now(), startingEquity: PAPER_STARTING_EQUITY, calendar }, params);
  const { data, error } = await getSupabase()
    .from("trading_param_sets")
    .insert({
      version: `${cal.proposed.version}@${new Date().toISOString().slice(0, 10)}`,
      params: { ...cal.proposed, strategy: "v2" },
      status: "PROPOSED",
      evidence: { ...cal, preset: input.preset, years: input.years, symbols: frames.map((f) => f.symbol), current_version: params.version },
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await logEvent({ kind: "CALIBRATION_PROPOSED", severity: "warn", message: `הצעת כיול: ${cal.proposed.version} · OOS ${cal.oos_total_r}R מול נוכחי ${cal.current_oos_total_r}R`, push: true });
  return { id: (data as { id: string }).id, recommend: cal.recommend };
}

export async function listParamSets() {
  const { data } = await getSupabase().from("trading_param_sets").select("*").order("created_at", { ascending: false }).limit(20);
  return data ?? [];
}

export async function decideCalibration(id: string, approve: boolean) {
  const sb = getSupabase();
  const { data: row } = await sb.from("trading_param_sets").select("*").eq("id", id).maybeSingle();
  if (!row || (row as { status: string }).status !== "PROPOSED") throw new Error("not_proposed");
  if (!approve) {
    await sb.from("trading_param_sets").update({ status: "REJECTED", decided_at: iso(Date.now()) }).eq("id", id);
    await logEvent({ kind: "CALIBRATION_REJECTED", message: `כיול נדחה: ${(row as { version: string }).version}` });
    return;
  }
  const active = await getActiveV2Params();
  if (active.locked_until && Date.parse(active.locked_until) > Date.now()) throw new Error("params_locked_until_" + active.locked_until.slice(0, 10));
  await sb.from("trading_param_sets").update({ status: "RETIRED" }).eq("status", "ACTIVE");
  const lockedUntil = iso(Date.now() + LEARNING_RULES.CALIBRATION_LOCK_DAYS * 86_400_000);
  await sb.from("trading_param_sets").update({ status: "ACTIVE", decided_at: iso(Date.now()), locked_until: lockedUntil }).eq("id", id);
  await logEvent({ kind: "CALIBRATION_APPROVED", severity: "warn", message: `פרמטרים חדשים פעילים וננעלו עד ${lockedUntil.slice(0, 10)}: ${(row as { version: string }).version}`, push: true });
}
