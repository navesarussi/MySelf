import type { InfiniteData } from "@tanstack/react-query";
import type { TimelineEventsPage } from "../api/resources";
import type { TimelineEvent } from "@/lib/types";
import { patchItemInList, removeItemFromList } from "./patch";

export function flattenTimelinePages(
  data: InfiniteData<TimelineEventsPage> | undefined
): TimelineEvent[] {
  if (!data) return [];
  return data.pages.flatMap((page) => page.events);
}

export function patchTimelineEventsCache(
  old: InfiniteData<TimelineEventsPage> | undefined,
  id: string,
  patch: Partial<TimelineEvent>
): InfiniteData<TimelineEventsPage> | undefined {
  if (!old) return undefined;
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      events: patchItemInList(page.events, id, patch),
    })),
  };
}

export function removeTimelineEventFromCache(
  old: InfiniteData<TimelineEventsPage> | undefined,
  id: string
): InfiniteData<TimelineEventsPage> | undefined {
  if (!old) return undefined;
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      events: removeItemFromList(page.events, id),
    })),
  };
}
