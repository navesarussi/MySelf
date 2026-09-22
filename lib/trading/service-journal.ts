import { getSupabase } from "@/lib/supabase";
import { normalizeTrade, updateTrade, type TradeRow } from "./store";
import type { TriggerRow } from "./service-dashboard";

/** Trade journal: the list, one trade in full, and the notes/tags the user adds. */

export type TradeFilters = {
  execution?: string;
  track?: string;
  state?: "open" | "closed" | "all";
  symbol?: string;
  outcome?: "win" | "loss" | "breakeven";
  limit?: number;
};

export type TradeListItem = Omit<TradeRow, "sim_state" | "chart_bars" | "events" | "trigger_snapshot">;

export async function listTrades(f: TradeFilters): Promise<TradeListItem[]> {
  let q = getSupabase()
    .from("trading_trades")
    .select(
      "id, trigger_id, symbol, asset_class, bucket_id, mode, track, execution, state, trigger_timestamp, agent_decision, agent_conviction, agent_risk_multiplier, agent_reasoning, agent_model_version, prompt_version, param_version, entry_limit, entry_price, stop_price, initial_stop_price, target_price, position_size, remaining_size, risk_amount, entry_slippage_bps, exit_plan, trail_stop, reached_1r, partial_exit_price, exit_price, exit_reason, gapped_through_stop, realized_r, realized_pnl, fees_paid, last_bar_time, mfe_r, mae_r, notes, tags, self_rating, setup, score, strategy_version, lesson_id, broker, broker_status, baseline_enter, agent_rating, agent_rating_explanation, opened_at, closed_at, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(f.limit ?? 200, 1000));
  if (f.execution) q = q.eq("execution", f.execution);
  if (f.track) q = q.eq("track", f.track);
  if (f.symbol) q = q.eq("symbol", f.symbol.toUpperCase());
  if (f.state === "open") q = q.in("state", ["PENDING", "OPEN", "RISK_FREE"]);
  if (f.state === "closed") q = q.eq("state", "CLOSED");
  if (f.outcome === "win") q = q.gt("realized_r", 0.6);
  if (f.outcome === "loss") q = q.lt("realized_r", 0);
  if (f.outcome === "breakeven") q = q.gte("realized_r", 0).lte("realized_r", 0.6);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => normalizeTrade(r as Record<string, unknown>));
}

export async function getTradeDetail(id: string) {
  const sb = getSupabase();
  const { data, error } = await sb.from("trading_trades").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const trade = normalizeTrade(data as Record<string, unknown>);
  let trigger: TriggerRow | null = null;
  let sibling: TradeListItem | null = null;
  if (trade.trigger_id) {
    const { data: trig } = await sb.from("trading_triggers").select("*").eq("id", trade.trigger_id).maybeSingle();
    trigger = (trig as TriggerRow) ?? null;
    const { data: sib } = await sb.from("trading_trades").select("*").eq("trigger_id", trade.trigger_id).neq("id", id).maybeSingle();
    sibling = sib ? normalizeTrade(sib as Record<string, unknown>) : null;
  }
  let lesson: import("./store").LessonRow | null = null;
  if (trade.lesson_id) {
    const { data: l } = await sb.from("trading_lessons").select("*").eq("id", trade.lesson_id).maybeSingle();
    lesson = (l as import("./store").LessonRow) ?? null;
  }
  return { trade, trigger, sibling, lesson };
}

export async function patchTradeJournal(id: string, patch: { notes?: string | null; tags?: string[]; self_rating?: number | null }) {
  const body: Record<string, unknown> = {};
  if (patch.notes !== undefined) body.notes = patch.notes?.slice(0, 5000) ?? null;
  if (patch.tags !== undefined) body.tags = patch.tags.map((t) => t.trim()).filter(Boolean).slice(0, 12);
  if (patch.self_rating !== undefined) body.self_rating = patch.self_rating === null ? null : Math.max(1, Math.min(5, Math.round(patch.self_rating)));
  await updateTrade(id, body);
}
