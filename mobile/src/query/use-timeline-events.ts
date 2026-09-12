import { useCallback, useEffect } from "react";
import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import { useSession } from "../session";
import { ApiError, type ApiConfig } from "../api/client";
import { api, type TimelineEventsPage } from "../api/resources";
import { queryKeys } from "./keys";
import { flattenTimelinePages } from "./timeline-cache";

/**
 * Paginated timeline events — first page paints quickly; remaining pages load in the background.
 */
export function useTimelineEvents() {
  const { token, serverUrl, signOut } = useSession();
  const sessionReady = Boolean(token && serverUrl);

  const query = useInfiniteQuery<
    TimelineEventsPage,
    Error,
    InfiniteData<TimelineEventsPage>,
    typeof queryKeys.timelineEvents,
    string | undefined
  >({
    queryKey: queryKeys.timelineEvents,
    queryFn: async ({ pageParam }) => {
      if (!token || !serverUrl) throw new ApiError(401, "unauthorized");
      const config: ApiConfig = { token, serverUrl };
      try {
        return await api.timelineEventsPage(config, {
          cursor: pageParam,
          limit: 1500,
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          await signOut();
        }
        throw err;
      }
    },
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: sessionReady,
  });

  const { hasNextPage, isFetchingNextPage, isPending, fetchNextPage, dataUpdatedAt } = query;

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isPending) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, isPending, fetchNextPage, dataUpdatedAt]);

  const events = flattenTimelinePages(query.data);
  const loading = query.isPending && events.length === 0;

  const refresh = useCallback(async () => {
    const res = await query.refetch();
    return flattenTimelinePages(res.data);
  }, [query]);

  const errorMessage = query.error
    ? query.error instanceof Error
      ? query.error.message
      : "error"
    : null;

  return {
    events,
    loading,
    isFetching: query.isFetching,
    isFetchingMore: query.isFetchingNextPage,
    hasMore: query.hasNextPage ?? false,
    error: errorMessage,
    refresh,
    refetch: query.refetch,
  };
}
