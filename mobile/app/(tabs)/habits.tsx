import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, type HomePayload } from "../../src/api/resources";
import { useI18n } from "../../src/i18n";
import { useLayoutDir } from "../../src/layout-dir";
import {
  useApiQuery,
  useApiMutation,
  queryKeys,
  queryClient,
  patchItemInList,
  removeItemFromList,
  patchHabitInHome,
  removeHabitFromHome,
} from "../../src/query";
import type { Habit } from "@/lib/types";
import {
  Btn,
  Chip,
  EmptyState,
  ErrorNote,
  Input,
  Label,
  Loading,
  Row,
  ScreenList,
} from "../../src/components/ui";
import { FormModal } from "../../src/components/form-modal";
import { HabitCard } from "../../src/components/habit-card";
import { HabitsReportedSection } from "../../src/components/habits-reported-section";
import { HabitDetailsModal } from "../../src/components/habit-details-modal";
import { HabitEditModal, type HabitEditFields } from "../../src/components/habit-edit-modal";
import {
  computeCheckIn,
  computeFall,
  dedupeHabits,
  habitNeedsAction,
  habitReportDay,
  sortHabitsByOldestReport,
} from "@/lib/habit-stats";

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
  const { data, loading, error, refresh } = useApiQuery(queryKeys.habits, api.habits);
  const { run, busy, isPending } = useApiMutation();
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

  const allHabits = useMemo(() => sortHabitsByOldestReport(dedupeHabits(data ?? [])), [data]);

  const { habitsPending, habitsReported } = useMemo(() => {
    const pending: Habit[] = [];
    const reported: Habit[] = [];
    for (const habit of allHabits) {
      if (habitNeedsAction(habit)) pending.push(habit);
      else reported.push(habit);
    }
    return { habitsPending: pending, habitsReported: reported };
  }, [allHabits]);

  const viewingHabit = useMemo(
    () => (viewingHabitId ? allHabits.find((h) => h.id === viewingHabitId) ?? null : null),
    [allHabits, viewingHabitId]
  );

  const handleCheckIn = useCallback(
    async (h: Habit) => {
      const prevHabits = queryClient.getQueryData<Habit[]>(queryKeys.habits);
      const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);

      const todayStr = habitReportDay(h.report_time);
      queryClient.setQueryData<Habit[]>(queryKeys.habits, (old) =>
        patchItemInList(old, h.id, {
          streak_count: (h.streak_count ?? 0) + 1,
          last_checked_on: todayStr,
        })
      );
      queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
        patchHabitInHome(old, h.id, {
          streak_count: (h.streak_count ?? 0) + 1,
          last_checked_on: todayStr,
        })
      );

      await run((config) => api.reportHabit(config, h.id, "check_in"), {
        itemId: h.id,
        flash: { success: "flash.checkInRecorded" },
        onError: () => {
          if (prevHabits) queryClient.setQueryData(queryKeys.habits, prevHabits);
          if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
        },
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.habits });
        },
      });
    },
    [run]
  );

  const handleReportFall = useCallback(
    async (h: Habit) => {
      const prevHabits = queryClient.getQueryData<Habit[]>(queryKeys.habits);
      const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);
      queryClient.setQueryData<Habit[]>(queryKeys.habits, (old) =>
        patchItemInList(old, h.id, {
          streak_count: 0,
          failure_count: (h.failure_count ?? 0) + 1,
        })
      );
      queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
        patchHabitInHome(old, h.id, {
          streak_count: 0,
          failure_count: (h.failure_count ?? 0) + 1,
        })
      );
      await run((config) => api.reportHabit(config, h.id, "fall"), {
        itemId: h.id,
        flash: { success: "flash.fallRecorded" },
        onError: () => {
          if (prevHabits) queryClient.setQueryData(queryKeys.habits, prevHabits);
          if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
        },
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.habits });
        },
      });
    },
    [run]
  );

  const handleBackfill = useCallback(
    async (h: Habit, date: string, type: "check_in" | "fall") => {
      const prevHabits = queryClient.getQueryData<Habit[]>(queryKeys.habits);
      const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);

      const result = type === "check_in" ? computeCheckIn(h, date) : computeFall(h, date);
      const optimisticPatch = {
        streak_count: result.streak,
        best_streak: result.bestStreak,
        total_success_days: result.totalSuccessDays,
        failure_count: result.failureCount,
        last_checked_on: date,
        last_reported_at: new Date().toISOString(),
      };

      queryClient.setQueryData<Habit[]>(queryKeys.habits, (old) =>
        patchItemInList(old, h.id, optimisticPatch)
      );
      queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
        patchHabitInHome(old, h.id, optimisticPatch)
      );

      await run((config) => api.reportHabit(config, h.id, type, { for_date: date }), {
        itemId: h.id,
        flash: { success: type === "check_in" ? "flash.checkInRecorded" : "flash.fallRecorded" },
        onError: () => {
          if (prevHabits) queryClient.setQueryData(queryKeys.habits, prevHabits);
          if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
        },
        onSuccess: (updated) => {
          if (updated) {
            queryClient.setQueryData<Habit[]>(queryKeys.habits, (old) => patchItemInList(old, h.id, updated));
            queryClient.setQueryData<HomePayload>(queryKeys.home, (old) => patchHabitInHome(old, h.id, updated));
          }
          queryClient.invalidateQueries({ queryKey: queryKeys.habits });
          queryClient.invalidateQueries({ queryKey: queryKeys.home });
        },
      });
    },
    [run]
  );

  const handleReset = useCallback(
    async (h: Habit) => {
      const prevHabits = queryClient.getQueryData<Habit[]>(queryKeys.habits);
      const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);
      queryClient.setQueryData<Habit[]>(queryKeys.habits, (old) =>
        patchItemInList(old, h.id, { streak_count: 0 })
      );
      queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
        patchHabitInHome(old, h.id, { streak_count: 0 })
      );
      await run((config) => api.reportHabit(config, h.id, "reset"), {
        itemId: h.id,
        flash: { success: "flash.streakReset" },
        onError: () => {
          if (prevHabits) queryClient.setQueryData(queryKeys.habits, prevHabits);
          if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
        },
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.habits });
        },
      });
    },
    [run]
  );

  const handleSave = useCallback(
    async (fields: HabitEditFields) => {
      if (!editingHabit) return;
      const h = editingHabit;
      const body = {
        name: fields.name,
        kind: fields.kind,
        target_note: fields.target_note || null,
        report_time: fields.report_time || null,
        streak_count: Number(fields.streak_count) || 0,
        best_streak: Number(fields.best_streak) || 0,
        total_success_days: Number(fields.total_success_days) || 0,
        failure_count: Number(fields.failure_count) || 0,
        last_checked_on: fields.last_checked_on || null,
      };
      setEditingHabit(null);
      await run((config) => api.updateHabit(config, h.id, body), {
        itemId: h.id,
        flash: { success: "flash.habitUpdated" },
        onSuccess: (updated) => {
          if (updated) {
            queryClient.setQueryData<Habit[]>(queryKeys.habits, (old) =>
              patchItemInList(old, h.id, updated)
            );
            queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
              patchHabitInHome(old, h.id, updated)
            );
          }
          queryClient.invalidateQueries({ queryKey: queryKeys.habits });
        },
      });
    },
    [editingHabit, run]
  );

  const handleDelete = useCallback(async () => {
    if (!editingHabit) return;
    const h = editingHabit;
    setEditingHabit(null);
    setViewingHabitId(null);
    const prevHabits = queryClient.getQueryData<Habit[]>(queryKeys.habits);
    const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);
    queryClient.setQueryData<Habit[]>(queryKeys.habits, (old) => removeItemFromList(old, h.id));
    queryClient.setQueryData<HomePayload>(queryKeys.home, (old) => removeHabitFromHome(old, h.id));
    await run((config) => api.deleteHabit(config, h.id), {
      itemId: h.id,
      flash: { success: "flash.habitDeleted" },
      onError: () => {
        if (prevHabits) queryClient.setQueryData(queryKeys.habits, prevHabits);
        if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.habits });
      },
    });
  }, [editingHabit, run]);

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
        {loading && !data ? <Loading /> : null}
      </View>
    ),
    [error, loading, data, refresh]
  );

  return (
    <>
      <ScreenList
        title={t("habits.title")}
        subtitle={t("habits.subtitle")}
        refreshing={loading}
        onRefresh={refresh}
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
  );
}
