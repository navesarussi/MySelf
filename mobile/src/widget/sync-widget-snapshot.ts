import { buildWidgetSnapshot, type WidgetHomeInput } from "@/lib/widget-snapshot";
import type { HomePayload } from "../api/resources";
import { writeWidgetSnapshotJson, reloadHomeWidgetTimelines } from "../native/widget-bridge";
import { queryClient, queryKeys } from "../query";

export async function syncWidgetSnapshot(args: {
  signedIn: boolean;
  home: HomePayload | null;
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
  });
  await writeWidgetSnapshotJson(JSON.stringify(snap));
  await reloadHomeWidgetTimelines();
}

export function syncWidgetFromHomeCache(signedIn: boolean): void {
  const home = queryClient.getQueryData<HomePayload>(queryKeys.home) ?? null;
  void syncWidgetSnapshot({ signedIn, home }).catch(() => {});
}
