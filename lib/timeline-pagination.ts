/** Cursor for timeline event pages: `event_date|id` (descending sort). */

export function buildTimelineCursor(event: { event_date: string; id: string }): string {
  return `${event.event_date}|${event.id}`;
}

export function parseTimelineCursor(cursor: string): { date: string; id: string } | null {
  const sep = cursor.indexOf("|");
  if (sep <= 0) return null;
  const date = cursor.slice(0, sep);
  const id = cursor.slice(sep + 1);
  if (!date || !id) return null;
  return { date, id };
}
