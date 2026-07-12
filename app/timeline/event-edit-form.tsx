"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TimelineEvent } from "@/lib/types";
import { inputClass } from "@/components/ui";
import { deleteTimelineEvent, updateTimelineEvent } from "./actions";

function timeValue(event: TimelineEvent) {
  return event.event_time?.slice(0, 5) || "";
}

export function EventEditForm({
  event,
  onClose,
}: {
  event: TimelineEvent;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function afterSave() {
    onClose();
    router.refresh();
  }

  function onUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await updateTimelineEvent(fd);
      afterSave();
    });
  }

  function onDelete(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!confirm(`למחוק את האירוע "${event.title}"?`)) return;
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await deleteTimelineEvent(fd);
      afterSave();
    });
  }

  return (
    <div className="border-t border-border bg-bg/60 px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">עריכת אירוע: {event.title}</h3>
        <button type="button" onClick={onClose} className="text-xs text-muted hover:text-ink">
          סגור
        </button>
      </div>
      <form onSubmit={onUpdate} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="id" value={event.id} />
        <input type="text" name="title" defaultValue={event.title} required className={`${inputClass} sm:col-span-2`} />
        <label className="text-xs text-muted">
          תאריך
          <input type="date" name="event_date" defaultValue={event.event_date} required className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs text-muted">
          שעה (אופציונלי)
          <input type="time" name="event_time" defaultValue={timeValue(event)} className={`${inputClass} mt-1`} />
        </label>
        <input type="text" name="category" defaultValue={event.category || ""} placeholder="קטגוריה" className={inputClass} />
        <textarea
          name="description"
          defaultValue={event.description || ""}
          placeholder="תיאור"
          rows={2}
          className={`${inputClass} sm:col-span-2`}
        />
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "שומר…" : "שמירה"}
          </button>
        </div>
      </form>
      <form onSubmit={onDelete} className="mt-3">
        <input type="hidden" name="id" value={event.id} />
        <button type="submit" disabled={pending} className="text-sm text-warn hover:underline disabled:opacity-50">
          מחיקת אירוע
        </button>
      </form>
    </div>
  );
}
