import React, { useMemo, useState } from "react";
import { api, type HomePayload } from "../../src/api/resources";
import { todayLocalISO } from "../../src/hooks";
import { useI18n } from "../../src/i18n";
import { useApiQuery, useApiMutation, queryKeys, queryClient, patchTaskInHome, patchHabitInHome, patchRelationshipInHome } from "../../src/query";
import { ErrorNote, Loading, Screen } from "../../src/components/ui";
import { HomeHero } from "../../src/components/home/home-hero";
import { HomeKpiSection } from "../../src/components/home/home-kpi-section";
import { HomeHabitsFeed } from "../../src/components/home/home-habits-feed";
import { HomeListsFeed } from "../../src/components/home/home-lists-feed";
import { HomeGoalModal } from "../../src/components/home-goal-modal";
import { HomeLibraryModal } from "../../src/components/home-library-modal";
import { NEXT_STATUS } from "../../src/components/task-card";
import {
  dedupeHabits,
  effectiveStreak,
  habitReportDay,
  isAwaitingReport,
  isReportDue,
  sortHabitsByReportUrgency,
  todayISO,
} from "@/lib/habit-stats";
import { achievabilityScore, rankGoalsForHome } from "@/lib/goals-rank";
import { filterDueRelationships } from "@/lib/relationships-due";
import { topPriorityTasks } from "@/lib/task-priority";
import { homeHeroCount } from "@/lib/home-kpis";
import type { ContentEntry, Goal, Relationship, Task } from "@/lib/types";

export default function HomeScreen() {
  const { t, locale } = useI18n();
  const { data, loading, error, refresh } = useApiQuery(queryKeys.home, api.home);
  const { run, isPending } = useApiMutation();
  const [goalForm, setGoalForm] = useState<Goal | null>(null);
  const [libraryForm, setLibraryForm] = useState<Pick<ContentEntry, "id" | "title" | "category" | "tags"> | null>(null);
  const today = todayISO();
  const todayDate = new Date();
  const uniqueHabits = useMemo(() => dedupeHabits(data?.habits ?? [], today), [data?.habits, today]);
  const habitsPendingToday = useMemo(
    () => sortHabitsByReportUrgency(uniqueHabits).filter((h) => isAwaitingReport(h)),
    [uniqueHabits]
  );
  const habitsOverdueToday = useMemo(() => uniqueHabits.filter((h) => isReportDue(h)), [uniqueHabits]);
  const dueRelationships = useMemo(
    () => filterDueRelationships((data?.relationships ?? []) as Relationship[], todayDate),
    [data?.relationships, todayDate]
  );
  const rankedGoals = useMemo(() => rankGoalsForHome(data?.activeGoals ?? [], 5, locale), [data?.activeGoals, locale]);
  const dueSoonTasks = (data?.openTasks ?? []).filter((task) => {
    if (!task.due_date) return false;
    const due = new Date(task.due_date);
    const horizon = new Date(todayDate);
    horizon.setDate(horizon.getDate() + 7);
    return due <= horizon;
  }).length;
  const bestStreak = uniqueHabits.reduce((m, h) => Math.max(m, effectiveStreak(h, habitReportDay(h.report_time))), 0);
  const topTasks = useMemo(() => topPriorityTasks(data?.openTasks ?? [], 10), [data?.openTasks]);
  const heroCount = homeHeroCount({
    habitsOverdue: habitsOverdueToday.length,
    dueRelationships: dueRelationships.length,
    tasksDueSoon: dueSoonTasks,
    financeUncategorized: data?.financeUncategorizedCount ?? 0,
  });

  async function patchTask(task: Task, next: Task["status"]) {
    const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);
    queryClient.setQueryData<HomePayload>(queryKeys.home, (old) => patchTaskInHome(old, task.id, { status: next }));
    await run((config) => api.updateTask(config, task.id, { status: next }), {
      itemId: task.id,
      flash: { success: "flash.taskUpdated", when: "immediate" },
      onError: () => {
        if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.tasksAll });
      },
    });
  }

  return (
    <Screen title={t("home.compass")} subtitle={t("home.quote")} refreshing={loading} onRefresh={refresh}>
      {error ? <ErrorNote message={error} onRetry={refresh} /> : null}
      {loading && !data ? <Loading /> : null}
      {data ? (
        <>
          <HomeHero count={heroCount} />
          <HomeKpiSection
            input={{
              habitsCount: uniqueHabits.length,
              dueRelationships: dueRelationships.length,
              activeGoals: data.activeGoals.length,
              openTasks: data.openTasksCount + data.inProgressTasksCount,
              habitsPending: habitsPendingToday.length,
              habitsOverdue: habitsOverdueToday.length,
              tasksDueSoon: dueSoonTasks,
              doneTasks: data.doneTasksCount,
              avgTaskCloseDays: data.avgTaskCloseDays,
              bestStreak,
              readyGoals: data.activeGoals.filter((g) => achievabilityScore(g) >= 3).length,
              financeUncategorized: data.financeUncategorizedCount,
              financeNet: data.finance?.net_actual ?? 0,
              // /api/v1/home carries live equity now, computed with the same
              // formula the dashboard uses, so the home screen no longer pulls
              // the whole trading dashboard to read three scalars.
              tradingEquity: data.trading?.equity ?? null,
              tradingStartingEquity: data.trading?.starting_equity ?? null,
              tradingKill: Boolean(data.trading?.kill_switch_active),
            }}
          />
          <HomeHabitsFeed
            uniqueCount={uniqueHabits.length}
            pending={habitsPendingToday}
            failureTotal={uniqueHabits.reduce((s, h) => s + (h.failure_count ?? 0), 0)}
            busy={isPending}
            onBackfill={async (h, date, type) => {
              const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);
              await run((config) => api.reportHabit(config, h.id, type, { for_date: date }), {
                itemId: h.id,
                flash: { success: type === "check_in" ? "flash.checkInRecorded" : "flash.fallRecorded" },
                onError: () => {
                  if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
                },
                onSuccess: (updated) => {
                  if (updated) {
                    queryClient.setQueryData<HomePayload>(queryKeys.home, (old) => patchHabitInHome(old, h.id, updated));
                  }
                  queryClient.invalidateQueries({ queryKey: queryKeys.habits });
                  queryClient.invalidateQueries({ queryKey: queryKeys.home });
                },
              });
            }}
            onCheckIn={async (h) => {
              const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);
              const todayStr = habitReportDay(h.report_time);
              queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
                patchHabitInHome(old, h.id, { last_checked_on: todayStr, streak_count: (h.streak_count ?? 0) + 1 })
              );
              await run((config) => api.reportHabit(config, h.id, "check_in"), {
                itemId: h.id,
                flash: { success: "flash.checkInRecorded" },
                onError: () => {
                  if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
                },
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: queryKeys.habits });
                },
              });
            }}
            onReportFall={async (h) => {
              const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);
              queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
                patchHabitInHome(old, h.id, { streak_count: 0, failure_count: (h.failure_count ?? 0) + 1 })
              );
              await run((config) => api.reportHabit(config, h.id, "fall"), {
                itemId: h.id,
                flash: { success: "flash.fallRecorded" },
                onError: () => {
                  if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
                },
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: queryKeys.habits });
                },
              });
            }}
            onReset={async (h) => {
              const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);
              queryClient.setQueryData<HomePayload>(queryKeys.home, (old) => patchHabitInHome(old, h.id, { streak_count: 0 }));
              await run((config) => api.reportHabit(config, h.id, "reset"), {
                itemId: h.id,
                flash: { success: "flash.streakReset" },
                onError: () => {
                  if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
                },
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: queryKeys.habits });
                },
              });
            }}
          />
          <HomeListsFeed
            rankedGoals={rankedGoals}
            pendingCommitments={data.pendingCommitments}
            topTasks={topTasks}
            dueRelationships={dueRelationships}
            todayDate={todayDate}
            eventsMode={data.eventsMode}
            recentEvents={data.recentEvents}
            libraryEntries={data.libraryEntries}
            busy={isPending}
            onOpenGoal={setGoalForm}
            onOpenLibrary={setLibraryForm}
            onToggleTask={(task) => void patchTask(task, task.status === "done" ? "open" : "done")}
            onAdvanceTask={(task) => void patchTask(task, NEXT_STATUS[task.status])}
            onCommitmentDone={async (id) => {
              const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);
              queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
                old ? { ...old, pendingCommitments: old.pendingCommitments.filter((c) => c.id !== id) } : undefined
              );
              await run((config) => api.setCommitmentStatus(config, id, "done"), {
                itemId: id,
                flash: { success: "flash.commitmentUpdated" },
                onError: () => {
                  if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
                },
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: queryKeys.commitments });
                },
              });
            }}
            onContactedToday={async (r) => {
              const todayISOStr = todayLocalISO();
              const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);
              queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
                patchRelationshipInHome(old, r.id, { last_contact_date: todayISOStr })
              );
              await run((config) => api.updateRelationship(config, r.id, { last_contact_date: todayISOStr }), {
                itemId: r.id,
                flash: { success: "flash.contactUpdated" },
                onError: () => {
                  if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
                },
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: queryKeys.relationships });
                },
              });
            }}
          />
        </>
      ) : null}
      <HomeGoalModal goal={goalForm} onClose={() => setGoalForm(null)} onSaved={refresh} />
      <HomeLibraryModal entry={libraryForm} onClose={() => setLibraryForm(null)} onSaved={refresh} />
    </Screen>
  );
}
