import { getSupabase } from "@/lib/supabase";
import { consolidatePlaybook, reviewClosedTrade } from "./agent-judge";
import { activatePlaybook, countLessonsSince, getActivePlaybook, insertLesson, listLessons, logEvent, updateTrade, type TradeRow } from "./store";
import { isIntradayManaged } from "./strategy-versions";
import { LESSONS_PER_PLAYBOOK, MAX_LESSONS_PER_TICK, type TickSummary } from "./tick-context";

/**
 * Stage 2 — turn closed trades into lessons, and lessons into a playbook
 * version. Split out of engine.ts.
 */

export async function learnFromClosedTrades(closedNow: TradeRow[], summary: TickSummary) {
  // Intraday trades are rated, not reviewed (rating-only phase) — no per-trade lessons.
  for (const t of closedNow.filter((x) => x.track === "AGENT" && x.state === "CLOSED" && !x.lesson_id && !isIntradayManaged(x.strategy_version)).slice(0, MAX_LESSONS_PER_TICK)) {
    const { data: trig } = t.trigger_id ? await getSupabase().from("trading_triggers").select("agent_market_read, agent_thesis, agent_invalidation, agent_reasoning, score, setup").eq("id", t.trigger_id).maybeSingle() : { data: null };
    summary.agent_calls += 1;
    const lesson = await reviewClosedTrade({
      trade: {
        symbol: t.symbol,
        setup: t.setup,
        score: t.score,
        entry: t.entry_price,
        initial_stop: t.initial_stop_price,
        final_target: t.target_price,
        exit: t.exit_price,
        exit_reason: t.exit_reason,
        realized_r: t.realized_r,
        mfe_r: t.sim_state.mfe_r,
        mae_r: t.sim_state.mae_r,
        risk_multiplier: t.agent_risk_multiplier,
        analysis_at_entry: trig,
        lifecycle: t.events,
      },
      path_bars: t.chart_bars ?? [],
    });
    if (!lesson) continue;
    const pb = await getActivePlaybook();
    const lessonId = await insertLesson({ trade_id: t.id, symbol: t.symbol, setup: t.setup, realized_r: t.realized_r ?? 0, playbook_version: pb?.version ?? null, ...lesson });
    if (lessonId) {
      await updateTrade(t.id, { lesson_id: lessonId });
      summary.lessons += 1;
    }
  }

  const active = await getActivePlaybook();
  if ((await countLessonsSince(active?.created_at ?? null)) < LESSONS_PER_PLAYBOOK) return;
  const lessons = (await listLessons(60)).map((l) => ({ category: l.category as never, what_happened: l.what_happened, lesson: l.lesson, applies_when: l.applies_when, decision_quality: l.decision_quality, realized_r: l.realized_r }));
  summary.agent_calls += 1;
  const rules = await consolidatePlaybook(lessons);
  if (!rules?.length) return;
  const version = await activatePlaybook(rules, lessons.length);
  summary.playbook_version = version;
  await logEvent({ kind: "PLAYBOOK", severity: "warn", message: `הסוכן מסחר עדכן playbook לגרסה ${version}: ${rules.length} כללים מ-${lessons.length} לקחים`, push: true });
}
