"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Habit } from "@/lib/types";
import { Badge, inputClass, Modal, PrimaryActionButton, WarnActionButton, IconEditButton } from "@/components/ui";
import { effectiveStreak, normalizeReportTime } from "@/lib/habit-stats";
import { localeTag, formatLocaleDate } from "@/lib/i18n/core";
import { checkInHabit, resetHabit, deleteHabit, updateHabit, reportHabitFall } from "./actions";
import { Flame, RotateCcw, Trash2, Check, TrendingUp, ThumbsUp, AlertTriangle, Pencil, Clock } from "lucide-react";
import { useTranslations } from "@/components/locale-provider";

export function HabitCard({ habit, today }: { habit: Habit; today: string }) {
  const router = useRouter();
  const { t, locale } = useTranslations();
  const [editing, setEditing] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [pending, startTransition] = useTransition();

  const checkedToday = habit.last_checked_on === today;
  const currentStreak = effectiveStreak(habit, today);
  const successDays = habit.total_success_days ?? 0;
  const failures = habit.failure_count ?? 0;
  const reportTime = normalizeReportTime(habit.report_time);
  const lastReported = habit.last_reported_at
    ? new Date(habit.last_reported_at).toLocaleString(localeTag(locale), {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : habit.last_checked_on
      ? new Date(habit.last_checked_on).toLocaleDateString(localeTag(locale), {
          day: "numeric",
          month: "short",
        })
      : null;

  function onEditSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await updateHabit(fd);
      setEditing(false);
      router.refresh();
    });
  }

  function onDeleteSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!window.confirm(t("habits.confirmDelete", { name: habit.name }))) {
      e.preventDefault();
    }
  }

  const successTotal = successDays + failures;
  const successPct = successTotal > 0 ? Math.round((successDays / successTotal) * 100) : 0;
  const failurePct = 100 - successPct;
  const streakPct = habit.best_streak > 0 ? Math.min(100, Math.round((currentStreak / habit.best_streak) * 100)) : 0;

  return (
    <div
      className="card flex cursor-pointer flex-col gap-1.5 p-3 transition hover:border-accent/50"
      onClick={() => setViewing(true)}
      role="button"
      tabIndex={0}
      title={t("habits.viewDetails")}
    >
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
        <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <form action={resetHabit} className="inline">
            <input type="hidden" name="id" value={habit.id} />
            <button className="rounded-md p-1 text-muted transition hover:text-warn" title={t("habits.resetStreak")}>
              <RotateCcw size={13} />
            </button>
          </form>
          <IconEditButton title={t("habits.editOrDelete")} onClick={() => setEditing(true)}>
            <Pencil size={13} />
          </IconEditButton>
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

      <div className="flex items-center gap-1 text-[10px] text-muted">
        <Clock size={10} />
        <span>
          {t("habits.lastReported")}:{" "}
          {lastReported ?? t("habits.neverReported")}
        </span>
        {reportTime !== "00:00" && (
          <span className="ms-auto">{t("habits.reportOpensAt", { time: reportTime })}</span>
        )}
      </div>

      {!checkedToday && (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <form action={checkInHabit} className="flex-1">
            <input type="hidden" name="id" value={habit.id} />
            <PrimaryActionButton fullWidth>
              <Check size={12} />
              {t("habits.checkInToday")}
            </PrimaryActionButton>
          </form>
          <form action={reportHabitFall} className="flex-1">
            <input type="hidden" name="id" value={habit.id} />
            <WarnActionButton fullWidth>
              <AlertTriangle size={12} />
              {t("habits.reportFall")}
            </WarnActionButton>
          </form>
        </div>
      )}

      {editing && (
        <div onClick={(e) => e.stopPropagation()}>
          <Modal title={t("habits.editOrDelete")} onClose={() => setEditing(false)}>
            <form onSubmit={onEditSubmit} className="grid gap-1.5 text-xs">
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
              <div className="grid grid-cols-2 gap-1.5">
                <label className="text-muted">
                  {t("habits.lastCheck")}
                  <input type="date" name="last_checked_on" defaultValue={habit.last_checked_on || ""} className={`${inputClass} mt-0.5`} />
                </label>
                <label className="text-muted">
                  {t("habits.reportTime")}
                  <input type="time" name="report_time" defaultValue={reportTime} className={`${inputClass} mt-0.5`} />
                </label>
              </div>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-accent px-2.5 py-1 font-medium text-bg hover:opacity-90 disabled:opacity-50"
              >
                {pending ? t("common.saving") : t("habits.saveChanges")}
              </button>
            </form>
            <form action={deleteHabit} onSubmit={onDeleteSubmit} className="mt-2 border-t border-border/60 pt-2">
              <input type="hidden" name="id" value={habit.id} />
              <WarnActionButton fullWidth title={t("common.delete")}>
                <Trash2 size={13} />
                {t("common.delete")}
              </WarnActionButton>
            </form>
          </Modal>
        </div>
      )}

      {viewing && (
        <div onClick={(e) => e.stopPropagation()}>
          <Modal title={habit.name} onClose={() => setViewing(false)}>
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={habit.kind === "quit" ? "warn" : "good"}>
                  {habit.kind === "quit" ? t("habits.quit") : t("habits.build")}
                </Badge>
                <span className="text-xs text-muted">
                  {t("habits.created")}: {formatLocaleDate(locale, habit.created_at)}
                </span>
              </div>

              {habit.target_note && <p className="text-xs leading-snug text-muted">{habit.target_note}</p>}

              <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                <div className="rounded-md bg-border/25 px-1 py-1.5">
                  <div className="flex items-center justify-center gap-0.5 text-[10px] text-muted">
                    <Flame size={10} className="text-accent2" />
                    <span className="truncate">{t("home.currentStreak")}</span>
                  </div>
                  <p className="text-base font-bold leading-tight">{currentStreak}</p>
                </div>
                <div className="rounded-md bg-border/25 px-1 py-1.5">
                  <div className="flex items-center justify-center gap-0.5 text-[10px] text-muted">
                    <TrendingUp size={10} className="text-accent" />
                    <span className="truncate">{t("home.bestStreak")}</span>
                  </div>
                  <p className="text-base font-bold leading-tight">{habit.best_streak}</p>
                </div>
                <div className="rounded-md bg-border/25 px-1 py-1.5">
                  <div className="flex items-center justify-center gap-0.5 text-[10px] text-muted">
                    <ThumbsUp size={10} className="text-good" />
                    <span className="truncate">{t("home.positiveDays")}</span>
                  </div>
                  <p className="text-base font-bold leading-tight">{successDays}</p>
                </div>
                <div className="rounded-md bg-border/25 px-1 py-1.5">
                  <div className="flex items-center justify-center gap-0.5 text-[10px] text-muted">
                    <AlertTriangle size={10} className="text-warn" />
                    <span className="truncate">{t("common.failures")}</span>
                  </div>
                  <p className="text-base font-bold leading-tight">{failures}</p>
                </div>
              </div>

              <div className="text-[11px] text-muted">
                {t("habits.lastReported")}: {lastReported ?? t("habits.neverReported")}
                {reportTime !== "00:00" && (
                  <span className="ms-2">{t("habits.reportOpensAt", { time: reportTime })}</span>
                )}
              </div>

              {habit.best_streak > 0 && (
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
                    <span>{t("habits.streakProgress")}</span>
                    <span className="font-medium text-ink">
                      {currentStreak}/{habit.best_streak}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-border/40">
                    <div
                      className="h-full rounded-full bg-accent2 transition-all"
                      style={{ width: `${streakPct}%` }}
                    />
                  </div>
                </div>
              )}

              {successTotal > 0 && (
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
                    <span>{t("habits.successVsFailure")}</span>
                  </div>
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-border/40">
                    <div className="h-full bg-good" style={{ width: `${successPct}%` }} />
                    <div className="h-full bg-warn" style={{ width: `${failurePct}%` }} />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-muted">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-good" />
                      {t("habits.successDays")}: {successDays}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-warn" />
                      {t("habits.failureDays")}: {failures}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </Modal>
        </div>
      )}
    </div>
  );
}
