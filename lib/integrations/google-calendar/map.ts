import type { GoogleCalendarEvent, MappedGoogleEvent } from "./types";

function parseStart(start: GoogleCalendarEvent["start"]) {
  if (start.date) {
    return { event_date: start.date, event_time: null };
  }
  if (start.dateTime) {
    const match = start.dateTime.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
    if (match) {
      return { event_date: match[1], event_time: match[2] };
    }
    const d = new Date(start.dateTime);
    return {
      event_date: d.toISOString().slice(0, 10),
      event_time: d.toISOString().slice(11, 19),
    };
  }
  return null;
}

export function mapGoogleEvent(event: GoogleCalendarEvent): MappedGoogleEvent | null {
  if (event.status === "cancelled") return null;
  const parsed = parseStart(event.start);
  if (!parsed) return null;

  return {
    google_event_id: event.id,
    title: event.summary?.trim() || "(ללא כותרת)",
    description: event.description?.trim() || null,
    event_date: parsed.event_date,
    event_time: parsed.event_time,
    category: "יומן",
    source: "google_calendar",
  };
}
