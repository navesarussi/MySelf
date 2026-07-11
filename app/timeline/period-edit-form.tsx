"use client";

import type { LifePeriod } from "@/lib/life-periods";
import { inputClass } from "@/components/ui";
import { deleteLifePeriod, updateLifePeriod } from "./actions";

export function PeriodEditForm({
  period,
  onClose,
}: {
  period: LifePeriod;
  onClose: () => void;
}) {
  return (
    <div className="border-t border-border bg-bg/60 px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">עריכת תקופה: {period.title}</h3>
        <button type="button" onClick={onClose} className="text-xs text-muted hover:text-ink">
          סגור
        </button>
      </div>
      <form action={updateLifePeriod} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="id" value={period.id} />
        <input type="text" name="title" defaultValue={period.title} required className={`${inputClass} sm:col-span-2`} />
        <label className="text-xs text-muted">
          התחלה
          <input type="date" name="start_date" defaultValue={period.start_date} required className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs text-muted">
          סיום (ריק = עד היום)
          <input type="date" name="end_date" defaultValue={period.end_date || ""} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs text-muted">
          סוג
          <select name="kind" defaultValue={period.kind} className={`${inputClass} mt-1`}>
            <option value="period">תקופה</option>
            <option value="relationship">זוגיות</option>
            <option value="milestone_band">אבן דרך</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          צבע
          <input type="color" name="color" defaultValue={period.color} className="mt-1 h-10 w-full rounded-lg border bg-transparent" />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90">
            שמירה
          </button>
        </div>
      </form>
      <form
        action={deleteLifePeriod}
        className="mt-3"
        onSubmit={(e) => {
          if (!confirm(`למחוק את התקופה "${period.title}"?`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={period.id} />
        <button type="submit" className="text-sm text-warn hover:underline">
          מחיקת תקופה
        </button>
      </form>
    </div>
  );
}
