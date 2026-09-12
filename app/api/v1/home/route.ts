import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { dedupeGoals, dedupeTasks } from "@/lib/data-integrity";
import { dedupeHabits } from "@/lib/habit-stats";
import { selectHomeEvents } from "@/lib/home-events";
import { scheduleDataIntegrityCleanup } from "@/lib/schedule-data-integrity-cleanup";
import type { Task } from "@/lib/types";

type TaskJoin = Task & { projects?: { name: string } | { name: string }[] | null };

function projectNameFromJoin(projects: TaskJoin["projects"]): string | undefined {
  if (!projects) return undefined;
  if (Array.isArray(projects)) return projects[0]?.name;
  return projects.name;
}

/** Everything the home dashboard needs, mirroring app/page.tsx. Habit/streak
 *  math happens client-side with the shared lib/habit-stats helpers. */
export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const supabase = getSupabase();

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
    financeUncategorizedRes,
  ] = await Promise.all([
    supabase
      .from("habits")
      .select(
        "id, name, kind, target_note, streak_count, best_streak, total_success_days, failure_count, last_checked_on, report_time, last_reported_at, archived, created_at"
      )
      .eq("archived", false),
    supabase
      .from("goals")
      .select("id, title, category, horizon, first_step, definition_of_done, status, sort_order, created_at")
      .eq("status", "active"),
    supabase.from("goals").select("id", { count: "exact", head: true }).eq("status", "done"),
    supabase
      .from("commitments")
      .select("id, commitment_date, text, status, created_at")
      .eq("status", "pending")
      .order("commitment_date", { ascending: false }),
    supabase
      .from("relationships")
      .select("id, name, last_contact_date, reminder_days, phone, email")
      .order("name"),
    supabase
      .from("timeline_events")
      .select("id, title, title_override, source, event_date, event_time, hidden_at")
      .is("hidden_at", null)
      .order("event_date", { ascending: false })
      .limit(60),
    supabase
      .from("tasks")
      .select(
        "id, title, project_id, priority, status, due_date, notes, source, external_id, external_list_id, external_meta, synced_at, created_at, updated_at, projects(name)"
      )
      .in("status", ["open", "in_progress", "stuck", "review"])
      .order("created_at", { ascending: false })
      .limit(25),
    supabase.from("projects").select("id, name, sort_order, created_at").order("sort_order"),
    supabase
      .from("content_entries")
      .select("id, title, category, tags, updated_at")
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "in_progress"),
    supabase
      .from("finance_transactions")
      .select("id", { count: "exact", head: true })
      .eq("needs_categorization", true),
  ]);

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

  return NextResponse.json({
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
    financeUncategorizedCount: financeUncategorizedRes.count || 0,
  });
}
