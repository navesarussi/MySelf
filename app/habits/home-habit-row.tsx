import type { Habit } from "@/lib/types";
import { Badge } from "@/components/ui";
import { effectiveStreak } from "@/lib/habit-stats";
import { checkInHabit, reportHabitFall } from "./actions";
import { Check, AlertTriangle, TrendingUp, ThumbsUp } from "lucide-react";
import { getTranslations } from "@/lib/i18n";

export async function HomeHabitRow({ habit, today }: { habit: Habit; today: string }) {
  const { t } = await getTranslations();
  const streak = effectiveStreak(habit, today);
  const reportedToday = habit.last_checked_on === today;

  return (
    <li className="rounded-lg bg-border/20 px-2.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{habit.name}</span>
        <Badge tone={streak > 0 ? "good" : "default"}>
          {streak} {t("common.streak")}
        </Badge>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-muted">
        <span className="flex items-center gap-1">
          <TrendingUp size={11} /> {t("common.peak")} {habit.best_streak}
        </span>
        <span className="flex items-center gap-1">
          <ThumbsUp size={11} /> {habit.total_success_days ?? 0} {t("common.positives")}
        </span>
        <span className="flex items-center gap-1">
          <AlertTriangle size={11} /> {habit.failure_count ?? 0} {t("common.failures")}
        </span>
      </div>
      <div className="mt-2 flex gap-2">
        <form action={checkInHabit} className="flex-1">
          <input type="hidden" name="id" value={habit.id} />
          <button
            type="submit"
            disabled={reportedToday}
            className={`flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
              reportedToday ? "bg-good/15 text-good" : "bg-accent text-bg hover:opacity-90"
            } disabled:cursor-default`}
          >
            <Check size={12} />
            {reportedToday ? t("habits.checkedToday") : t("habits.checkInToday")}
          </button>
        </form>
        <form action={reportHabitFall} className="flex-1">
          <input type="hidden" name="id" value={habit.id} />
          <button
            type="submit"
            disabled={reportedToday}
            className={`flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
              reportedToday ? "bg-border/30 text-muted" : "bg-warn/15 text-warn hover:bg-warn/25"
            } disabled:cursor-default`}
          >
            <AlertTriangle size={12} />
            {t("habits.reportFall")}
          </button>
        </form>
      </div>
    </li>
  );
}
