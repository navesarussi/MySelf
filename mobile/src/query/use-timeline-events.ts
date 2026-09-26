import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../session";
import { ApiError } from "../api/client";
import { api } from "../api/resources";
import type { TimelineEvent } from "@/lib/types";
import { queryKeys } from "./keys";

const NO_EVENTS: TimelineEvent[] = [];

/**
 * Every timeline event as one array — the canvas lays out and clusters the
 * whole life, so it needs all of it, not a first page.
 *
 * The array is the query's own data, so its identity only changes when the
 * events do: the chronological buckets and the canvas layout are memoized on
 * it. (The infinite query this replaced flattened its pages on every render,
 * so any keystroke in a form re-sorted and re-clustered thousands of events.)
 * On cold start the last copy on the device paints first (timeline-store.ts).
 */
export function useTimelineEvents() {
  const { token, serverUrl, signOut } = useSession();

  const query = useQuery<TimelineEvent[], Error>({
    queryKey: queryKeys.timelineEvents,
    queryFn: async () => {
      if (!token || !serverUrl) throw new ApiError(401, "unauthorized");
      try {
        return await api.timelineEvents({ token, serverUrl });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) await signOut();
        throw err;
      }
    },
    enabled: Boolean(token && serverUrl),
    staleTime: 1000 * 60 * 2,
  });

  const events = query.data ?? NO_EVENTS;
  const { refetch } = query;
  const refresh = useCallback(async () => (await refetch()).data ?? NO_EVENTS, [refetch]);

  return {
    events,
    loading: query.isPending && events.length === 0,
    isFetching: query.isFetching,
    error: query.error ? query.error.message || "error" : null,
    refresh,
    refetch,
  };
}
