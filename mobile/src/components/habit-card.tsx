import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors, tokens } from "../theme";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { Badge, Btn, Card, Row, confirmDelete } from "./ui";
import { StatTile } from "./habit-stat-tile";
import { hapticImpact, hapticSelection } from "../haptics";
import { localeTag } from "@/lib/i18n/core";
import { effectiveStreak, habitReportDay, isReportDue, normalizeReportTime } from "@/lib/habit-stats";
import { HabitMissedReports } from "./habit-missed-reports";
import type { Habit } from "@/lib/types";
import type { HabitEditFields } from "./habit-edit-modal";

export type EditFields = HabitEditFields;

export const HabitCard = React.memo(function HabitCard({
  habit,
  busy,
  onPress,
  onEdit,
  onReset,
  onCheckIn,
  onReportFall,
  onBackfill,
}: {
  habit: Habit;
  busy?: boolean;
  onPress?: (habit: Habit) => void;
  onEdit?: (habit: Habit) => void;
  onReset?: (habit: Habit) => void;
  onCheckIn: (habit: Habit) => void | Promise<void>;
  onReportFall: (habit: Habit) => void | Promise<void>;
  onBackfill?: (habit: Habit, date: string, type: "check_in" | "fall") => void | Promise<void>;
  onSave?: (fields: HabitEditFields) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  const c = useColors();
  const { t, locale } = useI18n();
  const { textStart, writingDirection } = useLayoutDir();

  const day = habitReportDay(habit.report_time);
  const checked = habit.last_checked_on === day;
  const overdue = isReportDue(habit);
  const reportTime = normalizeReportTime(habit.report_time);
  const streak = effectiveStreak(habit, day);
  const successDays = habit.total_success_days ?? 0;
  const failures = habit.failure_count ?? 0;
  const lastReported = habit.last_reported_at
    ? new Date(habit.last_reported_at).toLocaleString(localeTag(locale), {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : habit.last_checked_on
      ? new Date(habit.last_checked_on).toLocaleDateString(localeTag(locale), {
          day: "numeric", month: "short",
        })
      : null;

  function requestReset() {
    confirmDelete(
      t("habits.resetStreak"),
      () => {
        hapticImpact();
        onReset?.(habit);
      },
      t("common.save"),
      t("common.cancel")
    );
  }

  return (
    <Pressable
      unstable_pressDelay={0}
      onPress={() => {
        hapticSelection();
        onPress?.(habit);
      }}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={t("habits.viewDetails")}
      style={({ pressed }) => [{ opacity: pressed && onPress ? tokens.press : 1 }]}
    >
      <Card
        style={[
          { paddingVertical: 8, paddingHorizontal: 10, marginBottom: 8 },
          overdue ? { borderColor: c.warn, borderWidth: 1 } : undefined,
        ]}
      >
        <Row>
          <View style={{ flex: 1 }}>
            <Row wrap>
              <Text style={{ color: c.ink, fontWeight: "600", textAlign: textStart, writingDirection }}>
                {habit.name}
              </Text>
              <Badge
                label={habit.kind === "build" ? t("habits.build") : t("habits.quit")}
                tone={habit.kind === "build" ? "good" : "warn"}
              />
            </Row>
            {habit.target_note ? (
              <Text
                style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection, marginTop: 2 }}
                numberOfLines={2}
              >
                {habit.target_note}
              </Text>
            ) : null}
          </View>
          <Row style={{ gap: 2 }}>
            {onReset ? (
              <Pressable
                unstable_pressDelay={0}
                onPress={requestReset}
                hitSlop={8}
                style={{ padding: 4 }}
                accessibilityLabel={t("habits.resetStreak")}
              >
                <Ionicons name="refresh-outline" size={16} color={c.muted} />
              </Pressable>
            ) : null}
            {onEdit ? (
              <Pressable
                unstable_pressDelay={0}
                onPress={() => {
                  hapticSelection();
                  onEdit(habit);
                }}
                hitSlop={8}
                style={{ padding: 4 }}
                accessibilityLabel={t("habits.editOrDelete")}
              >
                <Ionicons name="create-outline" size={16} color={c.muted} />
              </Pressable>
            ) : null}
          </Row>
        </Row>

        <Row wrap style={{ marginTop: 6, gap: 4 }}>
          <StatTile compact icon="flame" iconColor={c.accent2} label={t("common.streak")} value={streak} />
          <StatTile compact icon="trending-up-outline" iconColor={c.accent} label={t("common.peak")} value={habit.best_streak} />
          <StatTile compact icon="thumbs-up-outline" iconColor={c.good} label={t("common.positives")} value={successDays} />
          <StatTile compact icon="alert-circle-outline" iconColor={c.warn} label={t("common.failures")} value={failures} />
        </Row>

        <Row wrap style={{ marginTop: 5, gap: 4 }}>
          <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }} numberOfLines={1}>
            {t("habits.lastReported")}: {lastReported ?? t("habits.neverReported")}
            {!checked && !overdue ? ` · ${t("habits.reportOpensAt", { time: reportTime })}` : null}
          </Text>
          {overdue ? (
            <Text style={{ color: c.warn, fontSize: tokens.textXs, fontWeight: "600", writingDirection }}>
              {t("habits.reportDueNow")}
            </Text>
          ) : null}
        </Row>

        {onBackfill ? <HabitMissedReports habit={habit} busy={busy} onBackfill={onBackfill} /> : null}

        <Row style={{ marginTop: 6 }}>
          {checked ? (
            <Badge label={t("habits.checkedToday")} tone="good" />
          ) : (
            <>
              <Btn
                small
                label={t("habits.checkInToday")}
                onPress={() => onCheckIn(habit)}
                disabled={busy}
              />
              <Btn
                small
                variant="warn"
                label={t("habits.reportFall")}
                onPress={() => onReportFall(habit)}
                disabled={busy}
              />
            </>
          )}
        </Row>
      </Card>
    </Pressable>
  );
});
