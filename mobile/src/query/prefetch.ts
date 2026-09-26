import { queryClient } from "./client";
import { queryKeys } from "./keys";
import { fetchTradingEquity } from "./use-trading-equity";
import { hydrateTimelineCache, startTimelinePersistence } from "./timeline-store";
import { api } from "../api/resources";
import type { ApiConfig } from "../api/client";
import { defaultTasksFilter } from "../components/tasks-filter-bar";
import { ALL_FILTER } from "@/lib/i18n/types";

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

function defaultTaskParams() {
  const f = defaultTasksFilter();
  return {
    status: f.status.join(","),
    sort: f.sort,
  };
}

/** Warm main-tab queries so the first navigation is usually a cache hit. */
export function prefetchAppShell(config: ApiConfig) {
  void queryClient.prefetchQuery({ queryKey: queryKeys.home, queryFn: () => api.home(config) });
  void queryClient.prefetchQuery({ queryKey: queryKeys.habits, queryFn: () => api.habits(config) });
  void queryClient.prefetchQuery({ queryKey: queryKeys.projects, queryFn: () => api.projects(config) });
  void queryClient.prefetchQuery({ queryKey: queryKeys.relationships, queryFn: () => api.relationships(config) });
  void queryClient.prefetchQuery({ queryKey: queryKeys.goals, queryFn: () => api.goals(config) });
  void queryClient.prefetchQuery({ queryKey: queryKeys.commitments, queryFn: () => api.commitments(config) });
  void queryClient.prefetchQuery({ queryKey: queryKeys.library({}), queryFn: () => api.library(config, {}) });
  void queryClient.prefetchQuery({
    queryKey: queryKeys.tasks(defaultTaskParams()),
    queryFn: () => api.tasks(config, defaultTaskParams()),
  });
  void queryClient.prefetchQuery({
    queryKey: queryKeys.financePlan(monthKey()),
    queryFn: () => api.financePlan(config, monthKey()),
  });
  // Last copy from the device first, then refresh it if stale — in that order,
  // so a fast network answer is never overwritten by the older stored one.
  startTimelinePersistence();
  void hydrateTimelineCache().finally(() =>
    queryClient.prefetchQuery({
      queryKey: queryKeys.timelineEvents,
      queryFn: () => api.timelineEvents(config),
      staleTime: 1000 * 60 * 2,
    })
  );
  void queryClient.prefetchQuery({ queryKey: queryKeys.periods, queryFn: () => api.periods(config) });
  void queryClient.prefetchQuery({ queryKey: queryKeys.tradingEquity, queryFn: () => fetchTradingEquity(config) });
  void queryClient.prefetchQuery({ queryKey: queryKeys.tradingDashboard, queryFn: () => api.tradingDashboard(config) });
  void queryClient.prefetchQuery({
    queryKey: queryKeys.tradingTriggersFeed,
    queryFn: () => api.tradingTriggers(config, undefined),
  });
  void queryClient.prefetchQuery({
    queryKey: queryKeys.tradingEventsFeed,
    queryFn: () => api.tradingEvents(config, 30),
  });
}
