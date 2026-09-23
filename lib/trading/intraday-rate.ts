import { getSupabase } from "@/lib/supabase";
import { rateIntradayTrade, type RatingSnapshot } from "./agent-rater";
import { INTRADAY_STRATEGY_VERSION } from "./engine";
import { MAX_RATINGS_PER_TICK, TICK_BUDGET_MS, iso, type IntradaySummary } from "./intraday-context";

/** Stage 3 — the rating-only agent: score entered trades, never change them. */

export async function rateEnteredTriggers(now: number, started: number, summary: IntradaySummary) {
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
