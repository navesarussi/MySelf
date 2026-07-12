import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";
import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { Badge } from "@/components/ui";
import { dedupeHabits, effectiveStreak, selectHomeHabits, todayISO } from "@/lib/habit-stats";
import { HomeHabitRow } from "@/app/habits/home-habit-row";
import { rankGoalsForHome, horizonLabel, achievabilityScore } from "@/lib/goals-rank";
import { formatEventWhen } from "@/lib/timeline-layout";
import { formatLocaleDate, getTranslations } from "@/lib/i18n";
import type { Habit, Goal, Commitment, Relationship, TimelineEvent, Task } from "@/lib/types";
import {
  Compass,
  Clock,
  Target,
  Flame,
  AlertCircle,
  CheckSquare,
  Percent,
  MessageCircle,
} from "lucide-react";
import { whatsappUrl } from "@/lib/integrations/phone";

export const revalidate = 30;

export default async function HomePage() {
  const { t, locale } = await getTranslations();
  const configured = dbConfigured();

  let habits: Habit[] = [];
  let activeGoals: Goal[] = [];
  let doneGoalsCount = 0;
  let pendingCommitments: Commitment[] = [];
  let overdueRelationships: Relationship[] = [];
  let recentEvents: TimelineEvent[] = [];
  let openTasksCount = 0;
  let inProgressTasksCount = 0;

  if (configured) {
    const supabase = getSupabase();
    const [habitsRes, goalsRes, doneGoalsRes, commitmentsRes, relRes, eventsRes, tasksRes] =
      await Promise.all([
        supabase.from("habits").select("*").eq("archived", false),
        supabase.from("goals").select("*").eq("status", "active"),
        supabase.from("goals").select("id", { count: "exact", head: true }).eq("status", "done"),
        supabase
          .from("commitments")
          .select("id, text, commitment_date")
          .eq("status", "pending")
          .order("commitment_date", { ascending: false })
          .limit(5),
        supabase.from("relationships").select("id, name, last_contact_date, reminder_days, phone"),
        supabase.from("timeline_events").select("*").order("event_date", { ascending: false }).limit(5),
        supabase.from("tasks").select("id, status"),
      ]);

    habits = (habitsRes.data as Habit[]) || [];
    activeGoals = (goalsRes.data as Goal[]) || [];
    doneGoalsCount = doneGoalsRes.count || 0;
    pendingCommitments = (commitmentsRes.data as Commitment[]) || [];
    recentEvents = (eventsRes.data as TimelineEvent[]) || [];

    const tasks = (tasksRes.data as Pick<Task, "status">[]) || [];
    openTasksCount = tasks.filter((task) => task.status === "open").length;
    inProgressTasksCount = tasks.filter((task) => task.status === "in_progress").length;

    const today = new Date();
    overdueRelationships = ((relRes.data as Relationship[]) || []).filter((r) => {
      if (r.reminder_days == null) return false;
      const days = r.last_contact_date
        ? differenceInCalendarDays(today, new Date(r.last_contact_date))
        : Infinity;
      return days >= r.reminder_days;
    });
  }

  const today = todayISO();
  const uniqueHabits = dedupeHabits(habits, today);
  const homeHabits = selectHomeHabits(habits, today);
  const activeStreaks = uniqueHabits.filter((h) => effectiveStreak(h, today) > 0).length;
  const checkedToday = uniqueHabits.filter((h) => h.last_checked_on === today).length;
  const todayRate = uniqueHabits.length ? Math.round((checkedToday / uniqueHabits.length) * 100) : 0;
  const featuredGoals = rankGoalsForHome(activeGoals, 5, locale);
  const activeGoalsCount = activeGoals.length;

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
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card p-3">
              <div className="flex items-center gap-2 text-sm text-muted">
                <Flame size={15} className="text-accent2" /> {t("home.activeHabits")}
              </div>
              <p className="mt-2 text-3xl font-bold">{uniqueHabits.length}</p>
              <p className="mt-1 text-xs text-muted">
                {t("home.checkedToday", { checked: checkedToday, total: uniqueHabits.length, streaks: activeStreaks })}
              </p>
            </div>
            <div className="card p-3">
              <div className="flex items-center gap-2 text-sm text-muted">
                <Percent size={15} className="text-good" /> {t("home.todayPerformance")}
              </div>
              <p className="mt-2 text-3xl font-bold">{todayRate}%</p>
              <p className="mt-1 text-xs text-muted">
                {t("home.habitsChecked", { checked: checkedToday, total: uniqueHabits.length })}
              </p>
            </div>
            <div className="card p-3">
              <div className="flex items-center gap-2 text-sm text-muted">
                <Target size={15} className="text-accent" /> {t("home.activeGoals")}
              </div>
              <p className="mt-2 text-3xl font-bold">{activeGoalsCount}</p>
              <p className="mt-1 text-xs text-muted">{t("home.goalsAchieved", { count: doneGoalsCount })}</p>
            </div>
            <div className="card p-3">
              <div className="flex items-center gap-2 text-sm text-muted">
                <CheckSquare size={15} className="text-accent" /> {t("home.openTasks")}
              </div>
              <p className="mt-2 text-3xl font-bold">{openTasksCount + inProgressTasksCount}</p>
              <p className="mt-1 text-xs text-muted">{t("home.tasksInProgress", { count: inProgressTasksCount })}</p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="card p-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Flame size={16} className="text-accent2" /> {t("home.habitTracking")}
                </h3>
                <Link href="/habits" className="text-xs text-accent hover:underline">
                  {t("home.allHabits")}
                </Link>
              </div>
              {homeHabits.length === 0 ? (
                <p className="text-sm text-muted">{t("home.noHabits")}</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {homeHabits.map((h) => (
                    <HomeHabitRow key={h.id} habit={h} today={today} />
                  ))}
                </ul>
              )}
              {uniqueHabits.length > homeHabits.length && (
                <p className="mt-2 text-xs text-muted">
                  {t("home.moreHabits", { count: uniqueHabits.length - homeHabits.length })}
                </p>
              )}
              {uniqueHabits.some((h) => (h.failure_count ?? 0) > 0) && (
                <p className="mt-3 text-xs text-muted">
                  {t("common.totalFailures")}: {uniqueHabits.reduce((s, h) => s + (h.failure_count ?? 0), 0)}
                </p>
              )}
            </div>

            <div className="card p-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Target size={16} className="text-accent" /> {t("home.nearbyGoals")}
                </h3>
                <Link href="/goals" className="text-xs text-accent hover:underline">
                  {t("home.fullList")}
                </Link>
              </div>
              {featuredGoals.length === 0 ? (
                <p className="text-sm text-muted">{t("home.noActiveGoals")}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {featuredGoals.map((g) => (
                    <li key={g.id} className="rounded-lg bg-border/20 px-2.5 py-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{g.title}</span>
                        {achievabilityScore(g) >= 3 && <Badge tone="good">{t("common.readyToAct")}</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
                        {g.category && <span>{g.category}</span>}
                        {horizonLabel(g, locale) && <span>· {horizonLabel(g, locale)}</span>}
                      </div>
                      {g.first_step && (
                        <p className="mt-1 text-xs text-muted">
                          {t("common.firstStep")}: {g.first_step}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {pendingCommitments.length > 0 && (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="mb-2 text-xs font-medium text-muted">{t("home.pendingCommitments")}</p>
                  <ul className="space-y-1 text-sm">
                    {pendingCommitments.map((c) => (
                      <li key={c.id} className="flex justify-between gap-2">
                        <span className="truncate">{c.text}</span>
                        <span className="shrink-0 text-muted">
                          {formatLocaleDate(locale, c.commitment_date)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="card p-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-semibold">
                  <AlertCircle size={16} className="text-warn" /> {t("home.relationshipsWaiting")}
                </h3>
                <Link href="/relationships" className="text-xs text-accent hover:underline">
                  {t("home.manageRelationships")}
                </Link>
              </div>
              {overdueRelationships.length === 0 ? (
                <p className="text-sm text-muted">{t("home.noOverdueRelationships")}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {overdueRelationships.map((r) => {
                    const wa = r.phone ? whatsappUrl(r.phone) : null;
                    return (
                      <li key={r.id} className="flex items-center justify-between gap-2">
                        <span>{r.name}</span>
                        {wa && (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex shrink-0 items-center gap-1 text-xs text-good hover:underline"
                          >
                            <MessageCircle size={12} /> {t("common.whatsapp")}
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="card p-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Clock size={16} className="text-accent" /> {t("home.recentEvents")}
                </h3>
                <Link href="/timeline" className="text-xs text-accent hover:underline">
                  {t("home.toTimeline")}
                </Link>
              </div>
              {recentEvents.length === 0 ? (
                <p className="text-sm text-muted">{t("home.noEvents")}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {recentEvents.map((e) => (
                    <li key={e.id} className="flex justify-between gap-2">
                      <span className="truncate">{e.title}</span>
                      <span className="shrink-0 text-muted">{formatEventWhen(e, locale)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
