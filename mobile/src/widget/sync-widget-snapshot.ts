import { useEffect } from "react";
import { buildWidgetSnapshot, type WidgetHomeInput } from "@/lib/widget-snapshot";
import { fmtUsd } from "@/lib/trading/format";
import type { HomePayload } from "../api/resources";
import type { TradingEquitySnapshot } from "@/lib/trading/types-client";
import { writeWidgetSnapshotJson, reloadHomeWidgetTimelines } from "../native/widget-bridge";
import { queryClient, queryKeys } from "../query";

export async function syncWidgetSnapshot(args: {
  signedIn: boolean;
  home: HomePayload | null;
  tradingEquity?: TradingEquitySnapshot | null;
}): Promise<void> {
  const homeInput: WidgetHomeInput | null = args.home
    ? {
        habits: args.home.habits,
        relationships: args.home.relationships,
        openTasks: args.home.openTasks,
        openTasksCount: args.home.openTasksCount,
        inProgressTasksCount: args.home.inProgressTasksCount,
        recentEvents: args.home.recentEvents,
        eventsMode: args.home.eventsMode,
        financeUncategorizedCount: args.home.financeUncategorizedCount,
        urgentFinance: args.home.urgentFinance ?? null,
        activeGoals: args.home.activeGoals,
      }
    : null;
  const snap = buildWidgetSnapshot({
    signedIn: args.signedIn,
    now: new Date(),
    home: homeInput,
    tradingEquityLabel: args.tradingEquity ? fmtUsd(args.tradingEquity.equity) : null,
  });
  await writeWidgetSnapshotJson(JSON.stringify(snap));
  await reloadHomeWidgetTimelines();
}

export function syncWidgetFromHomeCache(signedIn: boolean): void {
  const home = queryClient.getQueryData<HomePayload>(queryKeys.home) ?? null;
  const tradingEquity = queryClient.getQueryData<TradingEquitySnapshot | null>(queryKeys.tradingEquity) ?? null;
  void syncWidgetSnapshot({ signedIn, home, tradingEquity }).catch(() => {});
}

function isWidgetSourceQueryKey(key: readonly unknown[]): boolean {
  if (key.length === 1 && key[0] === queryKeys.home[0]) return true;
  return key.length === 2 && key[0] === "trading" && key[1] === "equity";
}

/**
 * Keep the iOS home widget aligned with every home-cache write (prefetch,
 * Home tab, Habits/Tasks optimistic patches, finance categorize, etc.).
 */
export function useWidgetHomeQuerySync(signedIn: boolean): void {
  useEffect(() => {
    if (!signedIn) {
      void syncWidgetSnapshot({ signedIn: false, home: null }).catch(() => {});
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => syncWidgetFromHomeCache(true), 200);
    };

    if (queryClient.getQueryData(queryKeys.home)) schedule();

    const unsub = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated") return;
      const key = event.query.queryKey;
      if (!Array.isArray(key) || !isWidgetSourceQueryKey(key)) return;
      schedule();
    });

    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [signedIn]);
}
