"use client";

import { AddFormToggle } from "@/components/add-form-toggle";
import { SubmitButton, inputClass } from "@/components/ui";
import { useTranslations } from "@/components/locale-provider";
import { addTimelineEvent, addLifePeriod } from "./actions";

export function TimelineAddForms({
  openEvent = false,
  openPeriod = false,
}: {
  openEvent?: boolean;
  openPeriod?: boolean;
}) {
  const { t } = useTranslations();

  return (
    <div className="mb-8 space-y-3">
      <AddFormToggle
        label={t("timeline.addEvent")}
        defaultOpen={openEvent}
        id="add-form-event"
      >
        <form action={addTimelineEvent} className="card grid gap-3 p-4 sm:grid-cols-2">
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
      </AddFormToggle>

      <AddFormToggle
        label={t("timeline.addPeriod")}
        defaultOpen={openPeriod}
        id="add-form-period"
      >
        <form action={addLifePeriod} className="card grid gap-3 p-4 sm:grid-cols-2">
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
      </AddFormToggle>
    </div>
  );
}
