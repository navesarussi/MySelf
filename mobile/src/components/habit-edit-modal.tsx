import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { Chip, Input, Label, Row, confirmDelete } from "./ui";
import { FormModal } from "./form-modal";
import type { Habit } from "@/lib/types";

export type HabitEditFields = {
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

export function HabitEditModal({
  habit,
  visible,
  onClose,
  onSave,
  onDelete,
  saving,
}: {
  habit: Habit | null;
  visible: boolean;
  onClose: () => void;
  onSave: (fields: HabitEditFields) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  saving?: boolean;
}) {
  const { t } = useI18n();
  const { textLtr } = useLayoutDir();
  const [form, setForm] = useState<HabitEditFields | null>(null);

  useEffect(() => {
    if (habit) {
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
    } else {
      setForm(null);
    }
  }, [habit]);

  if (!habit || !form) return null;

  function submit() {
    if (!form || !form.name.trim()) return;
    onSave(form);
  }

  function requestDelete() {
    if (!habit) return;
    confirmDelete(
      t("habits.confirmDelete", { name: habit.name }),
      () => onDelete(),
      t("common.delete"),
      t("common.cancel")
    );
  }

  return (
    <FormModal
      visible={visible}
      title={t("habits.editOrDelete")}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={saving ? t("common.saving") : t("habits.saveChanges")}
      busy={saving}
      onDelete={requestDelete}
    >
      <View>
        <Label>{t("habits.name")}</Label>
        <Input
          value={form.name}
          onChangeText={(v) => setForm({ ...form, name: v })}
          placeholder={t("habits.namePlaceholder")}
        />
        <Row style={{ marginBottom: 8 }}>
          <Chip
            label={t("habits.buildNew")}
            active={form.kind === "build"}
            onPress={() => setForm({ ...form, kind: "build" })}
          />
          <Chip
            label={t("habits.quitBad")}
            active={form.kind === "quit"}
            onPress={() => setForm({ ...form, kind: "quit" })}
          />
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
        <Input
          value={form.streak_count}
          onChangeText={(v) => setForm({ ...form, streak_count: v })}
          keyboardType="numeric"
        />
        <Label>{t("common.peak")}</Label>
        <Input
          value={form.best_streak}
          onChangeText={(v) => setForm({ ...form, best_streak: v })}
          keyboardType="numeric"
        />
        <Label>{t("common.positives")}</Label>
        <Input
          value={form.total_success_days}
          onChangeText={(v) => setForm({ ...form, total_success_days: v })}
          keyboardType="numeric"
        />
        <Label>{t("common.failures")}</Label>
        <Input
          value={form.failure_count}
          onChangeText={(v) => setForm({ ...form, failure_count: v })}
          keyboardType="numeric"
        />
        <Label>{`${t("habits.lastCheck")} (YYYY-MM-DD)`}</Label>
        <Input
          value={form.last_checked_on}
          onChangeText={(v) => setForm({ ...form, last_checked_on: v })}
          placeholder="2026-07-13"
          autoCapitalize="none"
          style={{ textAlign: textLtr }}
        />
      </View>
    </FormModal>
  );
}
