import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../../src/api/resources";
import { useHabitActions } from "../../src/hooks/use-habit-actions";
import { useI18n } from "../../src/i18n";
import { useLayoutDir } from "../../src/layout-dir";
import { useApiQuery, useApiMutation, queryKeys, queryClient } from "../../src/query";
import { ScreenErrorBoundary } from "../../src/components/error-boundary";
import type { Habit } from "@/lib/types";
import {
  Btn,
  Chip,
  EmptyState,
  ErrorNote,
  Input,
  Label,
  Row,
  ScreenList,
} from "../../src/components/ui";
import { FormModal } from "../../src/components/form-modal";
import { HabitCard } from "../../src/components/habit-card";
import { HabitsReportedSection } from "../../src/components/habits-reported-section";
import { HabitDetailsModal } from "../../src/components/habit-details-modal";
import { HabitEditModal, type HabitEditFields } from "../../src/components/habit-edit-modal";
import {
  dedupeHabits,
  habitNeedsAction,
  sortHabitsByOldestReport,
  sortHabitsForToday,
} from "@/lib/habit-stats";
import { useMinuteNow } from "../../src/hooks";

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
  const { data, loading, isFetching, error, refresh } = useApiQuery(queryKeys.habits, api.habits);
  const { run, busy } = useApiMutation();
  const {
    handleCheckIn,
    handleReportFall,
    handleBackfill,
    handleReset,
    handleSave: saveHabit,
    handleDelete: deleteHabit,
    isPending,
  } = useHabitActions();
  const [addForm, setAddForm] = useState<AddFormState | null>(null);
  const [viewingHabitId, setViewingHabitId] = useState<string | null>(null);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [reportedExpanded, setReportedExpanded] = useState(false);

  useEffect(() => {
    if (params.add === "habit" || params.add === "1") {
      setAddForm(emptyForm);
      router.setParams({ add: "" });
    }
  }, [params.add, router]);

  const habitNow = useMinuteNow();
  const uniqueHabits = useMemo(() => dedupeHabits(data ?? []), [data]);

  const { habitsPending, habitsReported } = useMemo(() => {
    const pending: Habit[] = [];
    const reported: Habit[] = [];
    for (const habit of uniqueHabits) {
      if (habitNeedsAction(habit, habitNow)) pending.push(habit);
      else reported.push(habit);
    }
    return {
      habitsPending: sortHabitsForToday(pending, habitNow),
      habitsReported: sortHabitsByOldestReport(reported),
    };
  }, [uniqueHabits, habitNow]);

  const allHabits = useMemo(
    () => [...habitsPending, ...habitsReported],
    [habitsPending, habitsReported],
  );

  const viewingHabit = useMemo(
    () => (viewingHabitId ? allHabits.find((h) => h.id === viewingHabitId) ?? null : null),
    [allHabits, viewingHabitId]
  );

  const handleSave = useCallback(
    async (fields: HabitEditFields) => {
      if (!editingHabit) return;
      const h = editingHabit;
      setEditingHabit(null);
      await saveHabit(h, fields);
    },
    [editingHabit, saveHabit]
  );

  const handleDelete = useCallback(async () => {
    if (!editingHabit) return;
    const h = editingHabit;
    setEditingHabit(null);
    setViewingHabitId(null);
    await deleteHabit(h);
  }, [editingHabit, deleteHabit]);

  async function submitAdd() {
    if (!addForm || !addForm.name.trim()) return;
    const body = {
      name: addForm.name,
      kind: addForm.kind,
      target_note: addForm.target_note || null,
      report_time: addForm.report_time || null,
    };
    setAddForm(null);
    await run((config) => api.createHabit(config, body), {
      flash: { success: "flash.habitAdded" },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.habits });
        queryClient.invalidateQueries({ queryKey: queryKeys.home });
      },
    });
  }

  const renderItem = useCallback(
    ({ item }: { item: Habit }) => (
      <HabitCard
        habit={item}
        busy={isPending(item.id)}
        onPress={(h) => setViewingHabitId(h.id)}
        onEdit={setEditingHabit}
        onReset={handleReset}
        onCheckIn={handleCheckIn}
        onReportFall={handleReportFall}
      />
    ),
    [isPending, handleReset, handleCheckIn, handleReportFall]
  );

  const keyExtractor = useCallback((item: Habit) => item.id, []);

  const headerExtra = useMemo(
    () => (
      <View>
        {error ? <ErrorNote message={error} onRetry={refresh} /> : null}
      </View>
    ),
    [error, loading, data, refresh]
  );

  return (
    <ScreenErrorBoundary name="habits">
    <>
      <ScreenList
        title={t("habits.title")}
        subtitle={t("habits.subtitle")}
        refreshing={isFetching}
        onRefresh={refresh}
        initialLoading={loading && !data}
        headerRight={<Btn small label={t("habits.addNew")} onPress={() => setAddForm(emptyForm)} />}
        headerExtra={headerExtra}
        data={habitsPending}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListEmptyComponent={
          data && allHabits.length === 0 ? <EmptyState text={t("home.noHabits")} /> : null
        }
        ListFooterComponent={
          habitsReported.length > 0 ? (
            <HabitsReportedSection
              habits={habitsReported}
              expanded={reportedExpanded}
              onToggle={() => setReportedExpanded((v) => !v)}
              isPending={isPending}
              onPress={(h) => setViewingHabitId(h.id)}
              onEdit={setEditingHabit}
              onReset={handleReset}
              onCheckIn={handleCheckIn}
              onReportFall={handleReportFall}
            />
          ) : null
        }
      />

      <HabitDetailsModal
        habit={viewingHabit}
        visible={viewingHabit !== null}
        onClose={() => setViewingHabitId(null)}
        onEdit={(h) => {
          setViewingHabitId(null);
          setEditingHabit(h);
        }}
        onCheckIn={handleCheckIn}
        onReportFall={handleReportFall}
        onBackfill={handleBackfill}
        busy={viewingHabit ? isPending(viewingHabit.id) : false}
      />

      <HabitEditModal
        habit={editingHabit}
        visible={editingHabit !== null}
        onClose={() => setEditingHabit(null)}
        onSave={handleSave}
        onDelete={handleDelete}
        saving={editingHabit ? isPending(editingHabit.id) : false}
      />

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
            <Input
              value={addForm.name}
              onChangeText={(v) => setAddForm({ ...addForm, name: v })}
              placeholder={t("habits.namePlaceholder")}
            />
            <Row style={{ marginBottom: 8 }}>
              <Chip
                label={t("habits.buildNew")}
                active={addForm.kind === "build"}
                onPress={() => setAddForm({ ...addForm, kind: "build" })}
              />
              <Chip
                label={t("habits.quitBad")}
                active={addForm.kind === "quit"}
                onPress={() => setAddForm({ ...addForm, kind: "quit" })}
              />
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
    </>
    </ScreenErrorBoundary>
  );
}
