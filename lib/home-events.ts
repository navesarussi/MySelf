export type HomeEventLike = {
  id: string;
  event_date: string;
  event_time: string | null;
  hidden_at?: string | null;
};

export type HomeEventsMode = "upcoming" | "recent";

function eventInstant(e: HomeEventLike): Date {
  const t = e.event_time?.trim();
  if (t) return new Date(`${e.event_date}T${t.length === 5 ? `${t}:00` : t}`);
  return new Date(`${e.event_date}T23:59:59`);
}

function todayISO(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function selectHomeEvents(
  events: HomeEventLike[],
  now: Date,
  limit = 10
): { mode: HomeEventsMode; events: HomeEventLike[] } {
  const visible = events.filter((e) => !e.hidden_at);
  const year = now.getFullYear();
  const today = todayISO(now);

  const hasUpcomingThisYear = visible.some((e) => {
    if (e.event_date < today) return false;
    return Number(e.event_date.slice(0, 4)) === year;
  });

  if (hasUpcomingThisYear) {
    const upcoming = visible
      .filter((e) => eventInstant(e) >= now)
      .sort((a, b) => eventInstant(a).getTime() - eventInstant(b).getTime())
      .slice(0, limit);
    return { mode: "upcoming", events: upcoming };
  }

  const recent = visible
    .filter((e) => eventInstant(e) < now)
    .sort((a, b) => eventInstant(b).getTime() - eventInstant(a).getTime())
    .slice(0, limit);
  return { mode: "recent", events: recent };
}
