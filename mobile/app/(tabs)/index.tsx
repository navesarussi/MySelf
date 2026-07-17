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
import { displayTitle } from "@/lib/timeline-display";
import { formatEventWhen } from "@/lib/timeline-layout";
import { whatsappUrl } from "@/lib/integrations/phone";
import type { ContentEntry, Goal, Relationship, Task } from "@/lib/types";

function StatCard({
  title,
  main,
  sub,
  onPress,
}: {
  title: string;
  main: string;
  sub: string;
  onPress: () => void;
}) {
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  return (
    <Pressable onPress={onPress} style={{ flex: 1, minWidth: 100 }}>
      <Card style={{ padding: 10 }}>
        <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>{title}</Text>
        <Text style={{ color: c.ink, fontSize: 16, fontWeight: "700", textAlign: textStart, writingDirection, marginTop: 2 }}>
          {main}
        </Text>
        <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection, marginTop: 2 }}>
          {sub}
        </Text>
      </Card>
    </Pressable>
  );
}

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
  const activeStreaks = uniqueHabits.filter(
    (h) => effectiveStreak(h, habitReportDay(h.report_time)) > 0
  ).length;
  const checkedToday = uniqueHabits.filter(
    (h) => h.last_checked_on === habitReportDay(h.report_time)
  ).length;
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
    <Screen title={t("nav.brand")} refreshing={loading} onRefresh={refresh}>
      <Card>
        <Text style={{ color: c.accent, fontSize: tokens.textSm, fontWeight: "600", textAlign: textStart, writingDirection }}>
          {t("home.compass")}
        </Text>
        <Text style={{ color: c.ink, fontSize: 15, lineHeight: 24, textAlign: textStart, writingDirection, marginTop: 6 }}>
          &quot;{t("home.quote")}&quot;
        </Text>
        <Text style={{ color: c.muted, fontSize: tokens.textSm, lineHeight: 20, textAlign: textStart, writingDirection, marginTop: 6 }}>
          {t("home.mission")}
        </Text>
      </Card>

      {error ? <ErrorNote message={error} onRetry={refresh} /> : null}
      {loading && !data ? <Loading /> : null}

      {data ? (
        <>
          <Row wrap>
            <StatCard
              title={t("home.activeHabits")}
              main={String(uniqueHabits.length)}
              sub={t("home.checkedToday", {
                checked: checkedToday,
                total: uniqueHabits.length,
                streaks: activeStreaks,
              })}
              onPress={() => router.push("/habits")}
            />
            <StatCard
              title={t("home.relationshipsOverdue")}
              main={String(dueRelationships.length)}
              sub={
                dueRelationships.length
                  ? t("home.relationshipsNeedAttention", { count: dueRelationships.length })
                  : t("home.allRelationshipsUpToDate")
              }
              onPress={() => router.push("/relationships")}
            />
            <StatCard
              title={t("home.activeGoals")}
              main={String(data.activeGoals.length)}
              sub={t("home.goalsAchieved", { count: data.doneGoalsCount })}
              onPress={() => router.push("/goals")}
            />
            <StatCard
              title={t("home.openTasks")}
              main={String(data.openTasksCount + data.inProgressTasksCount)}
              sub={t("home.tasksInProgress", { count: data.inProgressTasksCount })}
              onPress={() => router.push("/tasks")}
            />
            <StatCard
              title={t("home.habitsPendingToday")}
              main={String(habitsPendingCount)}
              sub={t("home.habitsPendingSub")}
              onPress={() => router.push("/habits")}
            />
            <StatCard
              title={t("home.tasksDueSoon")}
              main={String(dueSoonTasks)}
              sub={t("home.tasksDueSoonSub")}
              onPress={() => router.push("/tasks")}
            />
            <StatCard
              title={t("home.bestActiveStreak")}
              main={String(bestStreak)}
              sub={t("home.bestActiveStreakSub")}
              onPress={() => router.push("/habits")}
            />
            <StatCard
              title={t("home.readyGoals")}
              main={String(readyGoals)}
              sub={t("home.readyGoalsSub")}
              onPress={() => router.push("/goals")}
            />
          </Row>

          <SectionTitle>{t("home.habitTracking")}</SectionTitle>
          {uniqueHabits.length === 0 ? (
            <Card>
              <Text style={{ color: c.muted, textAlign: textStart, writingDirection }}>{t("home.noHabits")}</Text>
            </Card>
          ) : habitsPendingToday.length === 0 ? (
            <Card>
              <Text style={{ color: c.muted, textAlign: textStart, writingDirection }}>
                {t("home.allHabitsReportedToday")}
              </Text>
              <Link href="/habits" style={{ color: c.accent, textAlign: textStart, writingDirection, marginTop: 8 }}>
                {t("home.allHabits")}
              </Link>
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
          {habitsPendingToday.length > 0 && checkedToday > 0 ? (
            <Link href="/habits" style={{ color: c.accent, textAlign: textStart, writingDirection, marginBottom: 8 }}>
              {t("home.allHabits")}
            </Link>
          ) : null}
          {uniqueHabits.some((h) => (h.failure_count ?? 0) > 0) ? (
            <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection, marginBottom: 8 }}>
              {t("common.totalFailures")}:{" "}
              {uniqueHabits.reduce((s, h) => s + (h.failure_count ?? 0), 0)}
            </Text>
          ) : null}

          <SectionTitle>{t("home.nearbyGoals")}</SectionTitle>
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

          <SectionTitle>{t("home.tasksSection")}</SectionTitle>
          {data.openTasks.length === 0 ? (
            <Card>
              <Text style={{ color: c.muted, textAlign: textStart, writingDirection }}>{t("home.noOpenTasks")}</Text>
            </Card>
          ) : (
            data.openTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onToggleDone={toggleTaskDone}
                onAdvanceStatus={advanceTaskStatus}
              />
            ))
          )}

          <SectionTitle>{t("home.relationshipsWaiting")}</SectionTitle>
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

          <SectionTitle>
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

          <SectionTitle>{t("home.librarySection")}</SectionTitle>
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
