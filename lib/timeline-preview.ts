import { displayDescription } from "@/lib/timeline-display";
import type { TimelineEvent } from "@/lib/types";

const DESCRIPTION_PREVIEW_CHARS = 200;

/** Truncate merged description for list payloads; detail views fetch the full row. */
export function leanTimelineEventForList(event: TimelineEvent): TimelineEvent {
  const merged = displayDescription(event);
  const preview = merged ? merged.slice(0, DESCRIPTION_PREVIEW_CHARS) : null;
  return {
    ...event,
    description: preview,
    description_override: null,
  };
}
