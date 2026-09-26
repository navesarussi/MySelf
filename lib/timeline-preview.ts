import { displayDescription, displayTitle } from "@/lib/timeline-display";
import type { TimelineEvent } from "@/lib/types";

const DESCRIPTION_PREVIEW_CHARS = 200;

/** Columns the list payload is built from. */
export const TIMELINE_LIST_COLUMNS =
  "id, event_date, event_time, title, title_override, description, description_override, category, min_zoom, source, created_at";

/**
 * The shape the timeline list and canvas need, and nothing else. Overrides are
 * merged into `title` / `description` (description truncated; detail views
 * fetch the full row), and sync bookkeeping (`google_event_id`, `synced_at`,
 * `hidden_at`) is dropped. The whole timeline ships in one response, so every
 * byte here is paid thousands of times.
 */
export type TimelineListEvent = Pick<
  TimelineEvent,
  "id" | "event_date" | "event_time" | "title" | "description" | "category" | "min_zoom" | "source" | "created_at"
>;

export function leanTimelineEventForList(
  event: Pick<TimelineEvent, keyof TimelineListEvent | "title_override" | "description_override">
): TimelineListEvent {
  const merged = displayDescription(event);
  return {
    id: event.id,
    event_date: event.event_date,
    event_time: event.event_time,
    title: displayTitle(event),
    description: merged ? merged.slice(0, DESCRIPTION_PREVIEW_CHARS) : null,
    category: event.category,
    min_zoom: event.min_zoom,
    source: event.source,
    created_at: event.created_at,
  };
}
