import React from "react";
import { Text, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { differenceInCalendarDays } from "date-fns";
import { api } from "../../src/api/resources";
import { useApi, useMutate, todayLocalISO } from "../../src/hooks";
import { useI18n } from "../../src/i18n";
import { useColors, tokens } from "../../src/theme";
import { Badge, Btn, Card, Chip, ErrorNote, Loading, Row, Screen, SectionTitle } from "../../src/components/ui";
import {
  dedupeHabits,
  effectiveStreak,
  habitReportDay,
  selectHomeHabits,
  todayISO,
} from "@/lib/habit-stats";
import { displayTitle } from "@/lib/timeline-display";
import type { Habit } from "@/lib/types";

function StatCard({ title, main, sub }: { title: string; main: string; sub: string }) {
  const c = useColors();
  return (
    <Card style={{ flex: 1, minWidth: 150 }}>
      <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: "right" }}>{title}</Text>
      <Text style={{ color: c.ink, fontSize: 20, fontWeight: "700", textAlign: "right", marginTop: 2 }}>
        {main}
      </Text>
      <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: "right", marginTop: 2 }}>
        {sub}
      </Text>
    </Card>
  );
}

export default function HomeScreen() {
  const c = useColors();
  const { t, locale } = useI18n();
  const router = useRouter();
  const { data, loading, error, refresh } = useApi(api.home);
  const { run } = useMutate();

  const today = todayISO();
  const todayDate = new Date();

  const habits = data?.habits ?? [];
  const uniqueHabits = dedupeHabits(habits, today);
  const homeHabits = selectHomeHabits(habits, today, 4);
  const activeStreaks = uniqueHabits.filter(
    (h) => effectiveStreak(h, habitReportDay(h.report_time)) > 0
  ).length;
  const checkedToday = uniqueHabits.filter(
    (h) => h.last_checked_on === habitReportDay(h.report_time)
  ).length;

  const overdue = (data?.relationships ?? []).filter((r) => {
    if (r.reminder_days == null) return false;
    const days = r.last_contact_date
      ? differenceInCalendarDays(todayDate, new Date(r.last_contact_date))
      : Infinity;
    return days >= r.reminder_days;
  });

  async function checkIn(habit: Habit) {
    await run((config) => api.reportHabit(config, habit.id, "check_in"));
    refresh();
  }

  return (
    <Screen title={t("nav.brand")} refreshing={loading} onRefresh={refresh}>
      <Card>
        <Text style={{ color: c.accent, fontSize: tokens.textSm, fontWeight: "600", textAlign: "right" }}>
          {t("home.compass")}
        </Text>
        <Text style={{ color: c.ink, fontSize: 15, lineHeight: 24, textAlign: "right", marginTop: 6 }}>
          &quot;{t("home.quote")}&quot;
        </Text>
        <Text style={{ color: c.muted, fontSize: tokens.textSm, lineHeight: 20, textAlign: "right", marginTop: 6 }}>
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
            />
            <StatCard
              title={t("home.relationshipsOverdue")}
              main={String(overdue.length)}
              sub={
                overdue.length
                  ? t("home.relationshipsNeedAttention", { count: overdue.length })
                  : t("home.allRelationshipsUpToDate")
              }
            />
          </Row>
          <Row wrap>
            <StatCard
              title={t("home.activeGoals")}
              main={String(data.activeGoals.length)}
              sub={t("home.goalsAchieved", { count: data.doneGoalsCount })}
            />
            <StatCard
              title={t("home.openTasks")}
              main={String(data.openTasksCount)}
              sub={t("home.tasksInProgress", { count: data.inProgressTasksCount })}
            />
          </Row>

          <SectionTitle>{t("mobile.quickAdd")}</SectionTitle>
          <Row wrap>
            <Chip label={`+ ${t("addMenu.task")}`} active={false} onPress={() => router.push("/tasks?add=1")} />
            <Chip label={`+ ${t("addMenu.habit")}`} active={false} onPress={() => router.push("/habits?add=1")} />
            <Chip label={`+ ${t("addMenu.contact")}`} active={false} onPress={() => router.push("/relationships?add=1")} />
            <Chip label={`+ ${t("addMenu.goal")}`} active={false} onPress={() => router.push("/goals?add=goal")} />
            <Chip label={`+ ${t("addMenu.commitment")}`} active={false} onPress={() => router.push("/goals?add=commitment")} />
            <Chip label={`+ ${t("addMenu.event")}`} active={false} onPress={() => router.push("/timeline?add=event")} />
            <Chip label={`+ ${t("addMenu.period")}`} active={false} onPress={() => router.push("/timeline?add=period")} />
            <Chip label={`+ ${t("addMenu.entry")}`} active={false} onPress={() => router.push("/library?add=1")} />
          </Row>

          <SectionTitle>{t("home.habitTracking")}</SectionTitle>
          {homeHabits.length === 0 ? (
            <Card>
              <Text style={{ color: c.muted, textAlign: "right" }}>{t("home.noHabits")}</Text>
            </Card>
          ) : (
            homeHabits.map((h) => {
              const day = habitReportDay(h.report_time);
              const checked = h.last_checked_on === day;
              return (
                <Card key={h.id}>
                  <Row>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.ink, fontWeight: "600", textAlign: "right" }}>{h.name}</Text>
                      <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: "right", marginTop: 2 }}>
                        {t("common.streak")}: {effectiveStreak(h, day)} · {t("common.peak")}: {h.best_streak}
                      </Text>
                    </View>
                    {checked ? (
                      <Badge label={t("habits.checkedToday")} tone="good" />
                    ) : (
                      <Btn small label={t("habits.checkInToday")} onPress={() => checkIn(h)} />
                    )}
                  </Row>
                </Card>
              );
            })
          )}

          <SectionTitle>{t("home.pendingCommitments")}</SectionTitle>
          {data.pendingCommitments.length === 0 ? (
            <Card>
              <Text style={{ color: c.muted, textAlign: "right" }}>{t("goals.noCommitments")}</Text>
            </Card>
          ) : (
            data.pendingCommitments.slice(0, 4).map((cm) => (
              <Card key={cm.id}>
                <Row>
                  <Text style={{ color: c.ink, flex: 1, textAlign: "right" }}>{cm.text}</Text>
                  <Btn
                    small
                    label={t("common.done")}
                    onPress={async () => {
                      await run((config) => api.setCommitmentStatus(config, cm.id, "done"));
                      refresh();
                    }}
                  />
                </Row>
              </Card>
            ))
          )}

          <SectionTitle>{t("home.relationshipsWaiting")}</SectionTitle>
          {overdue.length === 0 ? (
            <Card>
              <Text style={{ color: c.muted, textAlign: "right" }}>{t("home.noOverdueRelationships")}</Text>
            </Card>
          ) : (
            overdue.slice(0, 4).map((r) => {
              const days = r.last_contact_date
                ? differenceInCalendarDays(todayDate, new Date(r.last_contact_date))
                : null;
              return (
                <Card key={r.id}>
                  <Row>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.ink, fontWeight: "600", textAlign: "right" }}>{r.name}</Text>
                      <Text style={{ color: c.warn, fontSize: tokens.textXs, textAlign: "right", marginTop: 2 }}>
                        {days === null
                          ? t("relationships.noContactLogged")
                          : t("relationships.lastContactDays", { days })}
                      </Text>
                    </View>
                    <Btn
                      small
                      label={t("relationships.contactedToday")}
                      onPress={async () => {
                        await run((config) =>
                          api.updateRelationship(config, r.id, { last_contact_date: todayLocalISO() })
                        );
                        refresh();
                      }}
                    />
                  </Row>
                </Card>
              );
            })
          )}

          <SectionTitle>{t("home.tasksSection")}</SectionTitle>
          {data.openTasks.length === 0 ? (
            <Card>
              <Text style={{ color: c.muted, textAlign: "right" }}>{t("home.noOpenTasks")}</Text>
            </Card>
          ) : (
            data.openTasks.slice(0, 5).map((task) => (
              <Card key={task.id}>
                <Row>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.ink, textAlign: "right" }}>{task.title}</Text>
                    {task.project_name ? (
                      <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: "right", marginTop: 2 }}>
                        {task.project_name}
                      </Text>
                    ) : null}
                  </View>
                  <Badge
                    label={task.status === "in_progress" ? t("common.inProgress") : t("common.open")}
                    tone={task.status === "in_progress" ? "accent" : "default"}
                  />
                </Row>
              </Card>
            ))
          )}

          <SectionTitle>{t("home.recentEvents")}</SectionTitle>
          {data.recentEvents.length === 0 ? (
            <Card>
              <Text style={{ color: c.muted, textAlign: "right" }}>{t("home.noEvents")}</Text>
            </Card>
          ) : (
            data.recentEvents.slice(0, 5).map((ev) => (
              <Card key={ev.id}>
                <Row>
                  <Text style={{ color: c.ink, flex: 1, textAlign: "right" }}>{displayTitle(ev)}</Text>
                  <Text style={{ color: c.muted, fontSize: tokens.textXs }}>
                    {new Date(ev.event_date).toLocaleDateString(locale === "he" ? "he-IL" : "en-US")}
                  </Text>
                </Row>
              </Card>
            ))
          )}

          <View style={{ marginTop: 16 }}>
            <Link href="/timeline" style={{ color: c.accent, textAlign: "right", padding: 6 }}>
              {t("home.toTimeline")}
            </Link>
            <Link href="/goals" style={{ color: c.accent, textAlign: "right", padding: 6 }}>
              {t("home.fullList")}
            </Link>
            <Link href="/library" style={{ color: c.accent, textAlign: "right", padding: 6 }}>
              {t("home.toLibrary")}
            </Link>
          </View>
        </>
      ) : null}
    </Screen>
  );
}
