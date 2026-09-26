import React, { useMemo, useState } from "react";
import { api, type HomePayload } from "../../src/api/resources";
import { todayLocalISO, useMinuteNow, useTodayDate } from "../../src/hooks";
import { useHabitActions } from "../../src/hooks/use-habit-actions";
import { useI18n } from "../../src/i18n";
import { useApiQuery, useApiMutation, queryKeys, queryClient, patchTaskInHome, patchRelationshipInHome, useTradingEquity } from "../../src/query";
import { ErrorNote, HomeScreenSkeleton, Screen } from "../../src/components/ui";
import { ScreenErrorBoundary, WidgetErrorBoundary } from "../../src/components/error-boundary";
import { HabitDetailsModal } from "../../src/components/habit-details-modal";
import { HabitEditModal } from "../../src/components/habit-edit-modal";
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
  filterOverdueHabits,
  isAwaitingReport,
  sortHabitsByReportUrgency,
  todayISO,
} from "@/lib/habit-stats";
import { achievabilityScore, rankGoalsForHome } from "@/lib/goals-rank";
import { filterDueRelationships } from "@/lib/relationships-due";
import { topPriorityTasks } from "@/lib/task-priority";
import { homeHeroCount } from "@/lib/home-kpis";
import { resolveHomeTradingTile } from "@/lib/home-trading-tile";
import type { ContentEntry, Goal, Habit, Relationship, Task } from "@/lib/types";

export default function HomeScreen() {
  const { t, locale } = useI18n();
  const { data, loading, isFetching, error, refresh } = useApiQuery(queryKeys.home, api.home, {
    staleTime: 0,
    refetchOnMount: "always",
  });
  const tradingEquity = useTradingEquity();
  const { run, isPending } = useApiMutation();
  const {
    handleCheckIn: habitCheckIn,
    handleReportFall: habitReportFall,
    handleReset: habitReset,
    handleBackfill: habitBackfill,
    handleSave: habitSave,
    handleDelete: habitDelete,
    isPending: habitBusy,
  } = useHabitActions();
  const [goalForm, setGoalForm] = useState<Goal | null>(null);
  const [libraryForm, setLibraryForm] = useState<Pick<ContentEntry, "id" | "title" | "category" | "tags"> | null>(null);
  const [viewingHabitId, setViewingHabitId] = useState<string | null>(null);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const today = todayISO();
  const todayDate = useTodayDate();
  const habitNow = useMinuteNow();
  const uniqueHabits = useMemo(() => dedupeHabits(data?.habits ?? [], today), [data?.habits, today]);
  const habitsPendingToday = useMemo(
    () =>
      sortHabitsByReportUrgency(uniqueHabits, habitNow).filter((h) =>
        isAwaitingReport(h, habitNow),
      ),
    [uniqueHabits, habitNow],
  );
  const habitsOverdueToday = useMemo(() => filterOverdueHabits(uniqueHabits), [uniqueHabits]);
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
  const viewingHabit = useMemo(
    () => (viewingHabitId ? uniqueHabits.find((h) => h.id === viewingHabitId) ?? null : null),
    [uniqueHabits, viewingHabitId]
  );
  const tradingTile = useMemo(
    () => resolveHomeTradingTile(tradingEquity.data, data?.trading),
    [tradingEquity.data, data?.trading]
  );

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
    <ScreenErrorBoundary name="home">
    <Screen
      title={t("home.compass")}
      subtitle={t("home.quote")}
      refreshing={isFetching}
      onRefresh={() => {
        void tradingEquity.refresh();
        void refresh();
      }}
    >
      {error && !data ? <ErrorNote message={error} onRetry={refresh} /> : null}
      {loading && !data ? <HomeScreenSkeleton /> : null}
      {data ? (
        <>
          <WidgetErrorBoundary name="home-hero">
            <HomeHero count={heroCount} />
          </WidgetErrorBoundary>
          <WidgetErrorBoundary name="home-kpis">
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
              tradingEquity: tradingTile?.equity ?? null,
              tradingStartingEquity: tradingTile?.starting_equity ?? null,
              tradingKill: Boolean(tradingTile?.kill_switch_active),
            }}
          />
          </WidgetErrorBoundary>
          <WidgetErrorBoundary name="home-habits">
          <HomeHabitsFeed
            uniqueCount={uniqueHabits.length}
            pending={habitsPendingToday}
            failureTotal={uniqueHabits.reduce((s, h) => s + (h.failure_count ?? 0), 0)}
            busy={(id) => isPending(id) || habitBusy(id)}
            onOpenHabit={(h) => setViewingHabitId(h.id)}
            onCheckIn={habitCheckIn}
            onReportFall={habitReportFall}
            onReset={habitReset}
          />
          </WidgetErrorBoundary>
          <WidgetErrorBoundary name="home-lists">
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
          </WidgetErrorBoundary>
        </>
      ) : null}
      <HomeGoalModal goal={goalForm} onClose={() => setGoalForm(null)} onSaved={refresh} />
      <HomeLibraryModal entry={libraryForm} onClose={() => setLibraryForm(null)} onSaved={refresh} />
      <HabitDetailsModal
        habit={viewingHabit}
        visible={viewingHabit !== null}
        onClose={() => setViewingHabitId(null)}
        onEdit={(h) => {
          setViewingHabitId(null);
          setEditingHabit(h);
        }}
        onCheckIn={habitCheckIn}
        onReportFall={habitReportFall}
        onBackfill={habitBackfill}
        busy={viewingHabit ? habitBusy(viewingHabit.id) : false}
      />
      <HabitEditModal
        habit={editingHabit}
        visible={editingHabit !== null}
        onClose={() => setEditingHabit(null)}
        onSave={async (fields) => {
          if (!editingHabit) return;
          const h = editingHabit;
          setEditingHabit(null);
          await habitSave(h, fields);
        }}
        onDelete={async () => {
          if (!editingHabit) return;
          const h = editingHabit;
          setEditingHabit(null);
          setViewingHabitId(null);
          await habitDelete(h);
        }}
        saving={editingHabit ? habitBusy(editingHabit.id) : false}
      />
    </Screen>
    </ScreenErrorBoundary>
  );
}
