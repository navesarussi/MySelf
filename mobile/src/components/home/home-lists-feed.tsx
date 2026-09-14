import React from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { differenceInCalendarDays } from "date-fns";
import { achievabilityScore, horizonLabel } from "@/lib/goals-rank";
import { displayTitle } from "@/lib/timeline-display";
import { formatEventWhen } from "@/lib/timeline-layout";
import { whatsappUrl } from "@/lib/integrations/phone";
import { TaskCard } from "../task-card";
import { Badge, Btn, Card, Row, SectionTitle } from "../ui";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import type { Commitment, ContentEntry, Goal, Relationship, Task, TimelineEvent } from "@/lib/types";

export function HomeListsFeed({
  rankedGoals,
  pendingCommitments,
  topTasks,
  dueRelationships,
  todayDate,
  eventsMode,
  recentEvents,
  libraryEntries,
  busy,
  onOpenGoal,
  onOpenLibrary,
  onToggleTask,
  onAdvanceTask,
  onCommitmentDone,
  onContactedToday,
}: {
  rankedGoals: Goal[];
  pendingCommitments: Commitment[];
  topTasks: Task[];
  dueRelationships: Relationship[];
  todayDate: Date;
  eventsMode: "upcoming" | "recent";
  recentEvents: TimelineEvent[];
  libraryEntries: Pick<ContentEntry, "id" | "title" | "category" | "tags">[];
  busy: (id: string) => boolean;
  onOpenGoal: (goal: Goal) => void;
  onOpenLibrary: (entry: Pick<ContentEntry, "id" | "title" | "category" | "tags">) => void;
  onToggleTask: (task: Task) => void;
  onAdvanceTask: (task: Task) => void;
  onCommitmentDone: (id: string) => void;
  onContactedToday: (r: Relationship) => void;
}) {
  const { t, locale } = useI18n();
  const c = useColors();
  const { textStart, writingDirection, textLtr } = useLayoutDir();
  const router = useRouter();

  return (
    <>
      <SectionTitle onPress={() => router.push("/goals")}>{t("home.nearbyGoals")}</SectionTitle>
      {rankedGoals.length === 0 ? (
        <Card>
          <Text style={{ color: c.muted, textAlign: textStart, writingDirection }}>{t("home.noActiveGoals")}</Text>
        </Card>
      ) : (
        rankedGoals.map((g) => (
          <Pressable key={g.id} onPress={() => onOpenGoal(g)} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? tokens.press : 1 })}>
            <Card>
              <Row>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.ink, fontWeight: "600", textAlign: textStart, writingDirection }}>{g.title}</Text>
                  <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection, marginTop: 2 }}>
                    {[g.category, horizonLabel(g, locale)].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                {achievabilityScore(g) >= 3 ? <Badge label={t("common.readyToAct")} tone="good" /> : null}
              </Row>
            </Card>
          </Pressable>
        ))
      )}
      {pendingCommitments.length > 0 ? (
        <Card>
          <Text style={{ color: c.muted, fontSize: tokens.textXs, fontWeight: "600", textAlign: textStart, writingDirection, marginBottom: 6 }}>
            {t("home.pendingCommitments")}
          </Text>
          {pendingCommitments.map((cm) => (
            <Row key={cm.id} style={{ marginBottom: 4 }}>
              <Text style={{ color: c.ink, flex: 1, textAlign: textStart, writingDirection }}>{cm.text}</Text>
              <Btn small label={t("common.done")} disabled={busy(cm.id)} onPress={() => onCommitmentDone(cm.id)} />
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
            busy={busy(task.id)}
            onToggleDone={onToggleTask}
            onAdvanceStatus={onAdvanceTask}
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
          const days = r.last_contact_date ? differenceInCalendarDays(todayDate, new Date(r.last_contact_date)) : null;
          const wa = r.phone ? whatsappUrl(r.phone) : null;
          return (
            <Card key={r.id}>
              <Row>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.ink, fontWeight: "600", textAlign: textStart, writingDirection }}>{r.name}</Text>
                  <Text style={{ color: c.warn, fontSize: tokens.textXs, textAlign: textStart, writingDirection, marginTop: 2 }}>
                    {days === null ? t("relationships.noContactLogged") : t("relationships.lastContactDays", { days })}
                  </Text>
                </View>
                <View style={{ gap: 4 }}>
                  <Btn small label={t("relationships.contactedToday")} disabled={busy(r.id)} onPress={() => onContactedToday(r)} />
                  {wa ? <Btn small variant="ghost" label={t("common.whatsapp")} onPress={() => Linking.openURL(wa)} /> : null}
                </View>
              </Row>
            </Card>
          );
        })
      )}

      <SectionTitle onPress={() => router.push("/timeline")}>
        {eventsMode === "upcoming" ? t("home.upcomingEvents") : t("home.recentEvents")}
      </SectionTitle>
      {recentEvents.length === 0 ? (
        <Card>
          <Text style={{ color: c.muted, textAlign: textStart, writingDirection }}>{t("home.noEvents")}</Text>
        </Card>
      ) : (
        recentEvents.map((ev) => (
          <Card key={ev.id}>
            <Row>
              <Text style={{ color: c.ink, flex: 1, textAlign: textStart, writingDirection }}>{displayTitle(ev)}</Text>
              <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textLtr, writingDirection: "ltr" }}>{formatEventWhen(ev, locale)}</Text>
            </Row>
          </Card>
        ))
      )}

      <SectionTitle onPress={() => router.push("/library")}>{t("home.librarySection")}</SectionTitle>
      {libraryEntries.length === 0 ? (
        <Card>
          <Text style={{ color: c.muted, textAlign: textStart, writingDirection }}>{t("home.noLibraryEntries")}</Text>
        </Card>
      ) : (
        libraryEntries.slice(0, 8).map((entry) => (
          <Pressable key={entry.id} onPress={() => onOpenLibrary(entry)} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? tokens.press : 1 })}>
            <Card>
              <Row>
                <Text style={{ color: c.ink, fontWeight: "600", flex: 1, textAlign: textStart, writingDirection }}>{entry.title}</Text>
                <Badge label={entry.category} />
              </Row>
            </Card>
          </Pressable>
        ))
      )}
    </>
  );
}
