import { differenceInCalendarDays } from "date-fns";
import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { dedupeHabits, effectiveStreak, habitReportDay, selectHomeHabits, todayISO } from "@/lib/habit-stats";
import { getTranslations } from "@/lib/i18n";
import type { Habit, Goal, Commitment, Relationship, TimelineEvent, Task, Project, ContentEntry } from "@/lib/types";
import { HomeDashboard } from "@/app/legacy/home/dashboard";
import { Compass } from "lucide-react";

export const revalidate = 30;

type TaskRow = Task & { projects: { name: string } | null };

function filterOverdueRelationships(relationships: Relationship[], today: Date): Relationship[] {
  return relationships.filter((r) => {
    if (r.reminder_days == null) return false;
    const days = r.last_contact_date
      ? differenceInCalendarDays(today, new Date(r.last_contact_date))
      : Infinity;
    return days >= r.reminder_days;
  });
}

export default async function HomePage() {
  const { t, locale } = await getTranslations();
  const configured = dbConfigured();

  let habits: Habit[] = [];
  let activeGoals: Goal[] = [];
  let doneGoalsCount = 0;
  let pendingCommitments: Commitment[] = [];
  let relationships: Relationship[] = [];
  let recentEvents: TimelineEvent[] = [];
  let openTasks: Task[] = [];
  let projects: Project[] = [];
  let libraryEntries: ContentEntry[] = [];
  let openTasksCount = 0;
  let inProgressTasksCount = 0;
  const projectTaskCounts: Record<string, number> = {};
  const projectRelCounts: Record<string, number> = {};

  if (configured) {
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
      openTaskCountsRes,
      relCountsRes,
    ] = await Promise.all([
      supabase.from("habits").select("*").eq("archived", false),
      supabase.from("goals").select("*").eq("status", "active"),
      supabase.from("goals").select("id", { count: "exact", head: true }).eq("status", "done"),
      supabase
        .from("commitments")
        .select("id, text, commitment_date")
        .eq("status", "pending")
        .order("commitment_date", { ascending: false }),
      supabase.from("relationships").select("id, name, last_contact_date, reminder_days, phone").order("name"),
      supabase.from("timeline_events").select("*").order("event_date", { ascending: false }),
      supabase
        .from("tasks")
        .select("*, projects(name)")
        .in("status", ["open", "in_progress"])
        .order("created_at", { ascending: false }),
      supabase.from("projects").select("*").order("sort_order"),
      supabase
        .from("content_entries")
        .select("id, title, category, body, tags, created_at, updated_at")
        .order("updated_at", { ascending: false }),
      supabase.from("tasks").select("id, status"),
      supabase.from("tasks").select("project_id").neq("status", "done"),
      supabase.from("relationships").select("project_id"),
    ]);

    habits = (habitsRes.data as Habit[]) || [];
    activeGoals = (goalsRes.data as Goal[]) || [];
    doneGoalsCount = doneGoalsRes.count || 0;
    pendingCommitments = (commitmentsRes.data as Commitment[]) || [];
    relationships = (relRes.data as Relationship[]) || [];
    recentEvents = (eventsRes.data as TimelineEvent[]) || [];
    libraryEntries = (libraryRes.data as ContentEntry[]) || [];
    projects = (projectsRes.data as Project[]) || [];

    openTasks = ((tasksRes.data as TaskRow[]) || []).map((row) => ({
      ...row,
      project_name: row.projects?.name,
      projects: undefined,
    }));

    const tasks = (allTasksRes.data as Pick<Task, "status">[]) || [];
    openTasksCount = tasks.filter((task) => task.status === "open").length;
    inProgressTasksCount = tasks.filter((task) => task.status === "in_progress").length;

    for (const p of projects) {
      projectTaskCounts[p.id] = 0;
      projectRelCounts[p.id] = 0;
    }
    for (const row of (openTaskCountsRes.data as { project_id: string }[]) || []) {
      if (row.project_id in projectTaskCounts) projectTaskCounts[row.project_id]++;
    }
    for (const row of (relCountsRes.data as { project_id: string }[]) || []) {
      if (row.project_id in projectRelCounts) projectRelCounts[row.project_id]++;
    }
  }

  const today = todayISO();
  const todayDate = new Date();
  const uniqueHabits = dedupeHabits(habits, today);
  const allHabits = selectHomeHabits(habits, today, null);
  const activeStreaks = uniqueHabits.filter(
    (h) => effectiveStreak(h, habitReportDay(h.report_time)) > 0,
  ).length;
  const checkedToday = uniqueHabits.filter(
    (h) => h.last_checked_on === habitReportDay(h.report_time),
  ).length;
  const overdueRelationships = filterOverdueRelationships(relationships, todayDate);

  return (
    <>
      <div className="card mb-6 p-4">
        <div className="flex items-center gap-2 text-accent">
          <Compass size={18} />
          <span className="text-sm font-medium">{t("home.compass")}</span>
        </div>
        <p className="mt-3 text-lg font-medium leading-relaxed">&quot;{t("home.quote")}&quot;</p>
        <p className="mt-2 text-sm text-muted leading-relaxed">{t("home.mission")}</p>
      </div>

      {!configured && (
        <div className="mb-8">
          <DbWarning />
        </div>
      )}

      {configured && (
        <HomeDashboard
          t={t}
          locale={locale}
          today={today}
          todayDate={todayDate}
          uniqueHabits={uniqueHabits}
          allHabits={allHabits}
          activeStreaks={activeStreaks}
          checkedToday={checkedToday}
          activeGoals={activeGoals}
          doneGoalsCount={doneGoalsCount}
          pendingCommitments={pendingCommitments}
          relationships={relationships}
          overdueRelationships={overdueRelationships}
          recentEvents={recentEvents}
          openTasks={openTasks}
          projects={projects}
          projectTaskCounts={projectTaskCounts}
          projectRelCounts={projectRelCounts}
          libraryEntries={libraryEntries}
          openTasksCount={openTasksCount}
          inProgressTasksCount={inProgressTasksCount}
        />
      )}
    </>
  );
}
