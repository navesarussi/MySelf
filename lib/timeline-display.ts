import type { TimelineEvent } from "@/lib/types";

export function isGoogleCalendarEvent(event: Pick<TimelineEvent, "source">) {
  return event.source === "google_calendar";
}

export function displayTitle(event: Pick<TimelineEvent, "title" | "title_override">) {
  return event.title_override ?? event.title;
}

export function displayDescription(
  event: Pick<TimelineEvent, "description" | "description_override">
) {
  return event.description_override ?? event.description;
}

export function isEventHidden(event: Pick<TimelineEvent, "hidden_at">) {
  return event.hidden_at != null;
}
