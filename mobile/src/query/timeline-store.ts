import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TimelineEvent } from "@/lib/types";
import { queryClient } from "./client";
import { queryKeys } from "./keys";
import { persister } from "./persist";

/**
 * The timeline, kept on the device between launches.
 *
 * It is left out of the main persisted cache (persist.ts) because that cache is
 * rewritten as one JSON blob on every change of any query, and thousands of
 * events would ride along each time. Here it has its own key, written only
 * when the timeline itself changes, so the screen opens with the last known
 * events at once and refreshes in the background.
 */

const STORAGE_KEY = "myself.timeline.v1";
const SAVE_DELAY_MS = 1500;

type Stored = { savedAt: number; events: TimelineEvent[] };

/** Seed the timeline query from the device, unless a fetch already filled it. */
export async function hydrateTimelineCache(): Promise<void> {
  if (queryClient.getQueryData(queryKeys.timelineEvents)) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw) as Stored;
    if (!Array.isArray(stored.events)) return;
    // A fetch may have landed while storage was being read; fresher data wins.
    if (queryClient.getQueryData(queryKeys.timelineEvents)) return;
    queryClient.setQueryData(queryKeys.timelineEvents, stored.events, { updatedAt: stored.savedAt });
  } catch {
    // A corrupt or missing copy only costs the instant first paint.
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let subscribed = false;

/** Write the timeline to the device whenever it changes (debounced). Idempotent. */
export function startTimelinePersistence(): void {
  if (subscribed) return;
  subscribed = true;
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.query.queryKey[0] !== queryKeys.timelineEvents[0]) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const events = queryClient.getQueryData<TimelineEvent[]>(queryKeys.timelineEvents);
      if (!events) return;
      const stored: Stored = {
        savedAt: queryClient.getQueryState(queryKeys.timelineEvents)?.dataUpdatedAt ?? Date.now(),
        events,
      };
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored)).catch(() => {});
    }, SAVE_DELAY_MS);
  });
}

/**
 * Forget everything cached for the signed-out account: in memory, the main
 * persisted cache, and the timeline copy. Without this the next account to
 * sign in on the device was shown the previous account's data until each
 * screen refetched.
 */
export async function clearAccountCaches(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  queryClient.clear();
  await Promise.all([
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {}),
    Promise.resolve(persister.removeClient()).catch(() => {}),
  ]);
}
