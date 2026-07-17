import React, { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../../src/api/resources";
import { useApi, useMutate } from "../../src/hooks";
import { useI18n } from "../../src/i18n";
import { useLayoutDir } from "../../src/layout-dir";
import {
  Btn,
  Chip,
  EmptyState,
  ErrorNote,
  Input,
  Label,
  Loading,
  Row,
  Screen,
} from "../../src/components/ui";
import { FormModal } from "../../src/components/form-modal";
import { HabitCard } from "../../src/components/habit-card";
import { dedupeHabits } from "@/lib/habit-stats";

type AddFormState = {
  name: string;
  kind: "build" | "quit";
  target_note: string;
  report_time: string;
};

const emptyForm: AddFormState = {
  name: "",
  kind: "build",
  target_note: "",
  report_time: "",
};

export default function HabitsScreen() {
  const { t } = useI18n();
  const { textLtr } = useLayoutDir();
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const { data, loading, error, refresh } = useApi(api.habits);
  const { run, busy } = useMutate();
  const [addForm, setAddForm] = useState<AddFormState | null>(null);

  useEffect(() => {
    if (params.add === "habit" || params.add === "1") {
      setAddForm(emptyForm);
      router.setParams({ add: "" });
    }
  }, [params.add, router]);

  const habits = useMemo(() => dedupeHabits(data ?? []), [data]);

  async function submitAdd() {
    if (!addForm || !addForm.name.trim()) return;
    await run(
      (config) =>
        api.createHabit(config, {
          name: addForm.name,
          kind: addForm.kind,
          target_note: addForm.target_note || null,
          report_time: addForm.report_time || null,
        }),
      { success: "flash.habitAdded" }
    );
    setAddForm(null);
    refresh();
  }

  return (
    <Screen
      title={t("habits.title")}
      subtitle={t("habits.subtitle")}
      refreshing={loading}
      onRefresh={refresh}
      headerRight={<Btn small label={t("habits.addNew")} onPress={() => setAddForm(emptyForm)} />}
    >
      {error ? <ErrorNote message={error} onRetry={refresh} /> : null}
      {loading && !data ? <Loading /> : null}
      {data && habits.length === 0 ? <EmptyState text={t("home.noHabits")} /> : null}

      {habits.map((h) => (
        <HabitCard
          key={h.id}
          habit={h}
          busy={busy}
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
      ))}

      <FormModal
        visible={addForm !== null}
        title={t("habits.addNew")}
        onClose={() => setAddForm(null)}
        onSubmit={submitAdd}
        submitLabel={t("common.add")}
        busy={busy}
      >
        {addForm ? (
          <View>
            <Label>{t("habits.name")}</Label>
            <Input value={addForm.name} onChangeText={(v) => setAddForm({ ...addForm, name: v })} placeholder={t("habits.namePlaceholder")} />
            <Row style={{ marginBottom: 8 }}>
              <Chip label={t("habits.buildNew")} active={addForm.kind === "build"} onPress={() => setAddForm({ ...addForm, kind: "build" })} />
              <Chip label={t("habits.quitBad")} active={addForm.kind === "quit"} onPress={() => setAddForm({ ...addForm, kind: "quit" })} />
            </Row>
            <Input
              value={addForm.target_note}
              onChangeText={(v) => setAddForm({ ...addForm, target_note: v })}
              placeholder={t("habits.targetNotePlaceholder")}
            />
            <Label>{`${t("habits.reportTime")} (HH:MM) — ${t("habits.reportTimeHint")}`}</Label>
            <Input
              value={addForm.report_time}
              onChangeText={(v) => setAddForm({ ...addForm, report_time: v })}
              placeholder="00:00"
              autoCapitalize="none"
              style={{ textAlign: textLtr }}
            />
          </View>
        ) : null}
      </FormModal>
    </Screen>
  );
}
