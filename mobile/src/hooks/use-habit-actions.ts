import { useCallback } from "react";
import { api, type HomePayload } from "../api/resources";
import {
  queryClient,
  queryKeys,
  patchItemInList,
  removeItemFromList,
  patchHabitInHome,
  removeHabitFromHome,
  useApiMutation,
} from "../query";
import type { Habit } from "@/lib/types";
import { computeCheckIn, computeFall, habitReportDay } from "@/lib/habit-stats";
import type { HabitEditFields } from "../components/habit-edit-modal";

/** Shared optimistic habit mutations for Home + Habits screens. */
export function useHabitActions() {
  const { run, busy, isPending } = useApiMutation();

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
    async (h: Habit, date: string, type: "check_in" | "fall"): Promise<boolean> => {
      const prevHabits = queryClient.getQueryData<Habit[]>(queryKeys.habits);
      const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);

      const applyOptimisticPatch = (current: Habit): Partial<Habit> => {
        const isSequential = !current.last_checked_on || date > current.last_checked_on;
        if (isSequential) {
          const result = type === "check_in" ? computeCheckIn(current, date) : computeFall(current, date);
          return {
            streak_count: result.streak,
            best_streak: result.bestStreak,
            total_success_days: result.totalSuccessDays,
            failure_count: result.failureCount,
            last_checked_on: date,
            last_reported_at: new Date().toISOString(),
          };
        }
        return {
          total_success_days:
            type === "check_in" ? (current.total_success_days ?? 0) + 1 : current.total_success_days,
          failure_count: type === "fall" ? (current.failure_count ?? 0) + 1 : current.failure_count,
          last_reported_at: new Date().toISOString(),
        };
      };

      queryClient.setQueryData<Habit[]>(queryKeys.habits, (old) => {
        const current = old?.find((item) => item.id === h.id) ?? h;
        return patchItemInList(old, h.id, applyOptimisticPatch(current));
      });
      queryClient.setQueryData<HomePayload>(queryKeys.home, (old) => {
        const current = old?.habits.find((item) => item.id === h.id) ?? h;
        return patchHabitInHome(old, h.id, applyOptimisticPatch(current));
      });

      const updated = await run((config) => api.reportHabit(config, h.id, type, { for_date: date }), {
        flash: { success: type === "check_in" ? "flash.checkInRecorded" : "flash.fallRecorded" },
        onError: () => {
          if (prevHabits) queryClient.setQueryData(queryKeys.habits, prevHabits);
          if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
        },
        onSuccess: (serverHabit) => {
          if (serverHabit) {
            queryClient.setQueryData<Habit[]>(queryKeys.habits, (old) => patchItemInList(old, h.id, serverHabit));
            queryClient.setQueryData<HomePayload>(queryKeys.home, (old) => patchHabitInHome(old, h.id, serverHabit));
          }
        },
      });
      return updated !== null;
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
    async (editingHabit: Habit, fields: HabitEditFields) => {
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

      await run((config) => api.updateHabit(config, editingHabit.id, body), {
        itemId: editingHabit.id,
        flash: { success: "flash.habitUpdated" },
        onSuccess: (updated) => {
          if (updated) {
            queryClient.setQueryData<Habit[]>(queryKeys.habits, (old) =>
              patchItemInList(old, editingHabit.id, updated)
            );
            queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
              patchHabitInHome(old, editingHabit.id, updated)
            );
          }
          queryClient.invalidateQueries({ queryKey: queryKeys.habits });
        },
      });
    },
    [run]
  );

  const handleDelete = useCallback(
    async (h: Habit) => {
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
    },
    [run]
  );

  return {
    run,
    busy,
    isPending,
    handleCheckIn,
    handleReportFall,
    handleBackfill,
    handleReset,
    handleSave,
    handleDelete,
  };
}
