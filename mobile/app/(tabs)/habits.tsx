import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../../src/api/resources";
import { useApi, useMutate } from "../../src/hooks";
import { useI18n } from "../../src/i18n";
import { useColors, tokens } from "../../src/theme";
import {
  Badge,
  Btn,
  Card,
  Chip,
  EmptyState,
  ErrorNote,
  Input,
  Label,
  Loading,
  Row,
  Screen,
  confirmDelete,
} from "../../src/components/ui";
import { FormModal } from "../../src/components/form-modal";
import { effectiveStreak, habitReportDay } from "@/lib/habit-stats";
import type { Habit } from "@/lib/types";

type FormState = {
  id?: string;
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

const emptyForm: FormState = {
  name: "",
  kind: "build",
  target_note: "",
  report_time: "",
  streak_count: "0",
  best_streak: "0",
  total_success_days: "0",
  failure_count: "0",
  last_checked_on: "",
};

export default function HabitsScreen() {
  const c = useColors();
  const { t } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const { data, loading, error, refresh } = useApi(api.habits);
  const { run, busy } = useMutate();
  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (params.add) {
      setForm(emptyForm);
      router.setParams({ add: "" });
    }
  }, [params.add, router]);

  const habits = data ?? [];

  async function report(habit: Habit, type: "check_in" | "fall" | "reset") {
    if (type === "reset") {
      confirmDelete(
        t("habits.resetStreak"),
        async () => {
          await run((config) => api.reportHabit(config, habit.id, "reset"));
          refresh();
        },
        t("common.save"),
        t("common.cancel")
      );
      return;
    }
    await run((config) => api.reportHabit(config, habit.id, type));
    refresh();
  }

  async function submit() {
    if (!form || !form.name.trim()) return;
    if (form.id) {
      await run((config) =>
        api.updateHabit(config, form.id!, {
          name: form.name,
          kind: form.kind,
          target_note: form.target_note || null,
          report_time: form.report_time || null,
          streak_count: Number(form.streak_count) || 0,
          best_streak: Number(form.best_streak) || 0,
          total_success_days: Number(form.total_success_days) || 0,
          failure_count: Number(form.failure_count) || 0,
          last_checked_on: form.last_checked_on || null,
        })
      );
    } else {
      await run((config) =>
        api.createHabit(config, {
          name: form.name,
          kind: form.kind,
          target_note: form.target_note || null,
          report_time: form.report_time || null,
        })
      );
    }
    setForm(null);
    refresh();
  }

  function removeHabit(habit: Habit) {
    confirmDelete(
      `${t("common.delete")}: ${habit.name}?`,
      async () => {
        await run((config) => api.deleteHabit(config, habit.id));
        setForm(null);
        refresh();
      },
      t("common.delete"),
      t("common.cancel")
    );
  }

  return (
    <Screen
      title={t("habits.title")}
      subtitle={t("habits.subtitle")}
      refreshing={loading}
      onRefresh={refresh}
      headerRight={<Btn small label={t("habits.addNew")} onPress={() => setForm(emptyForm)} />}
    >
      {error ? <ErrorNote message={error} onRetry={refresh} /> : null}
      {loading && !data ? <Loading /> : null}
      {data && habits.length === 0 ? <EmptyState text={t("home.noHabits")} /> : null}

      {habits.map((h) => {
        const day = habitReportDay(h.report_time);
        const checked = h.last_checked_on === day;
        const streak = effectiveStreak(h, day);
        return (
          <Card key={h.id}>
            <Row>
              <Pressable
                style={{ flex: 1 }}
                onPress={() =>
                  setForm({
                    id: h.id,
                    name: h.name,
                    kind: h.kind,
                    target_note: h.target_note ?? "",
                    report_time: h.report_time ?? "",
                    streak_count: String(h.streak_count),
                    best_streak: String(h.best_streak),
                    total_success_days: String(h.total_success_days),
                    failure_count: String(h.failure_count),
                    last_checked_on: h.last_checked_on ?? "",
                  })
                }
              >
                <Row style={{ justifyContent: "flex-start" }}>
                  <Text style={{ color: c.ink, fontWeight: "700", textAlign: "right" }}>{h.name}</Text>
                  <Badge label={h.kind === "build" ? t("habits.build") : t("habits.quit")} tone={h.kind === "build" ? "accent" : "warn"} />
                </Row>
                {h.target_note ? (
                  <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: "right", marginTop: 2 }}>
                    {h.target_note}
                  </Text>
                ) : null}
                <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: "right", marginTop: 4 }}>
                  {t("common.streak")}: {streak} · {t("common.peak")}: {h.best_streak} · {t("common.positives")}: {h.total_success_days} · {t("common.failures")}: {h.failure_count}
                </Text>
              </Pressable>
            </Row>
            <Row style={{ marginTop: 10 }}>
              {checked ? (
                <Badge label={t("habits.checkedToday")} tone="good" />
              ) : (
                <>
                  <Btn small label={t("habits.checkInToday")} onPress={() => report(h, "check_in")} disabled={busy} />
                  <Btn small variant="warn" label={t("habits.reportFall")} onPress={() => report(h, "fall")} disabled={busy} />
                </>
              )}
              <View style={{ flex: 1 }} />
              <Btn small variant="ghost" label={t("habits.resetStreak")} onPress={() => report(h, "reset")} disabled={busy} />
            </Row>
          </Card>
        );
      })}

      <FormModal
        visible={form !== null}
        title={form?.id ? t("habits.editData") : t("habits.addNew")}
        onClose={() => setForm(null)}
        onSubmit={submit}
        submitLabel={form?.id ? t("habits.saveChanges") : t("common.add")}
        busy={busy}
        onDelete={
          form?.id
            ? () => {
                const habit = habits.find((x) => x.id === form.id);
                if (habit) removeHabit(habit);
              }
            : undefined
        }
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
              style={{ textAlign: "left" }}
            />
            {form.id ? (
              <>
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
                  style={{ textAlign: "left" }}
                />
              </>
            ) : null}
          </View>
        ) : null}
      </FormModal>
    </Screen>
  );
}
