import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors, tokens } from "../theme";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { Badge, Btn, Row } from "./ui";
import { StatTile } from "./habit-stat-tile";
import { effectiveStreak, habitReportDay, isReportDue, normalizeReportTime } from "@/lib/habit-stats";
import { HabitMissedReports } from "./habit-missed-reports";
import { HabitHistoryTable } from "./habit-history-table";
import { formatLocaleDate } from "@/lib/i18n/core";
import type { HabitHistoryDay } from "@/lib/habit-history";
import type { Habit } from "@/lib/types";
import { api } from "../api/resources";
import { useSession } from "../session";

export function HabitDetailsModal({
  habit,
  visible,
  onClose,
  onEdit,
  onCheckIn,
  onReportFall,
  onBackfill,
  busy,
}: {
  habit: Habit | null;
  visible: boolean;
  onClose: () => void;
  onEdit: (habit: Habit) => void;
  onCheckIn: (habit: Habit) => void;
  onReportFall: (habit: Habit) => void;
  onBackfill?: (habit: Habit, date: string, type: "check_in" | "fall") => void | Promise<void>;
  busy?: boolean;
}) {
  const c = useColors();
  const { t, locale } = useI18n();
  const { textStart, writingDirection, progressAlign } = useLayoutDir();
  const { height: windowHeight } = useWindowDimensions();
  const { token, serverUrl } = useSession();
  const [historyDays, setHistoryDays] = useState<HabitHistoryDay[]>([]);

  useEffect(() => {
    if (!visible || !habit || !token) return;
    api
      .habitHistory({ token, serverUrl }, habit.id, 35)
      .then((res) => setHistoryDays(res.grid))
      .catch(() => setHistoryDays([]));
  }, [visible, habit?.id, habit?.last_checked_on, habit?.failure_count, token, serverUrl]);

  if (!habit) return null;

  const day = habitReportDay(habit.report_time);
  const checked = habit.last_checked_on === day;
  const overdue = isReportDue(habit);
  const streak = effectiveStreak(habit, day);
  const successDays = habit.total_success_days ?? 0;
  const failures = habit.failure_count ?? 0;
  const reportTime = normalizeReportTime(habit.report_time);
  const lastReported = habit.last_reported_at
    ? new Date(habit.last_reported_at).toLocaleString(locale === "he" ? "he-IL" : "en-US", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : habit.last_checked_on
      ? new Date(habit.last_checked_on).toLocaleDateString(locale === "he" ? "he-IL" : "en-US", {
          day: "numeric", month: "short",
        })
      : null;

  const successTotal = successDays + failures;
  const successPct = successTotal > 0 ? Math.round((successDays / successTotal) * 100) : 0;
  const failurePct = 100 - successPct;
  const streakPct =
    habit.best_streak > 0 ? Math.min(100, Math.round((streak / habit.best_streak) * 100)) : 0;
  const sheetMaxHeight = Math.min(windowHeight * 0.88, 640);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#00000088" }}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: c.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderColor: c.border, borderWidth: 1, maxHeight: sheetMaxHeight, height: sheetMaxHeight }}>
          <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 999, backgroundColor: c.border, marginTop: 10, marginBottom: 4 }} />
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: tokens.padLg, paddingBottom: 28 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
            <Row style={{ justifyContent: "space-between", marginTop: 8, marginBottom: 4 }}>
              <Text style={{ color: c.ink, fontSize: 20, fontWeight: "700", flex: 1, textAlign: textStart, writingDirection }}>
                {habit.name}
              </Text>
              <Pressable onPress={onClose} hitSlop={10} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color={c.muted} />
              </Pressable>
            </Row>

            <Row wrap style={{ marginTop: 6, gap: 6 }}>
              <Badge label={habit.kind === "build" ? t("habits.build") : t("habits.quit")} tone={habit.kind === "build" ? "good" : "warn"} />
              <Text style={{ color: c.muted, fontSize: tokens.textXs }}>{t("habits.created")}: {formatLocaleDate(locale, habit.created_at)}</Text>
            </Row>

            {habit.target_note ? (
              <Text style={{ color: c.ink, fontSize: tokens.textSm, lineHeight: 22, textAlign: textStart, writingDirection, marginTop: 12 }}>
                {habit.target_note}
              </Text>
            ) : null}

            <Row wrap style={{ marginTop: 16, gap: 8 }}>
              <StatTile icon="flame" iconColor={c.accent2} label={t("common.streak")} value={streak} />
              <StatTile icon="trending-up-outline" iconColor={c.accent} label={t("common.peak")} value={habit.best_streak} />
              <StatTile icon="thumbs-up-outline" iconColor={c.good} label={t("common.positives")} value={successDays} />
              <StatTile icon="alert-circle-outline" iconColor={c.warn} label={t("common.failures")} value={failures} />
            </Row>

            <View
              style={{
                marginTop: 16,
                padding: 12,
                borderRadius: tokens.radiusSm,
                backgroundColor: c.border + "33",
                borderWidth: overdue ? 1 : 0,
                borderColor: overdue ? c.warn : "transparent",
              }}
            >
              <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
                {t("habits.lastReported")}: {lastReported ?? t("habits.neverReported")}
              </Text>
              {!checked && !overdue ? (
                <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection, marginTop: 4 }}>
                  {t("habits.reportOpensAt", { time: reportTime })}
                </Text>
              ) : null}
              {overdue ? (
                <Text style={{ color: c.warn, fontSize: tokens.textXs, fontWeight: "600", textAlign: textStart, writingDirection, marginTop: 4 }}>
                  {t("habits.reportDueNow")}
                </Text>
              ) : null}
            </View>

            {onBackfill ? <HabitMissedReports habit={habit} busy={busy} onBackfill={onBackfill} /> : null}

            <View style={{ marginTop: 18 }}>
              <Text style={{ color: c.muted, fontSize: tokens.textXs, marginBottom: 6, textAlign: textStart, writingDirection }}>
                {t("habits.historyTitle")}
              </Text>
              <HabitHistoryTable days={historyDays} />
            </View>

            {habit.best_streak > 0 ? (
              <View style={{ marginTop: 18 }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Text style={{ color: c.muted, fontSize: tokens.textXs }}>{t("habits.streakProgress")}</Text>
                  <Text style={{ color: c.ink, fontSize: tokens.textXs, fontWeight: "700" }}>{streak}/{habit.best_streak}</Text>
                </Row>
                <View style={{ height: 10, borderRadius: 999, backgroundColor: c.border + "60", overflow: "hidden", marginTop: 6 }}>
                  <View
                    style={{
                      height: "100%",
                      width: `${streakPct}%`,
                      backgroundColor: c.accent2,
                      borderRadius: 999,
                      alignSelf: progressAlign,
                    }}
                  />
                </View>
              </View>
            ) : null}

            {successTotal > 0 ? (
              <View style={{ marginTop: 18 }}>
                <Text style={{ color: c.muted, fontSize: tokens.textXs, marginBottom: 6 }}>{t("habits.successVsFailure")}</Text>
                <Row style={{ height: 12, borderRadius: 999, overflow: "hidden" }}>
                  <View style={{ height: "100%", width: `${successPct}%`, backgroundColor: c.good }} />
                  <View style={{ height: "100%", width: `${failurePct}%`, backgroundColor: c.warn }} />
                </Row>
                <Row style={{ marginTop: 8, justifyContent: "space-between" }}>
                  <Row style={{ gap: 6 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: c.good }} />
                    <Text style={{ color: c.muted, fontSize: 11 }}>{t("habits.successDays")}: {successDays} ({successPct}%)</Text>
                  </Row>
                  <Row style={{ gap: 6 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: c.warn }} />
                    <Text style={{ color: c.muted, fontSize: 11 }}>{t("habits.failureDays")}: {failures} ({failurePct}%)</Text>
                  </Row>
                </Row>
              </View>
            ) : null}

            <Row style={{ marginTop: 22, gap: 8, flexWrap: "wrap" }}>
              {!checked ? (
                <>
                  <Btn small label={t("habits.checkInToday")} onPress={() => onCheckIn(habit)} disabled={busy} />
                  <Btn small variant="warn" label={t("habits.reportFall")} onPress={() => onReportFall(habit)} disabled={busy} />
                </>
              ) : (
                <Badge label={t("habits.checkedToday")} tone="good" />
              )}
              <View style={{ flex: 1 }} />
              <Btn small variant="ghost" label={t("habits.editOrDelete")} onPress={() => onEdit(habit)} />
            </Row>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
