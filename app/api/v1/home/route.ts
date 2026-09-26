import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { userDb } from "@/lib/db/user-db";
import { isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { dedupeGoals, dedupeTasks } from "@/lib/data-integrity";
import { dedupeHabits } from "@/lib/habit-stats";
import { avgTaskCloseDays } from "@/lib/task-stats";
import { selectHomeEvents } from "@/lib/home-events";
import { currentMonthKey, shapeTradingSnapshot } from "@/lib/home-snapshots";
import { loadTradingSnapshot } from "@/lib/trading/account-equity";
import { isPrimaryGoogleEmail } from "@/lib/integrations/google-auth";
import { formatUrgentFinanceLabel } from "@/lib/widget-snapshot";
import { scheduleDataIntegrityCleanup } from "@/lib/schedule-data-integrity-cleanup";
import type { Task } from "@/lib/types";
import { fetchMonthNetActual } from "@/lib/finance/month-net";
import { withRouteHandler } from "@/lib/api/with-route-handler";

/** Rows sampled for the average-close-days KPI. Ordered by updated_at so the
 *  sample is the most recent N and the number is stable between loads — an
 *  unordered limit let Postgres return an arbitrary subset each time. */
const DONE_TASK_SAMPLE = 500;

type TaskJoin = Task & { projects?: { name: string } | { name: string }[] | null };

type QueryLike = { error?: { message?: string } | null };

/** Home renders partial data rather than failing, so a query that errors would
 *  otherwise be indistinguishable from "no rows". Log it and tell the client. */
function collectFailures(named: Record<string, unknown>): string[] {
  const failed: string[] = [];
  for (const [name, res] of Object.entries(named)) {
    const err = (res as QueryLike | null)?.error;
    if (err) {
      failed.push(name);
      console.error("[home]", name, err.message ?? err);
    }
  }
  return failed;
}

function projectNameFromJoin(projects: TaskJoin["projects"]): string | undefined {
  if (!projects) return undefined;
  if (Array.isArray(projects)) return projects[0]?.name;
  return projects.name;
}

/** Everything the home dashboard needs, mirroring app/page.tsx. Habit/streak
 *  math happens client-side with the shared lib/habit-stats helpers. */
export const GET = withRouteHandler(async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const supabase = getSupabase();
  const db = await userDb();
  const month = currentMonthKey();
  // Trading is the primary account's alone; other accounts' home has no trading card.
  const showTrading = await isPrimaryGoogleEmail(db.userId);

  const [
    habitsRes,
    goalsRes,
    doneGoalsRes,
    commitmentsRes,
    relRes,
    eventsRes,
    tasksRes,
    projectsRes,
    libraryRes,
    openTasksCountRes,
    inProgressTasksCountRes,
    doneTasksCountRes,
    doneTasksTimingRes,
    financeUncategorizedRes,
    urgentFinanceRes,
    financeNetRes,
    tradingRes,
  ] = await Promise.all([
    db
      .from("habits")
      .select(
        "id, name, kind, target_note, streak_count, best_streak, total_success_days, failure_count, last_checked_on, report_time, last_reported_at, archived, created_at"
      )
      .eq("archived", false),
    db
      .from("goals")
      .select("id, title, category, horizon, first_step, definition_of_done, status, sort_order, created_at")
      .eq("status", "active"),
    db.from("goals").select("id", { count: "exact", head: true }).eq("status", "done"),
    db
      .from("commitments")
      .select("id, commitment_date, text, status, created_at")
      .eq("status", "pending")
      .order("commitment_date", { ascending: false }),
    db
      .from("relationships")
      .select("id, name, last_contact_date, reminder_days, phone, email")
      .order("name"),
    db
      .from("timeline_events")
      .select("id, title, title_override, source, event_date, event_time, hidden_at")
      .is("hidden_at", null)
      .order("event_date", { ascending: false })
      .limit(60),
    db
      .from("tasks")
      .select(
        "id, title, project_id, priority, status, due_date, notes, source, external_id, external_list_id, external_meta, synced_at, created_at, updated_at, projects(name)"
      )
      .in("status", ["open", "in_progress", "stuck", "review"])
      .order("created_at", { ascending: false })
      .limit(25),
    db.from("projects").select("id, name, sort_order, created_at").order("sort_order"),
    db
      .from("content_entries")
      .select("id, title, category, tags, updated_at")
      .order("updated_at", { ascending: false })
      .limit(20),
    db
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    db
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "in_progress"),
    db.from("tasks").select("id", { count: "exact", head: true }).eq("status", "done"),
    db
      .from("tasks")
      .select("created_at, updated_at, status")
      .eq("status", "done")
      .order("updated_at", { ascending: false })
      .limit(DONE_TASK_SAMPLE),
    supabase
      .from("finance_transactions")
      .select("id", { count: "exact", head: true })
      .eq("needs_categorization", true)
      .is("deleted_at", null),
    supabase
      .from("finance_transactions")
      .select("id, amount, merchant, description")
      .eq("needs_categorization", true)
      .is("deleted_at", null)
      .order("txn_date", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1),
    fetchMonthNetActual(month).then(
      (net) => ({ data: net, error: null }),
      (err: Error) => ({ data: null, error: { message: err.message } })
    ),
    showTrading ? loadTradingSnapshot().catch(() => null) : null,
  ]);

  const degraded = collectFailures({
    habits: habitsRes,
    goals: goalsRes,
    doneGoals: doneGoalsRes,
    commitments: commitmentsRes,
    relationships: relRes,
    events: eventsRes,
    tasks: tasksRes,
    projects: projectsRes,
    library: libraryRes,
    openTasksCount: openTasksCountRes,
    inProgressTasksCount: inProgressTasksCountRes,
    doneTasksCount: doneTasksCountRes,
    doneTasksTiming: doneTasksTimingRes,
    financeUncategorized: financeUncategorizedRes,
    urgentFinance: urgentFinanceRes,
    financeNet: financeNetRes,
  });
  if (showTrading && !tradingRes) degraded.push("trading");
  else if (tradingRes?.equityFailed) degraded.push("trading.equity");

  const selected = selectHomeEvents(eventsRes.data || [], new Date(), 10);

  const openTasks = dedupeTasks(
    ((tasksRes.data ?? []) as unknown as TaskJoin[]).map((row) => ({
      ...row,
      project_name: projectNameFromJoin(row.projects),
      projects: undefined,
    }))
  );
  const habits = dedupeHabits(habitsRes.data || []);
  const activeGoals = dedupeGoals(goalsRes.data || []);
  scheduleDataIntegrityCleanup(
    habits.length < (habitsRes.data?.length ?? 0) ||
      activeGoals.length < (goalsRes.data?.length ?? 0) ||
      openTasks.length < ((tasksRes.data as unknown as TaskJoin[] | null)?.length ?? 0)
  );

  const urgentFinanceRow = urgentFinanceRes.data?.[0];
  const urgentFinance = urgentFinanceRow
    ? {
        id: urgentFinanceRow.id,
        titleOrAmountLabel: formatUrgentFinanceLabel(urgentFinanceRow),
      }
    : null;

  return NextResponse.json({
    ...(degraded.length > 0 ? { degraded } : {}),
    habits,
    activeGoals,
    doneGoalsCount: doneGoalsRes.count || 0,
    pendingCommitments: commitmentsRes.data || [],
    relationships: relRes.data || [],
    recentEvents: selected.events,
    eventsMode: selected.mode,
    openTasks,
    projects: projectsRes.data || [],
    libraryEntries: libraryRes.data || [],
    openTasksCount: openTasksCountRes.count || 0,
    inProgressTasksCount: inProgressTasksCountRes.count || 0,
    doneTasksCount: doneTasksCountRes.count || 0,
    avgTaskCloseDays: avgTaskCloseDays((doneTasksTimingRes.data ?? []) as Task[]),
    financeUncategorizedCount: financeUncategorizedRes.count || 0,
    urgentFinance,
    finance: {
      month,
      net_actual: financeNetRes.data ?? 0,
      uncategorized_count: financeUncategorizedRes.count || 0,
    },
    trading: shapeTradingSnapshot(
      (tradingRes?.settings ?? null) as Record<string, unknown> | null,
      tradingRes?.liveEquity ?? null
    ),
  });
});
