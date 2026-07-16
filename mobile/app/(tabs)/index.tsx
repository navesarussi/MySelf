import React, { useMemo } from "react";
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
import { dedupeHabits, effectiveStreak, habitReportDay, todayISO } from "@/lib/habit-stats";
import { achievabilityScore, horizonLabel, rankGoalsForHome } from "@/lib/goals-rank";
import { displayTitle } from "@/lib/timeline-display";
import { formatEventWhen } from "@/lib/timeline-layout";
import { whatsappUrl } from "@/lib/integrations/phone";
import type { Relationship, Task } from "@/lib/types";

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
  const { textStart } = useLayoutDir();
  return (
    <Pressable onPress={onPress} style={{ flex: 1, minWidth: 150 }}>
      <Card>
        <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart }}>{title}</Text>
        <Text style={{ color: c.ink, fontSize: 20, fontWeight: "700", textAlign: textStart, marginTop: 2 }}>
          {main}
        </Text>
        <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, marginTop: 2 }}>
          {sub}
        </Text>
      </Card>
    </Pressable>
  );
}

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

export default function HomeScreen() {
  const c = useColors();
  const { t, locale } = useI18n();
  const { textStart, textLtr } = useLayoutDir();
  const router = useRouter();
  const { data, loading, error, refresh } = useApi(api.home);
  const { run } = useMutate();

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

  const relationships = data?.relationships ?? [];
  const sortedRelationships = useMemo(
    () => sortRelationships(relationships as Relationship[], todayDate),
    [relationships, todayDate]
  );

  const overdue = sortedRelationships.filter((r) => {
    if (r.reminder_days == null) return false;
    const days = r.last_contact_date
      ? differenceInCalendarDays(todayDate, new Date(r.last_contact_date))
      : Infinity;
    return days >= r.reminder_days;
  });

  const rankedGoals = useMemo(
    () => rankGoalsForHome(data?.activeGoals ?? [], 5, locale),
    [data?.activeGoals, locale]
  );

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
        <Text style={{ color: c.accent, fontSize: tokens.textSm, fontWeight: "600", textAlign: textStart }}>
          {t("home.compass")}
        </Text>
        <Text style={{ color: c.ink, fontSize: 15, lineHeight: 24, textAlign: textStart, marginTop: 6 }}>
          &quot;{t("home.quote")}&quot;
        </Text>
        <Text style={{ color: c.muted, fontSize: tokens.textSm, lineHeight: 20, textAlign: textStart, marginTop: 6 }}>
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
              main={String(overdue.length)}
              sub={
                overdue.length
                  ? t("home.relationshipsNeedAttention", { count: overdue.length })
                  : t("home.allRelationshipsUpToDate")
              }
              onPress={() => router.push("/relationships")}
            />
          </Row>
          <Row wrap>
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
          </Row>

          <SectionTitle>{t("home.habitTracking")}</SectionTitle>
          {uniqueHabits.length === 0 ? (
            <Card>
              <Text style={{ color: c.muted, textAlign: textStart }}>{t("home.noHabits")}</Text>
            </Card>
          ) : (
            uniqueHabits.map((h) => (
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
            <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, marginBottom: 8 }}>
              {t("common.totalFailures")}:{" "}
              {uniqueHabits.reduce((s, h) => s + (h.failure_count ?? 0), 0)}
            </Text>
          ) : null}

          <SectionTitle>{t("home.nearbyGoals")}</SectionTitle>
          {rankedGoals.length === 0 ? (
            <Card>
              <Text style={{ color: c.muted, textAlign: textStart }}>{t("home.noActiveGoals")}</Text>
            </Card>
          ) : (
            rankedGoals.map((g) => (
              <Card key={g.id}>
                <Row>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.ink, fontWeight: "600", textAlign: textStart }}>{g.title}</Text>
                    <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, marginTop: 2 }}>
                      {[g.category, horizonLabel(g, locale)].filter(Boolean).join(" · ")}
                    </Text>
                    {g.first_step ? (
                      <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, marginTop: 2 }}>
                        {t("common.firstStep")}: {g.first_step}
                      </Text>
                    ) : null}
                  </View>
                  {achievabilityScore(g) >= 3 ? <Badge label={t("common.readyToAct")} tone="good" /> : null}
                </Row>
              </Card>
            ))
          )}
          {data.pendingCommitments.length > 0 ? (
            <Card>
              <Text style={{ color: c.muted, fontSize: tokens.textXs, fontWeight: "600", textAlign: textStart, marginBottom: 6 }}>
                {t("home.pendingCommitments")}
              </Text>
              {data.pendingCommitments.map((cm) => (
                <Row key={cm.id} style={{ marginBottom: 4 }}>
                  <Text style={{ color: c.ink, flex: 1, textAlign: textStart }}>{cm.text}</Text>
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
              <Text style={{ color: c.muted, textAlign: textStart }}>{t("home.noOpenTasks")}</Text>
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
          {sortedRelationships.length === 0 ? (
            <Card>
              <Text style={{ color: c.muted, textAlign: textStart }}>{t("home.noRelationships")}</Text>
            </Card>
          ) : (
            sortedRelationships.map((r) => {
              const days = r.last_contact_date
                ? differenceInCalendarDays(todayDate, new Date(r.last_contact_date))
                : null;
              const isLate =
                r.reminder_days != null && (days === null || days >= r.reminder_days);
              const wa = r.phone ? whatsappUrl(r.phone) : null;
              return (
                <Card key={r.id}>
                  <Row>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.ink, fontWeight: "600", textAlign: textStart }}>{r.name}</Text>
                      <Text
                        style={{
                          color: isLate ? c.warn : c.muted,
                          fontSize: tokens.textXs,
                          textAlign: textStart,
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

          <SectionTitle>{t("home.recentEvents")}</SectionTitle>
          {data.recentEvents.length === 0 ? (
            <Card>
              <Text style={{ color: c.muted, textAlign: textStart }}>{t("home.noEvents")}</Text>
            </Card>
          ) : (
            data.recentEvents.slice(0, 10).map((ev) => (
              <Card key={ev.id}>
                <Row>
                  <Text style={{ color: c.ink, flex: 1, textAlign: textStart }}>{displayTitle(ev)}</Text>
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
              <Text style={{ color: c.muted, textAlign: textStart }}>{t("home.noLibraryEntries")}</Text>
            </Card>
          ) : (
            data.libraryEntries.slice(0, 8).map((entry) => (
              <Card key={entry.id}>
                <Row>
                  <Text style={{ color: c.ink, fontWeight: "600", flex: 1, textAlign: textStart }}>
                    {entry.title}
                  </Text>
                  <Badge label={entry.category} />
                </Row>
              </Card>
            ))
          )}

          <View style={{ marginTop: 16 }}>
            <Link href="/timeline" style={{ color: c.accent, textAlign: textStart, padding: 6 }}>
              {t("home.toTimeline")}
            </Link>
            <Link href="/goals" style={{ color: c.accent, textAlign: textStart, padding: 6 }}>
              {t("home.fullList")}
            </Link>
            <Link href="/library" style={{ color: c.accent, textAlign: textStart, padding: 6 }}>
              {t("home.toLibrary")}
            </Link>
          </View>
        </>
      ) : null}
    </Screen>
  );
}
