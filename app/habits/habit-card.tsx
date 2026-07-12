"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Habit } from "@/lib/types";
import { Badge, inputClass } from "@/components/ui";
import { effectiveStreak } from "@/lib/habit-stats";
import { checkInHabit, resetHabit, deleteHabit, updateHabit, reportHabitFall } from "./actions";
import { Flame, RotateCcw, Trash2, Check, TrendingUp, ThumbsUp, AlertTriangle, Pencil } from "lucide-react";
import { useTranslations } from "@/components/locale-provider";

export function HabitCard({ habit, today }: { habit: Habit; today: string }) {
  const router = useRouter();
  const { t } = useTranslations();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  const checkedToday = habit.last_checked_on === today;
  const currentStreak = effectiveStreak(habit, today);
  const successDays = habit.total_success_days ?? 0;
  const failures = habit.failure_count ?? 0;

  function onEditSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await updateHabit(fd);
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="card flex flex-col gap-1.5 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium">{habit.name}</span>
            <Badge tone={habit.kind === "quit" ? "warn" : "good"}>
              {habit.kind === "quit" ? t("habits.quit") : t("habits.build")}
            </Badge>
          </div>
          {habit.target_note && (
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted">{habit.target_note}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded-md p-1 text-muted hover:text-accent"
            title={t("habits.editData")}
            aria-expanded={editing}
          >
            <Pencil size={13} />
          </button>
          <form action={deleteHabit}>
            <input type="hidden" name="id" value={habit.id} />
            <button className="rounded-md p-1 text-muted hover:text-warn" title={t("common.delete")}>
              <Trash2 size={13} />
            </button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1 text-center">
        <div className="rounded-md bg-border/25 px-1 py-1">
          <div className="flex items-center justify-center gap-0.5 text-[10px] text-muted">
            <Flame size={10} className="text-accent2" />
            <span className="truncate">{t("home.currentStreak")}</span>
          </div>
          <p className="text-sm font-bold leading-tight">{currentStreak}</p>
        </div>
        <div className="rounded-md bg-border/25 px-1 py-1">
          <div className="flex items-center justify-center gap-0.5 text-[10px] text-muted">
            <TrendingUp size={10} className="text-accent" />
            <span className="truncate">{t("home.bestStreak")}</span>
          </div>
          <p className="text-sm font-bold leading-tight">{habit.best_streak}</p>
        </div>
        <div className="rounded-md bg-border/25 px-1 py-1">
          <div className="flex items-center justify-center gap-0.5 text-[10px] text-muted">
            <ThumbsUp size={10} className="text-good" />
            <span className="truncate">{t("home.positiveDays")}</span>
          </div>
          <p className="text-sm font-bold leading-tight">{successDays}</p>
        </div>
        <div className="rounded-md bg-border/25 px-1 py-1">
          <div className="flex items-center justify-center gap-0.5 text-[10px] text-muted">
            <AlertTriangle size={10} className="text-warn" />
            <span className="truncate">{t("common.failures")}</span>
          </div>
          <p className="text-sm font-bold leading-tight">{failures}</p>
        </div>
      </div>

      {editing && (
        <form onSubmit={onEditSubmit} className="grid gap-1.5 rounded-lg border border-border/60 bg-bg/40 p-2.5 text-xs">
          <input type="hidden" name="id" value={habit.id} />
          <input type="text" name="name" defaultValue={habit.name} required className={inputClass} placeholder={t("habits.name")} />
          <select name="kind" defaultValue={habit.kind} className={inputClass}>
            <option value="build">{t("habits.build")}</option>
            <option value="quit">{t("habits.quit")}</option>
          </select>
          <input type="text" name="target_note" defaultValue={habit.target_note || ""} placeholder={t("habits.note")} className={inputClass} />
          <div className="grid grid-cols-2 gap-1.5">
            <label className="text-muted">
              {t("home.currentStreak")}
              <input type="number" name="streak_count" min={0} defaultValue={habit.streak_count} className={`${inputClass} mt-0.5`} />
            </label>
            <label className="text-muted">
              {t("home.bestStreak")}
              <input type="number" name="best_streak" min={0} defaultValue={habit.best_streak} className={`${inputClass} mt-0.5`} />
            </label>
            <label className="text-muted">
              {t("home.positiveDays")}
              <input type="number" name="total_success_days" min={0} defaultValue={habit.total_success_days ?? 0} className={`${inputClass} mt-0.5`} />
            </label>
            <label className="text-muted">
              {t("common.failures")}
              <input type="number" name="failure_count" min={0} defaultValue={habit.failure_count ?? 0} className={`${inputClass} mt-0.5`} />
            </label>
          </div>
          <label className="text-muted">
            {t("habits.lastCheck")}
            <input type="date" name="last_checked_on" defaultValue={habit.last_checked_on || ""} className={`${inputClass} mt-0.5`} />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-accent px-2.5 py-1 font-medium text-bg hover:opacity-90 disabled:opacity-50"
          >
            {pending ? t("common.saving") : t("habits.saveChanges")}
          </button>
        </form>
      )}

      <div className="border-t border-border/30 pt-1.5">
        <form action={resetHabit} className="inline">
          <input type="hidden" name="id" value={habit.id} />
          <button className="rounded-md p-1 text-muted hover:text-warn" title={t("habits.resetStreak")}>
            <RotateCcw size={13} />
          </button>
        </form>
      </div>
      {!checkedToday && (
        <div className="flex gap-2">
          <form action={checkInHabit} className="flex-1">
            <input type="hidden" name="id" value={habit.id} />
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-bg transition hover:opacity-90"
            >
              <Check size={12} />
              {t("habits.checkInToday")}
            </button>
          </form>
          <form action={reportHabitFall} className="flex-1">
            <input type="hidden" name="id" value={habit.id} />
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-1 rounded-md bg-warn/15 px-2 py-1 text-[11px] font-medium text-warn transition hover:bg-warn/25"
            >
              <AlertTriangle size={12} />
              {t("habits.reportFall")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
