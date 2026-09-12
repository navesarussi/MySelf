import { queryClient } from "./client";
import { queryKeys } from "./keys";
import { api } from "../api/resources";
import type { ApiConfig } from "../api/client";

/** Warm Home/Habits so the first tab switch is a cache hit. */
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
}
