import type { TimelineEvent } from "@/lib/types";
import { patchItemInList, removeItemFromList } from "./patch";

/**
 * The timeline cache is one flat array of every event (see useTimelineEvents).
 * Mutations patch it in place instead of refetching thousands of rows.
 */

export function patchTimelineEventsCache(
  old: TimelineEvent[] | undefined,
  id: string,
  patch: Partial<TimelineEvent>
): TimelineEvent[] | undefined {
  return old ? patchItemInList(old, id, patch) : old;
}

export function removeTimelineEventFromCache(
  old: TimelineEvent[] | undefined,
  id: string
): TimelineEvent[] | undefined {
  return old ? removeItemFromList(old, id) : old;
}

export function addTimelineEventToCache(
  old: TimelineEvent[] | undefined,
  event: TimelineEvent
): TimelineEvent[] | undefined {
  if (!old) return old;
  return [event, ...old.filter((e) => e.id !== event.id)];
}
