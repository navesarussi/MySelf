import React, { useMemo, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { differenceInCalendarDays } from "date-fns";
import { api } from "../../src/api/resources";
import { useApi, useMutate, todayLocalISO } from "../../src/hooks";
import { useI18n } from "../../src/i18n";
import { useLayoutDir } from "../../src/layout-dir";
import { useColors, tokens } from "../../src/theme";
import { Badge, Btn, Card, ErrorNote, Loading, Row, Screen, SectionTitle } from "../../src/components/ui";
import { HomeStatsGrid, type HomeStatItem } from "../../src/components/home-stats-grid";
import { NEXT_STATUS, TaskCard } from "../../src/components/task-card";
import { HabitCard } from "../../src/components/habit-card";
import { HomeGoalModal } from "../../src/components/home-goal-modal";
import { HomeLibraryModal } from "../../src/components/home-library-modal";
import {
  dedupeHabits,
  effectiveStreak,
  habitReportDay,
  sortHabitsByReportUrgency,
  todayISO,
} from "@/lib/habit-stats";
import { achievabilityScore, horizonLabel, rankGoalsForHome } from "@/lib/goals-rank";
import { filterDueRelationships } from "@/lib/relationships-due";
import { topPriorityTasks } from "@/lib/task-priority";
import { displayTitle } from "@/lib/timeline-display";
import { formatEventWhen } from "@/lib/timeline-layout";
import { whatsappUrl } from "@/lib/integrations/phone";
import type { ContentEntry, Goal, Relationship, Task } from "@/lib/types";

export default function HomeScreen() {
  const c = useColors();
  const { t, locale } = useI18n();
  const { textStart, writingDirection } = useLayoutDir();
  const router = useRouter();
  const { data, loading, error, refresh } = useApi(api.home);
  const { run } = useMutate();
  const [goalForm, setGoalForm] = useState<Goal | null>(null);
  const [libraryForm, setLibraryForm] = useState<Pick<ContentEntry, "id" | "title" | "category" | "tags" | "body"> | null>(null);

  const today = todayISO();
  const todayDate = new Date();

  const habits = data?.habits ?? [];
  const uniqueHabits = dedupeHabits(habits, today);
  const habitsPendingToday = useMemo(
    () =>
      sortHabitsByReportUrgency(uniqueHabits).filter(
        (h) => h.last_checked_on !== habitReportDay(h.report_time)
      ),
    [uniqueHabits]
  );

  const relationships = data?.relationships ?? [];
  const dueRelationships = useMemo(
    () => filterDueRelationships(relationships as Relationship[], todayDate),
    [relationships, todayDate]
  );

  const rankedGoals = useMemo(
    () => rankGoalsForHome(data?.activeGoals ?? [], 5, locale),
    [data?.activeGoals, locale]
  );

  const habitsPendingCount = habitsPendingToday.length;
  const dueSoonTasks = (data?.openTasks ?? []).filter((task) => {
    if (!task.due_date) return false;
    const due = new Date(task.due_date);
    const horizon = new Date(todayDate);
    horizon.setDate(horizon.getDate() + 7);
    return due <= horizon;
  }).length;
  const bestStreak = uniqueHabits.reduce(
    (m, h) => Math.max(m, effectiveStreak(h, habitReportDay(h.report_time))),
    0
  );
  const readyGoals = (data?.activeGoals ?? []).filter((g) => achievabilityScore(g) >= 3).length;

  const topTasks = useMemo(
    () => topPriorityTasks(data?.openTasks ?? [], 10),
    [data?.openTasks]
  );

  const statItems = useMemo((): HomeStatItem[] => {
    if (!data) return [];
    return [
      {
        id: "habits",
        title: t("home.activeHabits"),
        main: String(uniqueHabits.length),
        icon: "repeat",
        accent: c.accent2,
        onPress: () => router.push("/habits"),
      },
      {
        id: "relationships",
        title: t("home.relationshipsOverdue"),
        main: String(dueRelationships.length),
        icon: "people-outline",
        accent: dueRelationships.length > 0 ? c.warn : c.good,
        onPress: () => router.push("/relationships"),
      },
      {
        id: "goals",
        title: t("home.activeGoals"),
        main: String(data.activeGoals.length),
        icon: "flag-outline",
        accent: c.accent,
        onPress: () => router.push("/goals"),
      },
      {
        id: "tasks",
        title: t("home.openTasks"),
        main: String(data.openTasksCount + data.inProgressTasksCount),
        icon: "checkbox-outline",
        accent: c.accent,
        onPress: () => router.push("/tasks"),
      },
      {
        id: "habits-pending",
        title: t("home.habitsPendingToday"),
        main: String(habitsPendingCount),
        icon: "time-outline",
        accent: habitsPendingCount > 0 ? c.warn : c.good,
        onPress: () => router.push("/habits"),
      },
      {
        id: "tasks-due",
        title: t("home.tasksDueSoon"),
        main: String(dueSoonTasks),
        icon: "calendar-outline",
        accent: dueSoonTasks > 0 ? c.warn : c.muted,
        onPress: () => router.push("/tasks"),
      },
      {
        id: "streak",
        title: t("home.bestActiveStreak"),
        main: String(bestStreak),
        icon: "flame-outline",
        accent: c.accent2,
        onPress: () => router.push("/habits"),
      },
      {
        id: "ready-goals",
        title: t("home.readyGoals"),
        main: String(readyGoals),
        icon: "rocket-outline",
        accent: c.good,
        onPress: () => router.push("/goals"),
      },
    ];
  }, [
    data,
    t,
    c,
    router,
    uniqueHabits.length,
    dueRelationships.length,
    habitsPendingCount,
    dueSoonTasks,
    bestStreak,
    readyGoals,
  ]);

  async function toggleTaskDone(task: Task) {
    await run(
      (config) => api.updateTask(config, task.id, { status: task.status === "done" ? "open" : "done" }),
      { success: "flash.taskUpdated" }
    );
    refresh();
  }

  async function advanceTaskStatus(task: Task) {
    await run((config) => api.updateTask(config, task.id, { status: NEXT_STATUS[task.status] }), {
      success: "flash.taskUpdated",
    });
    refresh();
  }

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <Card>
        <Text
          style={{
            color: c.ink,
            fontSize: 18,
            fontWeight: "700",
            lineHeight: 28,
            textAlign: textStart,
            writingDirection,
          }}
        >
          {t("home.quote")}
        </Text>
        <Text style={{ color: c.muted, fontSize: tokens.textSm, lineHeight: 20, textAlign: textStart, writingDirection, marginTop: 8 }}>
          {t("home.mission")}
        </Text>
      </Card>

      {error ? <ErrorNote message={error} onRetry={refresh} /> : null}
      {loading && !data ? <Loading /> : null}

      {data ? (
        <>
          <HomeStatsGrid items={statItems} />

          <SectionTitle onPress={() => router.push("/habits")}>{t("home.habitTracking")}</SectionTitle>
          {uniqueHabits.length === 0 ? (
            <Card>
              <Text style={{ color: c.muted, textAlign: textStart, writingDirection }}>{t("home.noHabits")}</Text>
            </Card>
          ) : habitsPendingToday.length === 0 ? (
            <Card>
              <Text style={{ color: c.muted, textAlign: textStart, writingDirection }}>
                {t("home.allHabitsReportedToday")}
              </Text>
            </Card>
          ) : (
            habitsPendingToday.map((h) => (
              <HabitCard
                key={h.id}
                habit={h}
                onCheckIn={async () => {
                  await run((config) => api.reportHabit(config, h.id, "check_in"), { success: "flash.checkInRecorded" });
                  refresh();
                }}
                onReportFall={async () => {
                  await run((config) => api.reportHabit(config, h.id, "fall"), { success: "flash.fallRecorded" });
                  refresh();
                }}
                onReset={async () => {
                  await run((config) => api.reportHabit(config, h.id, "reset"), { success: "flash.streakReset" });
                  refresh();
                }}
                onSave={async (fields) => {
                  await run(
                    (config) =>
                      api.updateHabit(config, h.id, {
                        name: fields.name,
                        kind: fields.kind,
                        target_note: fields.target_note || null,
                        report_time: fields.report_time || null,
                        streak_count: Number(fields.streak_count) || 0,
                        best_streak: Number(fields.best_streak) || 0,
                        total_success_days: Number(fields.total_success_days) || 0,
                        failure_count: Number(fields.failure_count) || 0,
                        last_checked_on: fields.last_checked_on || null,
                      }),
                    { success: "flash.habitUpdated" }
                  );
                  refresh();
                }}
                onDelete={async () => {
                  await run((config) => api.deleteHabit(config, h.id), { success: "flash.habitDeleted" });
                  refresh();
                }}
              />
            ))
          )}
          {uniqueHabits.some((h) => (h.failure_count ?? 0) > 0) ? (
            <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection, marginBottom: 8 }}>
              {t("common.totalFailures")}:{" "}
              {uniqueHabits.reduce((s, h) => s + (h.failure_count ?? 0), 0)}
            </Text>
          ) : null}

          <SectionTitle onPress={() => router.push("/goals")}>{t("home.nearbyGoals")}</SectionTitle>
          {rankedGoals.length === 0 ? (
            <Card>
              <Text style={{ color: c.muted, textAlign: textStart, writingDirection }}>{t("home.noActiveGoals")}</Text>
            </Card>
          ) : (
            rankedGoals.map((g) => (
              <Pressable key={g.id} onPress={() => setGoalForm(g)}>
                <Card>
                  <Row>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.ink, fontWeight: "600", textAlign: textStart, writingDirection }}>{g.title}</Text>
                      <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection, marginTop: 2 }}>
                        {[g.category, horizonLabel(g, locale)].filter(Boolean).join(" · ")}
                      </Text>
                      {g.first_step ? (
                        <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection, marginTop: 2 }}>
                          {t("common.firstStep")}: {g.first_step}
                        </Text>
                      ) : null}
                    </View>
                    {achievabilityScore(g) >= 3 ? <Badge label={t("common.readyToAct")} tone="good" /> : null}
                  </Row>
                </Card>
              </Pressable>
            ))
          )}
          {data.pendingCommitments.length > 0 ? (
            <Card>
              <Text style={{ color: c.muted, fontSize: tokens.textXs, fontWeight: "600", textAlign: textStart, writingDirection, marginBottom: 6 }}>
                {t("home.pendingCommitments")}
              </Text>
              {data.pendingCommitments.map((cm) => (
                <Row key={cm.id} style={{ marginBottom: 4 }}>
                  <Text style={{ color: c.ink, flex: 1, textAlign: textStart, writingDirection }}>{cm.text}</Text>
                  <Btn
                    small
                    label={t("common.done")}
                    onPress={async () => {
                      await run((config) => api.setCommitmentStatus(config, cm.id, "done"), {
                        success: "flash.commitmentUpdated",
                      });
                      refresh();
                    }}
                  />
                </Row>
              ))}
            </Card>
          ) : null}

          <SectionTitle onPress={() => router.push("/tasks")}>{t("home.tasksSection")}</SectionTitle>
          {topTasks.length === 0 ? (
            <Card>
              <Text style={{ color: c.muted, textAlign: textStart, writingDirection }}>{t("home.noOpenTasks")}</Text>
            </Card>
          ) : (
            topTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onToggleDone={toggleTaskDone}
                onAdvanceStatus={advanceTaskStatus}
              />
            ))
          )}

          <SectionTitle onPress={() => router.push("/relationships")}>{t("home.relationshipsWaiting")}</SectionTitle>
          {dueRelationships.length === 0 ? (
            <Card>
              <Text style={{ color: c.muted, textAlign: textStart, writingDirection }}>{t("home.noDueRelationships")}</Text>
            </Card>
          ) : (
            dueRelationships.map((r) => {
              const days = r.last_contact_date
                ? differenceInCalendarDays(todayDate, new Date(r.last_contact_date))
                : null;
              const wa = r.phone ? whatsappUrl(r.phone) : null;
              return (
                <Card key={r.id}>
                  <Row>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.ink, fontWeight: "600", textAlign: textStart, writingDirection }}>{r.name}</Text>
                      <Text
                        style={{
                          color: c.warn,
                          fontSize: tokens.textXs,
                          textAlign: textStart,
                          writingDirection,
                          marginTop: 2,
                        }}
                      >
                        {days === null
                          ? t("relationships.noContactLogged")
                          : t("relationships.lastContactDays", { days })}
                      </Text>
                    </View>
                    <View style={{ gap: 4 }}>
                      {wa ? (
                        <Btn small label={t("common.openWhatsapp")} onPress={() => Linking.openURL(wa)} />
                      ) : null}
                      <Btn
                        small
                        label={t("relationships.contactedToday")}
                        onPress={async () => {
                          await run(
                            (config) =>
                              api.updateRelationship(config, r.id, { last_contact_date: todayLocalISO() }),
                            { success: "flash.contactUpdated" }
                          );
                          refresh();
                        }}
                      />
                    </View>
                  </Row>
                </Card>
              );
            })
          )}

          <SectionTitle onPress={() => router.push("/timeline")}>
            {data.eventsMode === "upcoming" ? t("home.upcomingEvents") : t("home.recentEvents")}
          </SectionTitle>
          {data.recentEvents.length === 0 ? (
            <Card>
              <Text style={{ color: c.muted, textAlign: textStart, writingDirection }}>{t("home.noEvents")}</Text>
            </Card>
          ) : (
            data.recentEvents.map((ev) => (
              <Card key={ev.id}>
                <Row>
                  <Text style={{ color: c.ink, flex: 1, textAlign: textStart, writingDirection }}>{displayTitle(ev)}</Text>
                  <Text style={{ color: c.muted, fontSize: tokens.textXs }}>
                    {formatEventWhen(ev, locale)}
                  </Text>
                </Row>
              </Card>
            ))
          )}

          <SectionTitle onPress={() => router.push("/library")}>{t("home.librarySection")}</SectionTitle>
          {data.libraryEntries.length === 0 ? (
            <Card>
              <Text style={{ color: c.muted, textAlign: textStart, writingDirection }}>{t("home.noLibraryEntries")}</Text>
            </Card>
          ) : (
            data.libraryEntries.slice(0, 8).map((entry) => (
              <Pressable key={entry.id} onPress={() => setLibraryForm(entry)}>
                <Card>
                  <Row>
                    <Text style={{ color: c.ink, fontWeight: "600", flex: 1, textAlign: textStart, writingDirection }}>
                      {entry.title}
                    </Text>
                    <Badge label={entry.category} />
                  </Row>
                </Card>
              </Pressable>
            ))
          )}

          <View style={{ marginTop: 16 }}>
            <Link href="/timeline" style={{ color: c.accent, textAlign: textStart, writingDirection, padding: 6 }}>
              {t("home.toTimeline")}
            </Link>
            <Link href="/goals" style={{ color: c.accent, textAlign: textStart, writingDirection, padding: 6 }}>
              {t("home.fullList")}
            </Link>
            <Link href="/library" style={{ color: c.accent, textAlign: textStart, writingDirection, padding: 6 }}>
              {t("home.toLibrary")}
            </Link>
          </View>
        </>
      ) : null}

      <HomeGoalModal goal={goalForm} onClose={() => setGoalForm(null)} onSaved={refresh} />
      <HomeLibraryModal entry={libraryForm} onClose={() => setLibraryForm(null)} onSaved={refresh} />
    </Screen>
  );
}
