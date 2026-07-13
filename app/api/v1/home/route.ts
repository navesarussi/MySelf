import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isApiAuthorized, unauthorized } from "@/lib/api/auth";
import type { Task } from "@/lib/types";

type TaskRow = Task & { projects: { name: string } | null };

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
    allTasksRes,
  ] = await Promise.all([
    supabase.from("habits").select("*").eq("archived", false),
    supabase.from("goals").select("*").eq("status", "active"),
    supabase.from("goals").select("id", { count: "exact", head: true }).eq("status", "done"),
    supabase
      .from("commitments")
      .select("*")
      .eq("status", "pending")
      .order("commitment_date", { ascending: false }),
    supabase
      .from("relationships")
      .select("id, name, last_contact_date, reminder_days, phone")
      .order("name"),
    supabase
      .from("timeline_events")
      .select("*")
      .order("event_date", { ascending: false })
      .limit(30),
    supabase
      .from("tasks")
      .select("*, projects(name)")
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false }),
    supabase.from("projects").select("*").order("sort_order"),
    supabase
      .from("content_entries")
      .select("id, title, category, tags, updated_at")
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase.from("tasks").select("id, status"),
  ]);

  const openTasks = ((tasksRes.data as TaskRow[]) || []).map((row) => ({
    ...row,
    project_name: row.projects?.name,
    projects: undefined,
  }));
  const allTasks = (allTasksRes.data as Pick<Task, "status">[]) || [];

  return NextResponse.json({
    habits: habitsRes.data || [],
    activeGoals: goalsRes.data || [],
    doneGoalsCount: doneGoalsRes.count || 0,
    pendingCommitments: commitmentsRes.data || [],
    relationships: relRes.data || [],
    recentEvents: eventsRes.data || [],
    openTasks,
    projects: projectsRes.data || [],
    libraryEntries: libraryRes.data || [],
    openTasksCount: allTasks.filter((t) => t.status === "open").length,
    inProgressTasksCount: allTasks.filter((t) => t.status === "in_progress").length,
  });
}
