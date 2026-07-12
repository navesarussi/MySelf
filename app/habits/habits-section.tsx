import type { Habit } from "@/lib/types";
import { Badge, SubmitButton, inputClass } from "@/components/ui";
import { effectiveStreak, todayISO } from "@/lib/habit-stats";
import { addHabit, checkInHabit, resetHabit, deleteHabit } from "./actions";
import { HabitEditForm } from "./habit-edit-form";
import { Flame, RotateCcw, Trash2, Check, TrendingUp, ThumbsUp, AlertTriangle } from "lucide-react";

export function HabitsSection({ habits }: { habits: Habit[] }) {
  const today = todayISO();

  return (
    <section className="mb-10">
      <h2 className="mb-3 text-lg font-bold">הרגלים ומעקב יומי</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        {habits.map((h) => {
          const checkedToday = h.last_checked_on === today;
          const currentStreak = effectiveStreak(h, today);
          const successDays = h.total_success_days ?? 0;
          const failures = h.failure_count ?? 0;

          return (
            <div key={h.id} className="card flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{h.name}</span>
                    <Badge tone={h.kind === "quit" ? "warn" : "good"}>
                      {h.kind === "quit" ? "להיגמל" : "לבנות"}
                    </Badge>
                  </div>
                  {h.target_note && <p className="mt-1 text-xs text-muted">{h.target_note}</p>}
                </div>
                <form action={deleteHabit}>
                  <input type="hidden" name="id" value={h.id} />
                  <button className="p-1 text-muted hover:text-warn" title="מחיקה">
                    <Trash2 size={14} />
                  </button>
                </form>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-border/30 px-2.5 py-2">
                  <div className="flex items-center gap-1 text-xs text-muted">
                    <Flame size={12} className="text-accent2" /> רצף נוכחי
                  </div>
                  <p className="mt-0.5 text-lg font-bold">{currentStreak}</p>
                </div>
                <div className="rounded-lg bg-border/30 px-2.5 py-2">
                  <div className="flex items-center gap-1 text-xs text-muted">
                    <TrendingUp size={12} className="text-accent" /> שיא רצף
                  </div>
                  <p className="mt-0.5 text-lg font-bold">{h.best_streak}</p>
                </div>
                <div className="rounded-lg bg-border/30 px-2.5 py-2">
                  <div className="flex items-center gap-1 text-xs text-muted">
                    <ThumbsUp size={12} className="text-good" /> ימים חיוביים
                  </div>
                  <p className="mt-0.5 text-lg font-bold">{successDays}</p>
                </div>
                <div className="rounded-lg bg-border/30 px-2.5 py-2">
                  <div className="flex items-center gap-1 text-xs text-muted">
                    <AlertTriangle size={12} className="text-warn" /> נפילות
                  </div>
                  <p className="mt-0.5 text-lg font-bold">{failures}</p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-1">
                <HabitEditForm habit={h} />
                <form action={resetHabit}>
                  <input type="hidden" name="id" value={h.id} />
                  <button
                    className="rounded-lg p-1.5 text-muted hover:text-warn"
                    title="איפוס רצף (נשברה הרצף)"
                  >
                    <RotateCcw size={15} />
                  </button>
                </form>
                <form action={checkInHabit}>
                  <input type="hidden" name="id" value={h.id} />
                  <button
                    disabled={checkedToday}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                      checkedToday
                        ? "bg-good/15 text-good"
                        : "bg-accent text-bg hover:opacity-90"
                    }`}
                  >
                    <Check size={13} />
                    {checkedToday ? "סומן היום" : "סימון להיום"}
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-muted">+ הוספת הרגל חדש</summary>
        <form action={addHabit} className="card mt-3 grid gap-3 p-4 sm:grid-cols-2">
          <input type="text" name="name" placeholder="שם ההרגל" required className={inputClass} />
          <select name="kind" className={inputClass} defaultValue="build">
            <option value="build">לבנות (הרגל חדש)</option>
            <option value="quit">להיגמל (התמכרות/הרגל רע)</option>
          </select>
          <input
            type="text"
            name="target_note"
            placeholder="יעד / הערה (אופציונלי)"
            className={`${inputClass} sm:col-span-2`}
          />
          <div className="sm:col-span-2">
            <SubmitButton>הוספה</SubmitButton>
          </div>
        </form>
      </details>
    </section>
  );
}
