import React, { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors, tokens } from "../theme";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { Badge, Btn, Card, Chip, Input, Label, Row, confirmDelete } from "./ui";
import { FormModal } from "./form-modal";
import { effectiveStreak, habitReportDay, normalizeReportTime } from "@/lib/habit-stats";
import { formatLocaleDate } from "@/lib/i18n/core";
import type { Habit } from "@/lib/types";

type EditFields = {
  name: string;
  kind: "build" | "quit";
  target_note: string;
  report_time: string;
  streak_count: string;
  best_streak: string;
  total_success_days: string;
  failure_count: string;
  last_checked_on: string;
};

function StatTile({ icon, iconColor, label, value }: { icon: React.ComponentProps<typeof Ionicons>["name"]; iconColor: string; label: string; value: number }) {
  const c = useColors();
  const { writingDirection } = useLayoutDir();
  return (
    <View style={{ flex: 1, minWidth: 70, backgroundColor: c.border + "40", borderRadius: tokens.radiusSm, paddingVertical: 6, alignItems: "center" }}>
      <Row style={{ gap: 3, justifyContent: "center" }}>
        <Ionicons name={icon} size={11} color={iconColor} />
        <Text style={{ color: c.muted, fontSize: 9, writingDirection }} numberOfLines={1}>
          {label}
        </Text>
      </Row>
      <Text style={{ color: c.ink, fontWeight: "700", fontSize: 15, marginTop: 2, writingDirection }}>{value}</Text>
    </View>
  );
}

export function HabitCard({
  habit,
  busy,
  onCheckIn,
  onReportFall,
  onReset,
  onSave,
  onDelete,
}: {
  habit: Habit;
  busy?: boolean;
  onCheckIn: () => void | Promise<void>;
  onReportFall: () => void | Promise<void>;
  onReset: () => void | Promise<void>;
  onSave: (fields: EditFields) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
}) {
  const c = useColors();
  const { t, locale } = useI18n();
  const { textStart, textLtr, writingDirection, row } = useLayoutDir();
  const [editing, setEditing] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [form, setForm] = useState<EditFields | null>(null);
  const [saving, setSaving] = useState(false);

  const day = habitReportDay(habit.report_time);
  const checked = habit.last_checked_on === day;
  const streak = effectiveStreak(habit, day);
  const successDays = habit.total_success_days ?? 0;
  const failures = habit.failure_count ?? 0;
  const reportTime = normalizeReportTime(habit.report_time);
  const lastReported = habit.last_reported_at
    ? new Date(habit.last_reported_at).toLocaleString(locale === "he" ? "he-IL" : "en-US", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : habit.last_checked_on
      ? new Date(habit.last_checked_on).toLocaleDateString(locale === "he" ? "he-IL" : "en-US", {
          day: "numeric",
          month: "short",
        })
      : null;

  function openEdit() {
    setForm({
      name: habit.name,
      kind: habit.kind,
      target_note: habit.target_note ?? "",
      report_time: habit.report_time ?? "",
      streak_count: String(habit.streak_count),
      best_streak: String(habit.best_streak),
      total_success_days: String(habit.total_success_days),
      failure_count: String(habit.failure_count),
      last_checked_on: habit.last_checked_on ?? "",
    });
    setEditing(true);
  }

  async function submitEdit() {
    if (!form || !form.name.trim()) return;
    setSaving(true);
    try {
      await onSave(form);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function requestDelete() {
    confirmDelete(t("habits.confirmDelete", { name: habit.name }), async () => {
      await onDelete();
      setEditing(false);
    }, t("common.delete"), t("common.cancel"));
  }

  function requestReset() {
    confirmDelete(t("habits.resetStreak"), () => onReset(), t("common.save"), t("common.cancel"));
  }

  const successTotal = successDays + failures;
  const successPct = successTotal > 0 ? Math.round((successDays / successTotal) * 100) : 0;
  const failurePct = 100 - successPct;
  const streakPct = habit.best_streak > 0 ? Math.min(100, Math.round((streak / habit.best_streak) * 100)) : 0;

  return (
    <>
      <Pressable onPress={() => setViewing(true)} accessibilityRole="button" accessibilityLabel={t("habits.viewDetails")}>
        <Card>
          <Row>
            <View style={{ flex: 1 }}>
              <Row style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
                <Text style={{ color: c.ink, fontWeight: "700", textAlign: textStart, writingDirection }}>{habit.name}</Text>
                <Badge label={habit.kind === "build" ? t("habits.build") : t("habits.quit")} tone={habit.kind === "build" ? "good" : "warn"} />
              </Row>
              {habit.target_note ? (
                <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection, marginTop: 2 }} numberOfLines={2}>
                  {habit.target_note}
                </Text>
              ) : null}
            </View>
            <Row style={{ gap: 2 }}>
              <Pressable onPress={requestReset} hitSlop={8} style={{ padding: 4 }} accessibilityLabel={t("habits.resetStreak")}>
                <Ionicons name="refresh-outline" size={16} color={c.muted} />
              </Pressable>
              <Pressable onPress={openEdit} hitSlop={8} style={{ padding: 4 }} accessibilityLabel={t("habits.editOrDelete")}>
                <Ionicons name="create-outline" size={16} color={c.muted} />
              </Pressable>
            </Row>
          </Row>

          <Row wrap style={{ marginTop: 8, gap: 6 }}>
            <StatTile icon="flame" iconColor={c.accent2} label={t("common.streak")} value={streak} />
            <StatTile icon="trending-up-outline" iconColor={c.accent} label={t("common.peak")} value={habit.best_streak} />
            <StatTile icon="thumbs-up-outline" iconColor={c.good} label={t("common.positives")} value={successDays} />
            <StatTile icon="alert-circle-outline" iconColor={c.warn} label={t("common.failures")} value={failures} />
          </Row>

          <Row style={{ marginTop: 8, justifyContent: "space-between" }}>
            <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }} numberOfLines={1}>
              {t("habits.lastReported")}: {lastReported ?? t("habits.neverReported")}
            </Text>
          </Row>

          <Row style={{ marginTop: 10 }}>
            {checked ? (
              <Badge label={t("habits.checkedToday")} tone="good" />
            ) : (
              <>
                <Btn small label={t("habits.checkInToday")} onPress={onCheckIn} disabled={busy} />
                <Btn small variant="warn" label={t("habits.reportFall")} onPress={onReportFall} disabled={busy} />
              </>
            )}
          </Row>
        </Card>
      </Pressable>

      <FormModal
        visible={editing}
        title={t("habits.editOrDelete")}
        onClose={() => setEditing(false)}
        onSubmit={submitEdit}
        submitLabel={saving ? t("common.saving") : t("habits.saveChanges")}
        busy={saving}
        onDelete={requestDelete}
      >
        {form ? (
          <View>
            <Label>{t("habits.name")}</Label>
            <Input value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder={t("habits.namePlaceholder")} />
            <Row style={{ marginBottom: 8 }}>
              <Chip label={t("habits.buildNew")} active={form.kind === "build"} onPress={() => setForm({ ...form, kind: "build" })} />
              <Chip label={t("habits.quitBad")} active={form.kind === "quit"} onPress={() => setForm({ ...form, kind: "quit" })} />
            </Row>
            <Input
              value={form.target_note}
              onChangeText={(v) => setForm({ ...form, target_note: v })}
              placeholder={t("habits.targetNotePlaceholder")}
            />
            <Label>{`${t("habits.reportTime")} (HH:MM) — ${t("habits.reportTimeHint")}`}</Label>
            <Input
              value={form.report_time}
              onChangeText={(v) => setForm({ ...form, report_time: v })}
              placeholder="00:00"
              autoCapitalize="none"
              style={{ textAlign: textLtr }}
            />
            <Label>{t("common.streak")}</Label>
            <Input value={form.streak_count} onChangeText={(v) => setForm({ ...form, streak_count: v })} keyboardType="numeric" />
            <Label>{t("common.peak")}</Label>
            <Input value={form.best_streak} onChangeText={(v) => setForm({ ...form, best_streak: v })} keyboardType="numeric" />
            <Label>{t("common.positives")}</Label>
            <Input
              value={form.total_success_days}
              onChangeText={(v) => setForm({ ...form, total_success_days: v })}
              keyboardType="numeric"
            />
            <Label>{t("common.failures")}</Label>
            <Input value={form.failure_count} onChangeText={(v) => setForm({ ...form, failure_count: v })} keyboardType="numeric" />
            <Label>{`${t("habits.lastCheck")} (YYYY-MM-DD)`}</Label>
            <Input
              value={form.last_checked_on}
              onChangeText={(v) => setForm({ ...form, last_checked_on: v })}
              placeholder="2026-07-13"
              autoCapitalize="none"
              style={{ textAlign: textLtr }}
            />
          </View>
        ) : null}
      </FormModal>

      <Modal visible={viewing} animationType="fade" transparent onRequestClose={() => setViewing(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "#00000088", justifyContent: "center", padding: 16 }}
          onPress={() => setViewing(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View
              style={{
                backgroundColor: c.surface,
                borderColor: c.border,
                borderWidth: 1,
                borderRadius: 18,
                maxHeight: "85%",
              }}
            >
              <ScrollView contentContainerStyle={{ padding: tokens.padLg }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Text style={{ color: c.ink, fontSize: 17, fontWeight: "700", textAlign: textStart, writingDirection }}>{habit.name}</Text>
                  <Pressable onPress={() => setViewing(false)} hitSlop={8}>
                    <Ionicons name="close" size={20} color={c.muted} />
                  </Pressable>
                </Row>

                <Row style={{ marginTop: 8, justifyContent: "flex-start" }}>
                  <Badge label={habit.kind === "build" ? t("habits.build") : t("habits.quit")} tone={habit.kind === "build" ? "good" : "warn"} />
                  <Text style={{ color: c.muted, fontSize: tokens.textXs }}>
                    {t("habits.created")}: {formatLocaleDate(locale, habit.created_at)}
                  </Text>
                </Row>

                {habit.target_note ? (
                  <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection, marginTop: 8 }}>
                    {habit.target_note}
                  </Text>
                ) : null}

                <Row wrap style={{ marginTop: 12, gap: 6 }}>
                  <StatTile icon="flame" iconColor={c.accent2} label={t("common.streak")} value={streak} />
                  <StatTile icon="trending-up-outline" iconColor={c.accent} label={t("common.peak")} value={habit.best_streak} />
                  <StatTile icon="thumbs-up-outline" iconColor={c.good} label={t("common.positives")} value={successDays} />
                  <StatTile icon="alert-circle-outline" iconColor={c.warn} label={t("common.failures")} value={failures} />
                </Row>

                <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection, marginTop: 10 }}>
                  {t("habits.lastReported")}: {lastReported ?? t("habits.neverReported")}
                  {reportTime !== "00:00" ? `  ·  ${t("habits.reportOpensAt", { time: reportTime })}` : ""}
                </Text>

                {habit.best_streak > 0 ? (
                  <View style={{ marginTop: 14 }}>
                    <Row style={{ justifyContent: "space-between" }}>
                      <Text style={{ color: c.muted, fontSize: tokens.textXs }}>{t("habits.streakProgress")}</Text>
                      <Text style={{ color: c.ink, fontSize: tokens.textXs, fontWeight: "700" }}>
                        {streak}/{habit.best_streak}
                      </Text>
                    </Row>
                    <View style={{ height: 8, borderRadius: 999, backgroundColor: c.border + "60", overflow: "hidden", marginTop: 4 }}>
                      <View style={{ height: "100%", width: `${streakPct}%`, backgroundColor: c.accent2, borderRadius: 999 }} />
                    </View>
                  </View>
                ) : null}

                {successTotal > 0 ? (
                  <View style={{ marginTop: 14 }}>
                    <Text style={{ color: c.muted, fontSize: tokens.textXs, marginBottom: 4 }}>
                      {t("habits.successVsFailure")}
                    </Text>
                    <Row style={{ height: 12, borderRadius: 999, overflow: "hidden", gap: 0 }}>
                      <View style={{ height: "100%", width: `${successPct}%`, backgroundColor: c.good }} />
                      <View style={{ height: "100%", width: `${failurePct}%`, backgroundColor: c.warn }} />
                    </Row>
                    <Row style={{ marginTop: 4, justifyContent: "space-between" }}>
                      <Row style={{ gap: 4 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: c.good }} />
                        <Text style={{ color: c.muted, fontSize: 10 }}>
                          {t("habits.successDays")}: {successDays}
                        </Text>
                      </Row>
                      <Row style={{ gap: 4 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: c.warn }} />
                        <Text style={{ color: c.muted, fontSize: 10 }}>
                          {t("habits.failureDays")}: {failures}
                        </Text>
                      </Row>
                    </Row>
                  </View>
                ) : null}
              </ScrollView>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
