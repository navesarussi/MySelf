import type { TimelineEvent } from "@/lib/types";

export type LifePeriod = {
  id: string;
  title: string;
  start_date: string;
  end_date: string | null;
  parent_id: string | null;
  color: string;
  kind: "period" | "milestone_band" | "relationship";
  sort_order: number;
  created_at: string;
};

export function isPeriodActiveToday(period: LifePeriod, today = new Date().toISOString().slice(0, 10)) {
  if (period.start_date > today) return false;
  if (period.end_date && period.end_date < today) return false;
  return true;
}

export function eventInPeriod(eventDate: string, period: LifePeriod) {
  if (eventDate < period.start_date) return false;
  if (period.end_date && eventDate > period.end_date) return false;
  return true;
}

export function periodsForEvent(event: TimelineEvent, periods: LifePeriod[]) {
  return periods.filter((p) => eventInPeriod(event.event_date, p));
}

export function eventsForPeriod(events: TimelineEvent[], period: LifePeriod) {
  return events.filter((e) => eventInPeriod(e.event_date, period));
}

export function formatPeriodRange(period: LifePeriod) {
  const start = new Date(period.start_date).toLocaleDateString("he-IL");
  const end = period.end_date
    ? new Date(period.end_date).toLocaleDateString("he-IL")
    : "היום";
  return `${start} – ${end}`;
}
