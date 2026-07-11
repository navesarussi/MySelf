import { Trash2 } from "lucide-react";
import type { TimelineEvent } from "@/lib/types";
import { type LifePeriod, periodsForEvent } from "@/lib/life-periods";
import { Badge } from "@/components/ui";
import { deleteTimelineEvent } from "./actions";

export function EventCard({
  event,
  allPeriods,
}: {
  event: TimelineEvent;
  allPeriods: LifePeriod[];
}) {
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
        className={`rounded-xl border p-3 ${
          milestone ? "border-accent2/40 bg-accent2/5" : "border-border bg-bg/40"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted">
                {new Date(event.event_date).toLocaleDateString("he-IL")}
              </span>
              {event.category && (
                <Badge tone={milestone ? "accent" : "default"}>{event.category}</Badge>
              )}
            </div>
            <h3 className="mt-1 font-semibold">{event.title}</h3>
            {event.description && <p className="mt-1 text-sm text-muted">{event.description}</p>}
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span
                    key={t.id}
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ background: `${t.color}22`, color: t.color }}
                  >
                    {t.title}
                  </span>
                ))}
              </div>
            )}
          </div>
          <form action={deleteTimelineEvent}>
            <input type="hidden" name="id" value={event.id} />
            <button className="rounded-lg p-1.5 text-muted hover:text-warn" title="מחיקה">
              <Trash2 size={16} />
            </button>
          </form>
        </div>
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
  const orphan = events.filter((e) => periodsForEvent(e, periods).length === 0);
  if (orphan.length === 0) return null;

  return (
    <section className="card p-4">
      <h2 className="mb-3 font-semibold">ללא תקופה משויכת</h2>
      <ol className="space-y-3">
        {orphan.map((ev) => (
          <EventCard key={ev.id} event={ev} allPeriods={periods} />
        ))}
      </ol>
    </section>
  );
}
