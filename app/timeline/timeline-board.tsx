"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft } from "lucide-react";
import type { TimelineEvent } from "@/lib/types";
import {
  type LifePeriod,
  eventsForPeriod,
  formatPeriodRange,
  isPeriodActiveToday,
} from "@/lib/life-periods";
import { Badge, EmptyState } from "@/components/ui";
import { EventCard, UnassignedSection } from "./event-card";

export function TimelineBoard({
  events,
  periods,
}: {
  events: TimelineEvent[];
  periods: LifePeriod[];
}) {
  const activeIds = useMemo(
    () => new Set(periods.filter((p) => isPeriodActiveToday(p)).map((p) => p.id)),
    [periods]
  );
  const [open, setOpen] = useState<Set<string>>(() => new Set(activeIds));
  const roots = periods.filter((p) => !p.parent_id);
  const childrenOf = (id: string) => periods.filter((p) => p.parent_id === id);

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (events.length === 0 && periods.length === 0) {
    return <EmptyState text="אין עדיין אירועים או תקופות בציר הזמן." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOpen(new Set(periods.map((p) => p.id)))}
          className="rounded-full bg-border/50 px-3 py-1 text-xs text-muted hover:text-ink"
        >
          פתח הכל
        </button>
        <button
          type="button"
          onClick={() => setOpen(new Set())}
          className="rounded-full bg-border/50 px-3 py-1 text-xs text-muted hover:text-ink"
        >
          סגור הכל
        </button>
        <span className="self-center text-xs text-muted">
          תקופות יכולות לחפוף — אותו אירוע יופיע בכמה מקומות
        </span>
      </div>

      <div className="space-y-3">
        {roots.map((period) => (
          <PeriodBlock
            key={period.id}
            period={period}
            depth={0}
            open={open}
            toggle={toggle}
            childrenOf={childrenOf}
            events={events}
            allPeriods={periods}
          />
        ))}
      </div>

      <UnassignedSection events={events} periods={periods} />
    </div>
  );
}

function PeriodBlock({
  period,
  depth,
  open,
  toggle,
  childrenOf,
  events,
  allPeriods,
}: {
  period: LifePeriod;
  depth: number;
  open: Set<string>;
  toggle: (id: string) => void;
  childrenOf: (id: string) => LifePeriod[];
  events: TimelineEvent[];
  allPeriods: LifePeriod[];
}) {
  const isOpen = open.has(period.id);
  const kids = childrenOf(period.id);
  const periodEvents = eventsForPeriod(events, period);
  const active = isPeriodActiveToday(period);

  return (
    <section className="card overflow-hidden" style={{ marginInlineStart: depth ? depth * 12 : 0 }}>
      <button
        type="button"
        onClick={() => toggle(period.id)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start hover:bg-border/20"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: period.color }} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{period.title}</h2>
              {active && <Badge tone="good">פעילה</Badge>}
              {period.kind === "relationship" && <Badge tone="accent">זוגיות</Badge>}
            </div>
            <p className="text-xs text-muted">
              {formatPeriodRange(period)} · {periodEvents.length} אירועים
            </p>
          </div>
        </div>
        {isOpen ? <ChevronDown size={18} className="text-muted" /> : <ChevronLeft size={18} className="text-muted" />}
      </button>

      {isOpen && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          {kids.map((child) => (
            <div key={child.id} className="mb-3">
              <PeriodBlock
                period={child}
                depth={depth + 1}
                open={open}
                toggle={toggle}
                childrenOf={childrenOf}
                events={events}
                allPeriods={allPeriods}
              />
            </div>
          ))}
          {periodEvents.length === 0 ? (
            <p className="text-sm text-muted">אין אירועים בתקופה הזו עדיין.</p>
          ) : (
            <ol className="relative space-y-4 border-e-2 border-border pe-5">
              {periodEvents.map((ev) => (
                <EventCard key={`${period.id}-${ev.id}`} event={ev} allPeriods={allPeriods} />
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
