import { queryClient } from "./client";
import { queryKeys } from "./keys";
import { api } from "../api/resources";
import type { ApiConfig } from "../api/client";

/** Warm Home/Habits/Timeline page 1 so the first tab switch is a cache hit. */
export function prefetchAppShell(config: ApiConfig) {
  void queryClient.prefetchQuery({
    queryKey: queryKeys.home,
    queryFn: () => api.home(config),
  });
  void queryClient.prefetchQuery({
    queryKey: queryKeys.habits,
    queryFn: () => api.habits(config),
  });
  void queryClient.prefetchQuery({
    queryKey: queryKeys.projects,
    queryFn: () => api.projects(config),
  });
  void queryClient.prefetchInfiniteQuery({
    queryKey: queryKeys.timelineEvents,
    queryFn: ({ pageParam }) =>
      api.timelineEventsPage(config, {
        cursor: pageParam as string | undefined,
        limit: 1500,
      }),
    initialPageParam: undefined,
  });
  void queryClient.prefetchQuery({
    queryKey: queryKeys.periods,
    queryFn: () => api.periods(config),
  });
}
