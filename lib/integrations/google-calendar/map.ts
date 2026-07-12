import type { TimelineZoomLevel } from "@/lib/timeline-zoom";
import { DAY_MS } from "@/lib/timeline-layout";
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

function parseInstant(field: { dateTime?: string; date?: string }) {
  if (field.date) {
    return { ms: new Date(`${field.date}T00:00:00`).getTime(), allDay: true };
  }
  if (field.dateTime) {
    return { ms: new Date(field.dateTime).getTime(), allDay: false };
  }
  return null;
}

/** All-day → days; timed under 24h → hours; longer timed spans → days. */
export function minZoomForGoogleEvent(
  event: Pick<GoogleCalendarEvent, "start" | "end">
): TimelineZoomLevel {
  if (event.start.date) return "days";

  const start = parseInstant(event.start);
  if (!start || start.allDay) return "days";

  const end = event.end ? parseInstant(event.end) : null;
  if (!end) return "hours";

  return end.ms - start.ms >= DAY_MS ? "days" : "hours";
}

export function mapGoogleEvent(event: GoogleCalendarEvent): MappedGoogleEvent | null {
  if (event.status === "cancelled") return null;
  if (event.eventType === "birthday") return null;
  const parsed = parseStart(event.start);
  if (!parsed) return null;

  return {
    google_event_id: event.id,
    title: event.summary?.trim() || "(ללא כותרת)",
    description: event.description?.trim() || null,
    event_date: parsed.event_date,
    event_time: parsed.event_time,
    min_zoom: minZoomForGoogleEvent(event),
    category: "יומן",
    source: "google_calendar",
  };
}
