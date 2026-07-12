"use client";

import { useState } from "react";
import { Pencil, Trash2, Calendar } from "lucide-react";
import type { TimelineEvent } from "@/lib/types";
import { formatEventWhen } from "@/lib/timeline-layout";
import { type LifePeriod, periodsForEvent } from "@/lib/life-periods";
import { displayDescription, displayTitle, isGoogleCalendarEvent } from "@/lib/timeline-display";
import { Badge } from "@/components/ui";
import { useTranslations } from "@/components/locale-provider";
import { deleteTimelineEvent } from "./actions";
import { EventEditForm } from "./event-edit-form";

export function EventCard({
  event,
  allPeriods,
  defaultEditing = false,
}: {
  event: TimelineEvent;
  allPeriods: LifePeriod[];
  defaultEditing?: boolean;
}) {
  const { t, locale } = useTranslations();
  const [editing, setEditing] = useState(defaultEditing);
  const tags = periodsForEvent(event, allPeriods);
  const milestone = event.category === "אבן דרך";

  return (
    <li className="relative">
      <span
        className={`absolute -end-[27px] top-2 h-3 w-3 rounded-full ${
          milestone ? "bg-accent2 ring-4 ring-accent2/20" : "bg-accent"
        }`}
      />
      <div
        className={`rounded-lg border ${
          milestone ? "border-accent2/40 bg-accent2/5" : "border-border bg-bg/40"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2 p-2.5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted">{formatEventWhen(event, locale)}</span>
              {isGoogleCalendarEvent(event) && (
                <Calendar size={14} className="text-muted" aria-label={t("common.fromGoogleCalendar")} />
              )}
              {event.category && (
                <Badge tone={milestone ? "accent" : "default"}>
                  {milestone ? t("common.milestone") : event.category}
                </Badge>
              )}
            </div>
            <h3 className="mt-1 font-semibold">{displayTitle(event)}</h3>
            {displayDescription(event) && (
              <p className="mt-1 text-sm text-muted">{displayDescription(event)}</p>
            )}
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ background: `${tag.color}22`, color: tag.color }}
                  >
                    {tag.title}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="rounded-lg p-1.5 text-muted hover:text-accent"
              title={t("common.edit")}
              aria-expanded={editing}
            >
              <Pencil size={16} />
            </button>
            <form action={deleteTimelineEvent}>
              <input type="hidden" name="id" value={event.id} />
              <button className="rounded-lg p-1.5 text-muted hover:text-warn" title={t("common.delete")}>
                <Trash2 size={16} />
              </button>
            </form>
          </div>
        </div>
        {editing && <EventEditForm event={event} onClose={() => setEditing(false)} />}
      </div>
    </li>
  );
}

export function UnassignedSection({
  events,
  periods,
}: {
  events: TimelineEvent[];
  periods: LifePeriod[];
}) {
  const { t } = useTranslations();
  const orphan = events.filter((e) => periodsForEvent(e, periods).length === 0);
  if (orphan.length === 0) return null;

  return (
    <section className="card p-3">
      <h2 className="mb-3 font-semibold">{t("timeline.unassigned")}</h2>
      <ol className="space-y-3">
        {orphan.map((ev) => (
          <EventCard key={ev.id} event={ev} allPeriods={periods} />
        ))}
      </ol>
    </section>
  );
}
