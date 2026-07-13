import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";
import {
  Clock,
  Target,
  Flame,
  AlertCircle,
  CheckSquare,
  Users,
  FolderKanban,
  BookOpen,
} from "lucide-react";
import { HomePanel } from "@/components/home-panel";
import { Badge } from "@/components/ui";
import { HabitCard } from "@/app/habits/habit-card";
import { HomeRelationshipRow } from "@/app/home/home-relationship-row";
import { HomeTaskRow } from "@/app/home/home-task-row";
import { HomeGoalRow } from "@/app/home/home-goal-row";
import { rankGoalsForHome } from "@/lib/goals-rank";
import { habitReportDay } from "@/lib/habit-stats";
import { SHOW_PROJECTS } from "@/lib/features";
import { formatEventWhen } from "@/lib/timeline-layout";
import { formatLocaleDate, type Locale, type Translator } from "@/lib/i18n";
import type {
  Habit,
  Goal,
  Commitment,
  Relationship,
  TimelineEvent,
  Task,
  Project,
  ContentEntry,
} from "@/lib/types";

type HomeDashboardProps = {
  t: Translator;
  locale: Locale;
  today: string;
  todayDate: Date;
  uniqueHabits: Habit[];
  allHabits: Habit[];
  activeStreaks: number;
  checkedToday: number;
  activeGoals: Goal[];
  doneGoalsCount: number;
  pendingCommitments: Commitment[];
  relationships: Relationship[];
  overdueRelationships: Relationship[];
  recentEvents: TimelineEvent[];
  openTasks: Task[];
  projects: Project[];
  projectTaskCounts: Record<string, number>;
  projectRelCounts: Record<string, number>;
  libraryEntries: ContentEntry[];
  openTasksCount: number;
  inProgressTasksCount: number;
};

function sortRelationships(relationships: Relationship[], today: Date): Relationship[] {
  return [...relationships].sort((a, b) => {
    const overdueScore = (r: Relationship) => {
      if (r.reminder_days == null) return 0;
      const days = r.last_contact_date
        ? differenceInCalendarDays(today, new Date(r.last_contact_date))
        : Infinity;
      return days >= r.reminder_days ? 1 : 0;
    };
    const diff = overdueScore(b) - overdueScore(a);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name, "he");
  });
}

export function HomeDashboard({
  t,
  locale,
  today,
  todayDate,
  uniqueHabits,
  allHabits,
  activeStreaks,
  checkedToday,
  activeGoals,
  doneGoalsCount,
  pendingCommitments,
  relationships,
  overdueRelationships,
  recentEvents,
  openTasks,
  projects,
  projectTaskCounts,
  projectRelCounts,
  libraryEntries,
  openTasksCount,
  inProgressTasksCount,
}: HomeDashboardProps) {
  const rankedGoals = rankGoalsForHome(activeGoals, activeGoals.length, locale);
  const sortedRelationships = sortRelationships(relationships, todayDate);
  const activeGoalsCount = activeGoals.length;

  return (
    <>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/habits" className="card p-3 transition hover:border-accent/60">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Flame size={15} className="text-accent2" /> {t("home.activeHabits")}
          </div>
          <p className="mt-2 text-3xl font-bold">{uniqueHabits.length}</p>
          <p className="mt-1 text-xs text-muted">
            {t("home.checkedToday", {
              checked: checkedToday,
              total: uniqueHabits.length,
              streaks: activeStreaks,
            })}
          </p>
        </Link>
        <Link href="/relationships" className="card p-3 transition hover:border-accent/60">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Users size={15} className="text-warn" /> {t("home.relationshipsOverdue")}
          </div>
          <p className="mt-2 text-3xl font-bold">{overdueRelationships.length}</p>
          <p className="mt-1 text-xs text-muted">
            {overdueRelationships.length > 0
              ? t("home.relationshipsNeedAttention", { count: overdueRelationships.length })
              : t("home.allRelationshipsUpToDate")}
          </p>
        </Link>
        <Link href="/goals" className="card p-3 transition hover:border-accent/60">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Target size={15} className="text-accent" /> {t("home.activeGoals")}
          </div>
          <p className="mt-2 text-3xl font-bold">{activeGoalsCount}</p>
          <p className="mt-1 text-xs text-muted">{t("home.goalsAchieved", { count: doneGoalsCount })}</p>
        </Link>
        <Link href="/tasks" className="card p-3 transition hover:border-accent/60">
          <div className="flex items-center gap-2 text-sm text-muted">
            <CheckSquare size={15} className="text-accent" /> {t("home.openTasks")}
          </div>
          <p className="mt-2 text-3xl font-bold">{openTasksCount + inProgressTasksCount}</p>
          <p className="mt-1 text-xs text-muted">
            {t("home.tasksInProgress", { count: inProgressTasksCount })}
          </p>
        </Link>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <HomePanel
          title={t("home.habitTracking")}
          icon={<Flame size={16} className="text-accent2" />}
          href="/habits"
          linkLabel={t("home.allHabits")}
        >
          {allHabits.length === 0 ? (
            <p className="text-sm text-muted">{t("home.noHabits")}</p>
          ) : (
            <ul className="space-y-2 pe-1 text-sm">
              {allHabits.map((h) => (
                <li key={h.id}>
                  <HabitCard habit={h} today={habitReportDay(h.report_time)} />
                </li>
              ))}
            </ul>
          )}
          {uniqueHabits.some((h) => (h.failure_count ?? 0) > 0) && (
            <p className="mt-3 text-xs text-muted">
              {t("common.totalFailures")}:{" "}
              {uniqueHabits.reduce((s, h) => s + (h.failure_count ?? 0), 0)}
            </p>
          )}
        </HomePanel>

        <HomePanel
          title={t("home.nearbyGoals")}
          icon={<Target size={16} className="text-accent" />}
          href="/goals"
          linkLabel={t("home.fullList")}
        >
          {rankedGoals.length === 0 ? (
            <p className="text-sm text-muted">{t("home.noActiveGoals")}</p>
          ) : (
            <ul className="space-y-2 pe-1 text-sm">
              {rankedGoals.map((g) => (
                <HomeGoalRow key={g.id} goal={g} locale={locale} />
              ))}
            </ul>
          )}
          {pendingCommitments.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-2 text-xs font-medium text-muted">{t("home.pendingCommitments")}</p>
              <ul className="space-y-1 text-sm">
                {pendingCommitments.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate">{c.text}</span>
                    <span className="shrink-0 text-muted">
                      {formatLocaleDate(locale, c.commitment_date)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </HomePanel>

        <HomePanel
          title={t("home.tasksSection")}
          icon={<CheckSquare size={16} className="text-accent" />}
          href="/tasks"
          linkLabel={t("home.toTasks")}
        >
          {openTasks.length === 0 ? (
            <p className="text-sm text-muted">{t("home.noOpenTasks")}</p>
          ) : (
            <ul className="space-y-2 pe-1 text-sm">
              {openTasks.map((task) => (
                <HomeTaskRow key={task.id} task={task} />
              ))}
            </ul>
          )}
        </HomePanel>

        {SHOW_PROJECTS && (
          <HomePanel
            title={t("home.projectsSection")}
            icon={<FolderKanban size={16} className="text-accent" />}
            href="/projects"
            linkLabel={t("home.toProjects")}
          >
            {projects.length === 0 ? (
              <p className="text-sm text-muted">{t("home.noProjects")}</p>
            ) : (
              <ul className="space-y-2 pe-1 text-sm">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/projects?project=${p.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg bg-border/20 px-2.5 py-1.5 hover:bg-border/35"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {t("home.projectCounts", {
                          tasks: projectTaskCounts[p.id] ?? 0,
                          rels: projectRelCounts[p.id] ?? 0,
                        })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </HomePanel>
        )}

        <HomePanel
          title={t("home.relationshipsWaiting")}
          icon={<AlertCircle size={16} className="text-warn" />}
          href="/relationships"
          linkLabel={t("home.manageRelationships")}
        >
          {sortedRelationships.length === 0 ? (
            <p className="text-sm text-muted">{t("home.noRelationships")}</p>
          ) : (
            <ul className="space-y-2 pe-1 text-sm">
              {sortedRelationships.map((r) => (
                <HomeRelationshipRow key={r.id} relationship={r} today={todayDate} />
              ))}
            </ul>
          )}
        </HomePanel>

        <HomePanel
          title={t("home.recentEvents")}
          icon={<Clock size={16} className="text-accent" />}
          href="/timeline"
          linkLabel={t("home.toTimeline")}
        >
          {recentEvents.length === 0 ? (
            <p className="text-sm text-muted">{t("home.noEvents")}</p>
          ) : (
            <ul className="space-y-1 pe-1 text-sm">
              {recentEvents.map((e) => (
                <li key={e.id} className="flex justify-between gap-2 rounded-lg bg-border/20 px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 truncate">{e.title}</span>
                  <span className="shrink-0 text-muted">{formatEventWhen(e, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </HomePanel>

        <HomePanel
          title={t("home.librarySection")}
          icon={<BookOpen size={16} className="text-accent" />}
          href="/library"
          linkLabel={t("home.toLibrary")}
          maxHeight="max-h-64"
        >
          {libraryEntries.length === 0 ? (
            <p className="text-sm text-muted">{t("home.noLibraryEntries")}</p>
          ) : (
            <ul className="space-y-2 pe-1 text-sm">
              {libraryEntries.map((entry) => (
                <li key={entry.id} className="rounded-lg bg-border/20 px-2.5 py-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 break-words font-medium">{entry.title}</span>
                    <span className="shrink-0">
                      <Badge>{entry.category}</Badge>
                    </span>
                  </div>
                  {entry.body && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{entry.body}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </HomePanel>
      </div>
    </>
  );
}
