"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Habit } from "@/lib/types";
import { inputClass } from "@/components/ui";
import { updateHabit } from "./actions";
import { Pencil } from "lucide-react";

export function HabitEditForm({ habit }: { habit: Habit }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await updateHabit(fd);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-muted hover:text-accent [&::-webkit-details-marker]:hidden">
        <Pencil size={12} /> עריכת נתונים
      </summary>
      <form onSubmit={onSubmit} className="mt-3 grid gap-2 rounded-lg border border-border/60 bg-bg/40 p-3 text-xs">
        <input type="hidden" name="id" value={habit.id} />
        <input type="text" name="name" defaultValue={habit.name} required className={inputClass} placeholder="שם" />
        <select name="kind" defaultValue={habit.kind} className={inputClass}>
          <option value="build">לבנות</option>
          <option value="quit">להיגמל</option>
        </select>
        <input type="text" name="target_note" defaultValue={habit.target_note || ""} placeholder="הערה" className={inputClass} />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-muted">
            רצף נוכחי
            <input type="number" name="streak_count" min={0} defaultValue={habit.streak_count} className={`${inputClass} mt-0.5`} />
          </label>
          <label className="text-muted">
            שיא רצף
            <input type="number" name="best_streak" min={0} defaultValue={habit.best_streak} className={`${inputClass} mt-0.5`} />
          </label>
          <label className="text-muted">
            ימים חיוביים
            <input type="number" name="total_success_days" min={0} defaultValue={habit.total_success_days ?? 0} className={`${inputClass} mt-0.5`} />
          </label>
          <label className="text-muted">
            נפילות
            <input type="number" name="failure_count" min={0} defaultValue={habit.failure_count ?? 0} className={`${inputClass} mt-0.5`} />
          </label>
        </div>
        <label className="text-muted">
          סימון אחרון
          <input
            type="date"
            name="last_checked_on"
            defaultValue={habit.last_checked_on || ""}
            className={`${inputClass} mt-0.5`}
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-3 py-1.5 font-medium text-bg hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "שומר…" : "שמירת שינויים"}
        </button>
      </form>
    </details>
  );
}
