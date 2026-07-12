"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { SubmitButton, inputClass } from "@/components/ui";
import { useTranslations } from "@/components/locale-provider";
import { addTimelineEvent, addLifePeriod } from "./actions";

type AddKind = "event" | "period";

export function TimelineAddModal({ kind }: { kind: AddKind }) {
  const { t } = useTranslations();
  const router = useRouter();

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  function close() {
    router.replace("/timeline");
  }

  const title = kind === "event" ? t("timeline.addEvent") : t("timeline.addPeriod");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={close}
      role="presentation"
    >
      <div
        className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="timeline-add-title"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id="timeline-add-title" className="text-lg font-semibold">
            {title}
          </h2>
          <button type="button" onClick={close} className="text-sm text-muted hover:text-ink">
            {t("common.close")}
          </button>
        </div>

        {kind === "event" ? (
          <form action={addTimelineEvent} className="grid gap-2 sm:grid-cols-2">
            <input type="date" name="event_date" required className={inputClass} />
            <input type="time" name="event_time" className={inputClass} title={t("timeline.timeOptional")} />
            <input type="text" name="category" placeholder={t("timeline.categoryPlaceholder")} className={inputClass} />
            <input
              type="text"
              name="title"
              placeholder={t("timeline.eventTitlePlaceholder")}
              required
              className={`${inputClass} sm:col-span-2`}
            />
            <textarea
              name="description"
              placeholder={t("timeline.descriptionPlaceholder")}
              rows={2}
              className={`${inputClass} sm:col-span-2`}
            />
            <div className="sm:col-span-2">
              <SubmitButton>{t("timeline.addEvent")}</SubmitButton>
            </div>
          </form>
        ) : (
          <form action={addLifePeriod} className="grid gap-2 sm:grid-cols-2">
            <input
              type="text"
              name="title"
              placeholder={t("timeline.periodNamePlaceholder")}
              required
              className={`${inputClass} sm:col-span-2`}
            />
            <input type="date" name="start_date" required className={inputClass} />
            <input type="date" name="end_date" className={inputClass} title={t("timeline.endDateHint")} />
            <input type="color" name="color" defaultValue="#7dd3c0" className="h-10 w-full rounded-lg border bg-transparent" />
            <div className="sm:col-span-2">
              <SubmitButton>{t("timeline.addPeriodBtn")}</SubmitButton>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
